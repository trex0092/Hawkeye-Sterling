# Code Review: sapientinc/HRM

**Repository:** https://github.com/sapientinc/HRM  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

HRM (Hierarchical Reasoning Model) is a recurrent neural architecture for complex reasoning tasks. It uses two interdependent modules — a high-level (H) planning unit and a low-level (L) computation unit — operating at different timescales, combined with Adaptive Computation Time (ACT) controlled by Q-learning. With 27M parameters and 1,000 training samples, it achieves strong results on Sudoku, maze solving, and ARC-AGI benchmarks.

The codebase is research-quality: well-structured, uses modern PyTorch patterns (FlashAttention, `torch.compile`, distributed training), and contains genuinely novel elements (the Q-learning halt mechanism, `stablemax` loss). The main weaknesses are typical of research code: limited documentation, a few numerical stability concerns, and reproducibility gaps.

---

## Strengths

### 1. Clean Separation of Concerns

The architecture is split cleanly across files:
- `layers.py` — reusable primitives (attention, SwiGLU, RoPE, CastedLinear)
- `models/hrm/hrm_act_v1.py` — the HRM architecture
- `losses.py` — loss heads decoupled from the model
- `pretrain.py` — training loop, fully separate from architecture

This is better separation than most research codebases, which tend to interleave model, loss, and training logic.

### 2. `stablemax` Loss Function

`losses.py` implements a custom `stablemax` activation:

```python
def s(x, epsilon=1e-30):
    return torch.where(x < 0, 1/(1 - x + epsilon), x + 1)
```

This is a numerically-motivated alternative to softmax that avoids exp overflow for large logits. The `log_stablemax` function operates in float64 (`logits.to(torch.float64)`) to maintain precision. This is a thoughtful design choice for training stability.

### 3. Dual Optimizer Strategy

The training loop uses two separate optimizers:
- `CastedSparseEmbeddingSignSGD_Distributed` for puzzle embeddings (sparse, with custom gradient handling)
- `AdamATan2` for the main model parameters (a numerically stable Adam variant)

Separating embedding optimization from main model optimization is a well-established technique for handling large sparse embedding tables efficiently. Using `AdamATan2` instead of standard Adam is a recent research direction for improved training stability.

### 4. Distributed Training Is First-Class

`pretrain.py` handles both single-GPU and multi-GPU (NCCL) training with a clean rank/world_size abstraction. Config broadcasting via `dist.broadcast_object_list` ensures all ranks use identical configuration. Manual gradient `all_reduce` before optimizer steps is correct for DDP without `DistributedDataParallel` wrapping.

### 5. FlashAttention with Fallback

```python
try:
    from flash_attn_interface import flash_attn_func
except ImportError:
    from flash_attn import flash_attn_func
```

Supports both FlashAttention v2 and v3 interfaces with a clean fallback. The v3 interface is preferred (faster on H100/H200) while maintaining v2 compatibility.

---

## Issues and Concerns

### 1. Q-Learning Halt Mechanism Is Undertested

**Severity: Medium–High**

The ACT halting mechanism uses Q-learning: a `q_halt` head predicts whether the current answer is correct, and the model halts when `q_halt_logits >= 0`. The loss:

```python
q_halt_loss = F.binary_cross_entropy_with_logits(
    outputs["q_halt_logits"], seq_is_correct.to(...), reduction="sum"
)
```

...trains the halt head to predict sequence-level correctness. However, `seq_is_correct` is computed at the current step (before halting), which means the halt head receives the correctness signal *for the step it just produced*, not for whether halting *at this step* is optimal. If the model would improve with more steps, `seq_is_correct=False` at step N doesn't mean it should continue — it means it hasn't converged yet. This is a subtle credit-assignment issue.

The `q_continue_loss` bootstrapping target partially addresses this but is only applied conditionally (`if "target_q_continue" in outputs`), and the interaction between the two losses isn't documented.

**Recommendation:** Add ablation results comparing fixed-step (no ACT) vs. Q-halt vs. simpler halting criteria (e.g., logit confidence threshold) to validate that Q-learning specifically improves results.

### 2. Carry State Accumulates Across Batches During Training

**Severity: Medium**

In `pretrain.py`:

```python
if train_state.carry is None:
    with torch.device("cuda"):
        train_state.carry = train_state.model.initial_carry(batch)

train_state.carry, loss, metrics, _, _ = train_state.model(
    carry=train_state.carry, batch=batch, ...
)
```

The carry state is initialized once and then passed across successive batches. This means later batches in the training loop are conditioned on the carry state from earlier (unrelated) batches. For the recurrent reasoning model to generalize, it should ideally start from a fresh carry for each problem. The evaluation loop correctly re-initializes carry per sample:

```python
with torch.device("cuda"):
    carry = train_state.model.initial_carry(batch)
```

This training/eval discrepancy could cause train/eval performance gaps that are hard to diagnose.

### 3. `stablemax` Numerical Concern at x=0

**Severity: Low–Medium**

```python
def s(x, epsilon=1e-30):
    return torch.where(x < 0, 1/(1 - x + epsilon), x + 1)
```

At `x=0`, `s(0) = 1` from the positive branch (`x + 1`). This is correct. However, `1e-30` as epsilon is effectively zero in float32 (which has ~1.18e-38 min normal, but the epsilon is added to `1 - x`, so for `x` near 1.0, `1 - x ≈ 0` and the denominator becomes `epsilon = 1e-30`, which rounds to 0 in float32). The function operates in float64 for loss computation, so this is safe in practice — but it's fragile if the dtype ever changes or the function is reused elsewhere.

**Recommendation:** Document the float64 requirement in the function docstring, and consider using `epsilon=1e-15` (safe for float64) to be explicit.

### 4. `CastedLinear` Uses Unusual Initialization

**Severity: Low**

```python
self.weight = nn.Parameter(
    trunc_normal_init_(torch.empty((out_features, in_features)), std=1.0 / (in_features ** 0.5))
)
```

Using `std = 1/sqrt(in_features)` is equivalent to Kaiming initialization with gain=1.0, which is appropriate for linear layers. However, this differs from the PyTorch default (`kaiming_uniform_`) and from typical transformer initialization (`std=0.02`). The interaction with the `AdamATan2` optimizer's scale-invariance properties is not documented.

### 5. No Requirements File or Environment Setup

**Severity: Medium**

The repository has no `requirements.txt`, `pyproject.toml`, or `environment.yml`. Dependencies like `adam_atan2`, `coolname`, `flash_attn`, `hydra`, and `pydantic` must be inferred from imports. For a research repository with unusual dependencies (`adam_atan2` is a non-standard package), this significantly increases reproducibility friction.

**Recommendation:** Add a `requirements.txt` with pinned versions, or a `pyproject.toml` with version ranges. At minimum, add a README section listing the install commands.

### 6. Manual Gradient All-Reduce Without Loss Scaling

**Severity: Low**

```python
if world_size > 1:
    for param in train_state.model.parameters():
        if param.grad is not None:
            dist.all_reduce(param.grad)
```

This reduces gradients but does not divide by `world_size`. Combined with the `(1 / global_batch_size) * loss` scaling in `train_batch`, the effective learning rate scales with `world_size` — each rank applies the full summed gradient, not the averaged gradient. Whether this is intentional (linear scaling rule) or a bug depends on optimizer and LR configuration, but it is not documented.

---

## Architectural Observations

### Hierarchical Recurrence Is Well-Motivated

The two-timescale design (H cycles run slower than L cycles) maps naturally to the planning/execution decomposition in cognitive science and provides a principled way to decouple high-level search from local computation. The architecture is similar in spirit to the Clockwork RNN but uses transformer-style attention blocks rather than vanilla RNNs.

### ACT via Q-Learning Is Novel

Most ACT implementations use a ponder cost (Graves 2016) or confidence thresholds to determine halting. Using Q-learning to predict answer correctness as the halting signal is a genuine novelty that ties computation depth to answer quality rather than to a hyperparameter ponder cost.

### 27M Parameters Is Impressively Small

Achieving competitive ARC-AGI performance at 27M parameters without chain-of-thought data is the headline result. The small parameter count makes the model tractable for academic reproducibility, which is a significant practical advantage over larger reasoning models.

---

## What Can We Get From This Project

1. **Architectural pattern**: The two-level (H/L) recurrent state design is directly reusable for any task requiring iterative refinement with multi-scale planning.
2. **Halt-as-quality-signal**: Using Q-learning to predict answer correctness as the halting criterion is a transferable technique for any adaptive-compute setting.
3. **`stablemax` loss**: Drop-in replacement for softmax cross-entropy that avoids exp overflow; reusable in other settings.
4. **Puzzle evaluation framework**: The dataset (`PuzzleDataset`), visualizer (`puzzle_visualizer.html`), and evaluation loop are reusable for Sudoku/maze/ARC research.
5. **Training infrastructure**: The Hydra + Pydantic + W&B + DDP pattern in `pretrain.py` is a clean template for distributed ML training.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Architecture novelty | Excellent | Q-halt, two-timescale recurrence |
| Code organization | Very Good | Clean layer/model/loss/train separation |
| Distributed training | Good | Manual DDP, potential LR scaling issue |
| Reproducibility | Poor | No requirements file, carry-state train/eval mismatch |
| Documentation | Fair | No docstrings, no architecture diagram in code |
| Loss design | Good | stablemax is thoughtful; halt loss credit assignment is unclear |

---

## Recommendation

Research-grade codebase with genuine novelty. The Q-learning halt mechanism and hierarchical recurrence are the two most transferable ideas. The main blockers for external reproducibility are the missing requirements file and the train/eval carry state discrepancy. These should be fixed before publication of associated code.

**Suggested priority fixes:**
1. Add `requirements.txt` with pinned versions
2. Re-initialize carry state at the start of each training batch (fix train/eval discrepancy)
3. Document the all-reduce gradient averaging intent (intentional sum vs. average)
4. Add ablation comparing Q-halt to fixed-step and confidence-threshold halting
