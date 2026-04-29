# Code Review: IBM/TabFormer

**Repository:** https://github.com/IBM/TabFormer  
**Stars:** 363 | **License:** Apache 2.0  
**Paper:** ICASSP 2021 — "Tabular Transformers for Modeling Multivariate Time Series"  
**Review Date:** 2026-04-27  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

TabFormer applies BERT and GPT-2 transformer architectures to tabular transaction sequences — treating each transaction as a "sentence" of field-value "tokens". It introduces hierarchical transformers: a field-level transformer captures intra-transaction field relationships, and a sequence-level transformer captures inter-transaction temporal patterns. Pre-trained on 24M synthetic credit card transactions using Masked Language Modelling (BERT) or causal next-token prediction (GPT-2). Built on HuggingFace Transformers. License is Apache 2.0.

For Hawkeye Sterling, TabFormer is the **behavioural baseline pre-trainer**: it learns a deep representation of what "normal" transaction sequences look like for a customer, which can then be fine-tuned or anomaly-scored to detect structuring, velocity spikes, and pattern drift.

---

## What the Tool Does

```
Input: sequence of transactions (per user)
    Each transaction = [amount, merchant_type, time_delta, country, ...]
    ↓
TabFormer (HuggingFace Transformers)
    ├── Field-level Transformer
    │   (embeds and contextualises within-transaction field interactions)
    ├── Sequence-level Transformer
    │   (models temporal patterns across the transaction history)
    ├── Modified Adaptive Softmax (handles field-specific vocabularies)
    └── Modified DataCollator (tabular-aware masking)
    ↓
Pre-trained model → fine-tune for:
    ├── Fraud detection (binary classification head)
    ├── Anomaly scoring (reconstruction error or next-token perplexity)
    └── Behavioural embeddings (per-user representations)
```

**Two variants:**
- **Tabular BERT**: MLM pre-training (masks random fields, predicts them)
- **Tabular GPT-2**: Causal LM (predicts next transaction field given history)

---

## Strengths

### 1. Transactions as Sequences — The Correct Abstraction for AML

AML patterns are inherently sequential: structuring involves a series of sub-threshold transactions over days or weeks; layering unfolds over multiple hops across different accounts. A model that sees each transaction in isolation misses the temporal pattern. TabFormer's sequence-level transformer captures exactly this.

### 2. Field-Level Embeddings Preserve Tabular Semantics

Rather than concatenating all fields into a flat feature vector, TabFormer embeds each field separately (amount, merchant category, hour, country) with its own embedding vocabulary, then applies a field-level transformer to model within-transaction interactions. This preserves the semantic meaning of each field and avoids the mixed-scale problems of naive feature concatenation.

### 3. BERT Pre-Training = Unsupervised Normal Behaviour Learning

MLM pre-training does not require fraud labels. The model learns to predict masked fields (e.g., "what amount would a typical transaction at this merchant category at this time have?") from the context of surrounding transactions. Unusual transactions that are hard to predict → high reconstruction error → anomaly signal. This is directly applicable to unsupervised AML detection without needing labelled SARs.

### 4. Per-User GPT-2 Mode

GPT-2 in per-user mode (`--user_ids`) trains a causal language model on a single customer's transaction history. This creates a personalised behavioural baseline: a transaction that is abnormal relative to *this customer's* history, not the population average. This is the correct approach for detecting account takeover and insider threat — where the anomaly is relative to the individual, not the population.

### 5. 24M Synthetic Transaction Dataset Included

The repository includes a 24M record synthetic credit card transaction dataset with 12 fields. While synthetic, this provides a realistic pre-training corpus that is available immediately without data sharing agreements.

### 6. Apache 2.0 Licence

No restrictions on commercial use or modification.

---

## Issues and Concerns

### 1. Stale Dependencies — HuggingFace 3.2.0 Is 4 Years Old

**Severity: Medium**

The required HuggingFace Transformers version is **3.2.0** (2020). The current version is 4.40+ (2026). The API changed substantially between 3.x and 4.x — trainer loops, data collator signatures, tokenizer interfaces. The code is unlikely to run on current HuggingFace without porting.

**Recommendation:** Port the data collator and model wrapper to HuggingFace 4.x before using. The core transformer architecture (BERT/GPT-2) is standard and unchanged — only the glue code needs updating.

### 2. Python 3.7 + PyTorch 1.6–1.7 Stack

**Severity: Medium**

The setup.yml specifies Python 3.7 (EOL) and PyTorch 1.7.1. Modernising to Python 3.12 + PyTorch 2.x is required for production deployment.

### 3. No Built-In Anomaly Scoring Interface

**Severity: Medium**

TabFormer provides a pre-training framework but does not provide a ready-made anomaly scorer. Extracting reconstruction error or next-token perplexity as an anomaly signal requires implementing a custom scoring head on top of the pre-trained model.

**Recommendation:** After pre-training, add a simple perplexity scorer:
```python
# Anomaly score = mean negative log-likelihood of masked fields
with torch.no_grad():
    outputs = model(input_ids=tokens, labels=tokens)
    anomaly_score = outputs.loss.item()  # higher = more anomalous
```

### 4. No Fine-Tuning Examples on Real Fraud Labels

**Severity: Low–Medium**

The repository demonstrates pre-training but not supervised fine-tuning for fraud detection. There is no example of adding a classification head, freezing the pre-trained weights, and fine-tuning on labelled fraud data.

### 5. Dataset Is Synthetic — Transfer to Real Transactions Unvalidated

**Severity: Low**

The 24M transaction dataset is synthetically generated. Transfer learning from synthetic to real banking transaction data is not validated. Domain shift between synthetic and real transactions may reduce the pre-trained model's utility.

---

## Integration for Hawkeye Sterling

```
Historical transaction data (per customer, 12+ months)
    ↓ tokenisation (amount buckets, merchant category codes, hour bins)
TabFormer pre-training (BERT MLM, unsupervised)
    ↓
Pre-trained TabFormer model
    ├── Anomaly scoring: perplexity per transaction
    │   → high perplexity → flag for review
    ├── Behavioural embedding: per-customer vector
    │   → cluster similar customers → flag outlier clusters
    └── Fine-tune on SAR-labelled transactions
        → binary fraud classifier
    ↓
src/brain/behavioral_pattern_mode.ts
    ├── Perplexity score → structuring signal (unusual sequence pattern)
    └── Embedding drift → account takeover signal
```

| TabFormer Component | HS Module | AML Use |
|--------------------|-----------|---------|
| BERT MLM pre-training | Offline model training | Unsupervised normal behaviour model |
| GPT-2 per-user | Offline model training | Personalised behavioural baseline |
| Perplexity scoring | `src/brain/` | Structuring/velocity anomaly signal |
| Behavioural embeddings | `src/brain/` | Customer similarity clustering |

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Core architecture | Excellent | Hierarchical transformer is the right abstraction |
| Behavioural modelling | Excellent | Sequence-level temporal pattern capture |
| Unsupervised pre-training | Very Good | MLM on transactions — no labels required |
| Stack freshness | Poor | HuggingFace 3.2.0, PyTorch 1.7 — needs porting |
| Anomaly scoring | Fair | Not built-in; requires custom scoring head |
| License | Excellent | Apache 2.0 |
| HS fit | ★★★ | Behavioural baseline pre-trainer — port to HuggingFace 4.x |

---

## Recommendation

**Port to HuggingFace 4.x and adopt as the behavioural sequence pre-trainer.** The architecture is sound and the core concept (transactions as sequences, field-level embeddings, BERT/GPT-2 pre-training) is directly applicable to AML behavioural modelling. The main work is updating the HuggingFace API calls from 3.2.0 to 4.x — the model architecture itself is standard and portable. Pre-train on customer transaction histories, then use perplexity scoring as an unsupervised anomaly signal for structuring and velocity pattern detection.
