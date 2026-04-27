# Code Review: yicheng-w/CommonSenseMultiHopQA

**Repository:** https://github.com/yicheng-w/CommonSenseMultiHopQA  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

This is the official code release for "Commonsense for Generative Multi-Hop Question Answering Tasks" (EMNLP 2018). The system augments a pointer-generator reading-comprehension model with ConceptNet commonsense knowledge to improve performance on NarrativeQA (generative) and WikiHop (multiple-choice). It achieves 51.70 ROUGE-L on NarrativeQA and 58.5% accuracy on WikiHop.

This is a research artifact — not a maintained library. The codebase reflects 2018 practices: Python 2, TensorFlow 1.3, ELMo embeddings, and hand-rolled training loops. The review is therefore framed around what can be learned from the approach and what would need updating to reuse any of it today.

---

## What the System Does

The core architecture (`model_commonsense_nqa.py`) is a multi-hop bidirectional attention model with:

1. **ELMo contextual embeddings** for both context passages and questions
2. **Multi-hop attention** with iterative refinement — the model re-reads the passage multiple times, each pass conditioned on the previous attention distribution
3. **ConceptNet injection** — for entities in the question/passage, commonsense relation vectors are retrieved from ConceptNet and fused into the representation via a gated projection
4. **Pointer-generator decoder** — generates answers token by token, with the ability to copy tokens directly from the source passage (handles out-of-vocabulary words)
5. **BiDAF-style attention** — bidirectional attention flow between question and context

The class name `GatedMultiBidaf_ResSA_ELMo_PtrGen_CS_1_fix_path_concat_project_w_rels` is a full description of the architecture encoded as a Python identifier — a common research-code practice that prioritizes traceability over readability.

---

## Strengths

### 1. Honest Ablation Design

The four model variants (`baseline_nqa`, `commonsense_nqa`, `baseline_wh`, `commonsense_wh`) are clean ablations: the only difference between baseline and commonsense variants is the ConceptNet knowledge injection. This allows direct measurement of what commonsense knowledge contributes, independent of other architectural choices. The reported accuracy gains are attributable to the specific mechanism under study.

### 2. Pointer-Generator for OOV Handling

Using a pointer-generator network for NarrativeQA (a *generative* QA task) is the correct architecture choice. NarrativeQA answers often require copying named entities, numbers, and proper nouns directly from the source text. A pure vocabulary-based decoder would systematically fail on these. The copy mechanism addresses this at the architecture level rather than with post-processing heuristics.

### 3. Gated Knowledge Fusion

Rather than concatenating ConceptNet vectors directly (which would let the model learn to ignore them), the commonsense injection uses a learned gate that controls how much commonsense information flows into each position. This is a standard pattern from the memory network literature, and it's the right choice — it lets the model learn when commonsense is relevant vs. when it's noise.

### 4. Structured Evaluation Pipeline

`main.py` evaluates with BLEU, METEOR, CIDEr, and ROUGE simultaneously for NarrativeQA, and accuracy + substring matching for WikiHop. The `pycocoevalcap` integration (borrowed from image captioning evaluation) gives access to the standard NLP generation metrics without reimplementing them. This is pragmatic reuse.

---

## Issues and Concerns

### 1. Python 2 and TensorFlow 1.3 Are End-of-Life

**Severity: Critical for reuse**

The codebase is Python 2 only (`print` statements without parentheses, Python 2 `unicode`/`str` handling, TF 1.3 session-based API). Python 2 reached end-of-life in January 2020. TensorFlow 1.x is no longer supported and is incompatible with modern hardware drivers (CUDA 12+, H100/A100 GPUs). Running this code today requires:

- A legacy Python 2.7 environment
- TensorFlow 1.3.0 GPU wheels (only available for CUDA 8/9)
- NumPy 1.14, SciPy 1.0 (both years out of date)

This is not unusual for a 2018 EMNLP paper release, but it means the code cannot run on any modern GPU without a containerized legacy environment.

**Recommendation for reuse:** The architectural ideas (gated commonsense fusion, multi-hop attention, pointer-generator) are sound and worth reimplementing in PyTorch with a modern BERT/RoBERTa backbone rather than trying to port the TF 1.3 code.

### 2. ELMo Dependency Is Obsolete

**Severity: High for reuse**

The system uses ELMo (2018) as its primary contextual representation. ELMo has been superseded by BERT (2018), RoBERTa (2019), and the entire transformer pre-training paradigm. The architecture's ELMo component is deeply integrated — it's used in both the encoder (`bilm_model`) and to generate context-specific features for the attention mechanism.

The performance ceiling of this system is limited by ELMo's representational quality. A straightforward replacement of ELMo with a modern encoder would likely produce larger gains than the commonsense injection itself produces over the ELMo baseline.

### 3. No Documented Reproducibility

**Severity: Medium**

The README provides setup instructions and download links for pre-trained models, but:
- The ConceptNet relation extraction process is not documented — it's unclear which ConceptNet version was used, how entities were linked, and what preprocessing was applied.
- The `lm_data/` directory (pre-computed ELMo representations) is expected to exist but its generation is not scripted.
- The setup.sh installs dependencies but doesn't document expected environment (OS, CUDA version, GPU memory requirements).

For a published paper release, the inability to reproduce results from scratch without access to pre-computed intermediates is a significant gap.

### 4. Hardcoded Paths and Magic Numbers

**Severity: Low–Medium**

`config.py` and `main.py` contain hardcoded paths, vocabulary sizes, and training hyperparameters. Values like learning rates, dropout rates, and attention dimensions appear as literal numbers in model constructors rather than as named configuration parameters. Reproducing experiments with different hyperparameters requires code changes rather than config changes.

### 5. `pycocoevalcap` Is Vendored Without Version Pin

**Severity: Low**

The `src/pycocoevalcap/` directory is a vendored copy of the COCO evaluation library. The version vendored, API compatibility, and any local modifications are not documented. If the upstream library changed its API, it's impossible to tell whether this vendored copy matches without diffing against upstream.

---

## Architectural Insights (Transferable to Modern Work)

Despite the dated stack, several ideas remain relevant:

### Multi-Hop Attention Still Applies
Iterative re-reading (running the attention mechanism multiple times, each pass conditioned on the previous) is a precursor to modern chain-of-thought and scratchpad approaches. The key insight — that a single forward pass may not be sufficient for questions that require synthesizing multiple pieces of evidence — is validated by later work on multi-hop reasoning.

### Gated External Knowledge Fusion
The gated ConceptNet injection pattern generalizes to any external knowledge source: knowledge graphs, retrieved passages, structured databases. The gate learns when external knowledge is helpful vs. noisy. This is architecturally equivalent to modern cross-attention over retrieved documents in RAG systems.

### Task-Specific Architecture Still Wins for Narrow Benchmarks
This system outperforms generic neural models because it was designed for the specific structure of multi-hop QA. Modern foundation models often close this gap, but for production AML/compliance applications with narrow task definitions and scarce labeled data, task-specific architectural inductive biases remain valuable.

---

## Relevance to Hawkeye-Sterling

| Concept | Application to Hawkeye Sterling | Effort |
|---------|--------------------------------|--------|
| **Gated knowledge fusion** | Inject sanctions/PEP list facts into screening reasoning as a gated external knowledge source | High — requires modern reimplementation |
| **Multi-hop attention** | Multi-pass evidence synthesis for complex beneficial ownership chains | High — architectural decision |
| **Pointer-generator** | Extract entity names, addresses, dates directly from source documents during adverse-media analysis | Medium — available in modern seq2seq frameworks |
| **ConceptNet-style relation injection** | Inject compliance typology graph (FATF typologies, DPMS KPIs) into reasoning as structured relational context | Medium — graph construction + attention |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Research contribution | Good | Gated commonsense fusion is a valid, clean ablation |
| Code quality (for 2018) | Fair | Readable but dense; class names encode architecture |
| Reproducibility | Poor | Pre-computed intermediates required; ConceptNet preprocessing undocumented |
| Modern usability | None | Python 2 + TF 1.3 — not runnable on current hardware without legacy container |
| Architectural ideas | Very Good | Multi-hop attention, gated fusion, pointer-generator all remain relevant |
| Documentation | Fair | README covers setup; internals are undocumented |

---

## Recommendation

Do not attempt to run or port this codebase directly — the Python 2 / TF 1.3 stack is too far from the current ecosystem for the effort to be worthwhile. The value lies in the *ideas*: gated external knowledge fusion, multi-hop attention, and the ablation methodology for isolating the contribution of structured knowledge. These are worth studying and reimplementing in a modern PyTorch + transformer-backbone stack if the use case warrants it.

For Hawkeye Sterling specifically, the gated knowledge injection pattern is the most applicable concept — it offers a principled way to incorporate structured compliance knowledge (sanctions lists, typology graphs, PEP databases) into the reasoning pipeline without forcing the model to rely on it when it's not relevant.
