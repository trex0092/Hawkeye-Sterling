# Code Review: JuliusBrussee/caveman

**Repository:** https://github.com/JuliusBrussee/caveman  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

Caveman is a Claude Code skill/plugin that compresses LLM output by ~65–87% by instructing agents to respond in terse, caveman-style prose. It supports multiple intensity levels (lite, full, ultra, wenyan), ships across 40+ agent platforms, includes a proper evaluation harness with real API benchmarks, and provides installation hooks for Claude Code's SessionStart and UserPromptSubmit events.

Overall this is a well-structured, thoughtfully-designed project. The eval methodology is notably rigorous for an open-source prompt-engineering tool.

---

## Strengths

### 1. Rigorous Evaluation Methodology

The `evals/` harness is the strongest part of the project. It tests three arms:

- **Baseline** — no system prompt
- **Terse control** — plain "Answer concisely."
- **Terse + skill** — the skill file on top of the terse instruction

Comparing skills against the terse control rather than raw baseline isolates the skill's actual contribution. This is methodologically honest and avoids inflating numbers by conflating generic brevity with skill-specific compression. The `measure.py` script reports median, mean, min, max, and stdev across prompts — not just an average — which surfaces whether results are consistent or noisy.

### 2. Clear Single Source of Truth

`skills/caveman/SKILL.md` is the canonical file. A CI workflow syncs it to all agent-specific locations (`caveman/SKILL.md`, `.cursor/skills/`, `plugins/caveman/skills/`, `caveman.skill`, etc.) on merge to main. This prevents config drift across platforms and makes contribution straightforward: edit one file, open a PR with before/after examples.

### 3. Security Awareness in Hooks

`caveman-mode-tracker.js` explicitly guards against symlink attacks when reading the flag file (`~/.claude/.caveman-active`). It validates file size and resolves paths carefully before reading content that enters the model's context. This is more security-conscious than typical Claude Code hook implementations.

`caveman-activate.js` also fails gracefully — non-critical failures like statusline detection do not block session startup.

### 4. Multi-Platform Coverage

The project reaches Claude Code (plugin), Cursor (`.cursor/rules/`), Windsurf, Copilot, Gemini CLI, Codex, and 40+ others through a unified `npx skills add` pathway. Cross-platform PowerShell/bash parity for the statusline scripts shows attention to Windows users.

### 5. Honest Tokenizer Disclosure

`measure.py` explicitly notes that tiktoken `o200k_base` is OpenAI's tokenizer and only approximates Claude's BPE — absolute token counts should be read as "approximate output-length reduction." This is an important caveat that many similar tools omit.

---

## Issues and Concerns

### 1. Single-Run Benchmarks (High Variance Risk)

**Severity: Medium**

`llm_run.py` runs each `(prompt, arm)` combination once. LLM outputs have non-trivial variance — a single run is not sufficient to establish stable compression ratios. `measure.py` even prints stdev, implicitly acknowledging per-prompt variance, but variance across runs (sampling noise) is not controlled for.

**Recommendation:** Run each arm at least 3–5 times with identical inputs and average the token counts, or use temperature=0 and document that assumption. Add a `--runs N` flag to `llm_run.py`.

### 2. Tokenizer Mismatch in Benchmarks

**Severity: Medium**

tiktoken `o200k_base` is used throughout for token counting, but the system under test is Claude. Anthropic uses a different tokenizer. This means reported token savings are not what users actually save on their Claude API bills. For a tool whose primary value proposition is token reduction, this gap matters.

**Recommendation:** Use the Anthropic API's token-counting endpoint (`POST /v1/messages/count_tokens`) for benchmarks, or at minimum report both tiktoken estimates and actual API token counts from the `usage` field in real API calls.

### 3. Flag File as Security Boundary

**Severity: Low–Medium**

The flag file at `~/.claude/.caveman-active` is read and injected into the model's context on every prompt. While symlink protections exist, the file is still user-writable and its content flows directly into the system prompt. A malicious process that can write to `~/.claude/` could inject arbitrary instructions into Claude's context.

**Recommendation:** Hash or sign the flag file content on write (in `caveman-activate.js`) and verify the signature on read (in `caveman-mode-tracker.js`). This makes the flag tamper-evident. At minimum, document this trust boundary explicitly in the security section of CLAUDE.md.

### 4. `plot.py` Duplicate Annotation Loop

**Severity: Low (Bug)**

In `plot.py`, the annotation loop that adds median labels above each boxplot is written twice:

```python
# First occurrence (line ~75)
for row in rows:
    fig.add_annotation(...)

# ... fig.update_layout(...) ...

# Second occurrence (line ~115)
for row in rows:
    fig.add_annotation(...)
```

This results in duplicate annotations stacked on each box. The second loop should be removed.

### 5. No Input Token Measurement

**Severity: Low**

The project focuses exclusively on *output* token reduction. However, caveman mode increases system prompt size (the SKILL.md content is injected every session), which increases *input* tokens. For cost optimization, the net effect is what matters: `output_savings - system_prompt_overhead`.

For short conversations, the system prompt overhead may exceed output savings. The benchmarks don't account for this.

**Recommendation:** Report net token delta (input + output) rather than output savings alone, especially for the caveman-compress skill whose explicit purpose is input token reduction.

### 6. Eval Prompts Are English-Only

**Severity: Low**

The eval prompts live in `evals/prompts/en.txt`. No localized prompt sets exist despite the project supporting Wenyan (Classical Chinese) compression mode. Users who communicate with Claude in other languages are not represented in the benchmarks.

**Recommendation:** Add a multilingual prompt set, at minimum one for Chinese given the Wenyan mode.

---

## Code Quality Notes

### `llm_run.py`
- Clean, well-documented. The three-arm design is well explained in the module docstring.
- `run_claude()` uses `check=True` which raises on non-zero exit — but stderr is captured and not surfaced on error. Consider logging `result.stderr` in the exception handler.
- No retry logic for transient Claude CLI failures (network, rate limits). For CI use, retries with backoff would improve reliability.

### `measure.py`
- Good use of `statistics.stdev` with a `len > 1` guard.
- The markdown table output is human-readable but not machine-parseable. A `--json` flag would help downstream consumers.

### `plot.py`
- See duplicate annotation bug above.
- `kaleido` for PNG export is notoriously flaky on headless Linux. The script will silently succeed on `write_html` but fail on `write_image` in many CI environments. Consider making PNG export optional (`--no-png` flag) or catching and warning on kaleido errors.

### Hook Architecture
- Using a flag file (`~/.claude/.caveman-active`) for cross-process state is pragmatic but creates a hidden dependency between SessionStart and UserPromptSubmit hooks. If `caveman-activate.js` fails to write the flag (e.g., permission error), `caveman-mode-tracker.js` silently continues as if no mode is active. A healthcheck or explicit error message would improve debuggability.

---

## Architectural Observations

### CI-Driven Distribution Is Smart
Propagating `SKILL.md` changes via CI rather than asking contributors to manually update 6+ platform-specific files is the right call. The `CONTRIBUTING.md` note about never editing auto-synced files directly is important and well-placed.

### The Caveman Concept Has Limits
The project claims 65–87% output token reduction. The upper end (87%) reflects tasks with verbose defaults (e.g., explaining React re-rendering). For tasks where output is already terse (writing a one-liner function, answering yes/no questions), caveman mode provides little benefit and the system prompt overhead dominates. The README could better set user expectations about where the tool is and isn't effective.

### Plugin vs. Standalone Installation
The fallback ruleset in `caveman-activate.js` for standalone installations is a good resilience pattern, but it creates a maintenance burden: two copies of the core rules that can diverge. The standalone fallback should be generated from `SKILL.md` at install time rather than hardcoded.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Eval methodology | Excellent | Three-arm design, honest tokenizer disclaimer, distribution stats |
| Code quality | Good | Clean Python, minor bugs in plot.py |
| Security | Good | Symlink guards present; flag file trust model could be documented |
| Documentation | Good | CLAUDE.md is comprehensive; CONTRIBUTING.md is clear |
| Benchmark validity | Fair | Single-run, wrong tokenizer, no input token accounting |
| Cross-platform support | Excellent | Unix + Windows, 40+ agents |
| Maintainability | Good | CI sync reduces drift; standalone fallback is a risk |

---

## Recommendation

The project is production-quality for a prompt-engineering tool. The eval harness is better-designed than most comparable projects. The main gaps are in benchmark validity (single-run, tiktoken mismatch, no input token accounting) and a minor bug in `plot.py`. These are fixable improvements, not blockers.

**Suggested priority fixes:**
1. Fix duplicate annotation loop in `plot.py`
2. Add `--runs N` to `llm_run.py` for multi-sample benchmarks
3. Replace tiktoken counting with Anthropic's token-counting API in benchmarks
4. Document the flag file trust boundary in `CLAUDE.md`
