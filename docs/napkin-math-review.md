# Code Review: sirupsen/napkin-math

**Repository:** https://github.com/sirupsen/napkin-math  
**Review Date:** 2026-04-26  
**Reviewer:** Claude (Sonnet 4.6)

---

## Summary

napkin-math is a reference repository of measured system performance numbers and estimation techniques for back-of-the-envelope calculations. It provides validated latency/throughput figures for memory, disk, network, syscalls, hashing, and cloud costs — re-measured in March 2026 on GCP `c4-standard-48-lssd` instances. The benchmark suite is written in Rust using Criterion.rs, with a secondary Go implementation for memory layout experiments.

This is a lean, high-quality reference resource. The Rust code is notably sophisticated for a reference project, including AVX2 SIMD intrinsics and core-pinned multi-threaded benchmarks.

---

## Strengths

### 1. Methodologically Sound Benchmarking

The Criterion.rs harness uses proper statistical sampling with configurable warm-up time (10 s) and measurement time (10 s), reports throughput in bytes/sec, and uses `black_box()` to prevent dead-code elimination. The multi-threaded benchmark in `memory_read.rs` uses `Barrier` synchronization to ensure all threads start simultaneously, which is necessary for accurate throughput measurement under realistic NUMA/cache conditions.

### 2. SIMD vs. Scalar Comparison

`memory_read.rs` provides four benchmark arms:
- 1 thread, no SIMD (forced scalar via inline assembly)
- 1 thread, AVX2 SIMD (4-way unrolled `_mm256_loadu_si256`)
- N threads, no SIMD
- N threads, AVX2 SIMD

The scalar arm uses x86 inline assembly (`asm!`) with `volatile`-equivalent reads to prevent the compiler from auto-vectorizing, ensuring a genuine comparison. This is a non-trivial implementation detail that most benchmark authors get wrong.

### 3. Current Hardware

Numbers are validated on 2026 hardware (GCP `c4-standard-48-lssd`). Many competing reference tables still cite Jeff Dean's 2010-era numbers. The README makes the measurement date explicit, which lets readers judge staleness.

### 4. Go Memory Layout Experiments

`go/main.go` directly demonstrates the performance impact of struct padding and pointer indirection by benchmarking arrays of values vs. arrays of pointers with varying padding sizes (`SmallestCell` through `LargeCell`). This is practically useful for Go developers reasoning about GC pressure and cache locality.

---

## Issues and Concerns

### 1. `Cargo.toml` Uses Wildcard Versions (Reproducibility Risk)

**Severity: Medium**

Nearly every dependency uses `"*"` as the version constraint:

```toml
failure = "*"
redis = "*"
clap = "*"
jemallocator = "*"
```

Wildcard versions mean that `cargo build` at different points in time may pull different dependency versions, producing non-reproducible benchmark results. The committed `Cargo.lock` mitigates this for local builds, but it makes the dependency intent opaque and can cause unexpected compilation failures when upstreams publish breaking changes.

**Recommendation:** Pin all dependencies to explicit minor versions (e.g., `clap = "4.4"`) or at least caret ranges (`^4.4`).

### 2. `failure` Crate Is Unmaintained

**Severity: Low–Medium**

The `failure` crate is listed as a dependency and has been officially deprecated since 2019. Its replacement is `anyhow` for application code or `thiserror` for library code. This doesn't affect runtime correctness but signals the dependency audit has not been revisited since the project was initially written.

### 3. Compressed Memory Benchmark Is Artificially Favorable

**Severity: Medium**

`compressed_memory_read.rs` benchmarks `BitPacker8x` decompression, but the test data pattern is:

```rust
for i in 0..256 {
    data[i as usize] = i;
}
// remaining 1M - 256 elements are 0 (from vec![0u32; ...]
```

The comment even acknowledges this: `"This is faster if we set everything to e.g. 1 / But it's unrealistic in practice."` Yet the benchmark proceeds with this unrealistic data. `num_bits` will be very small (8 bits for values 0–255), yielding best-case compression ratios and decompression throughput that do not represent typical workloads.

**Recommendation:** Use a realistic data distribution (e.g., sorted random integers, delta-encoded timestamps) and document the `num_bits` value alongside benchmark results.

### 4. `criterion_main!` Only Covers Two Benchmarks

**Severity: Low**

`benches/napkin_math.rs` only wires up `memory_read` and `compressed_memory_read`. The primary benchmark suite in `src/main.rs` (disk I/O, network, syscalls, Redis, MySQL, hashing, sorting) runs as a standalone binary, not via Criterion. This means:

- CI cannot easily run the full suite in a single `cargo bench` invocation
- Criterion's statistical output isn't available for the main benchmarks
- The two harnesses have different warm-up and iteration strategies

**Recommendation:** Either migrate `src/main.rs` benchmarks to Criterion bench groups, or document the two-harness design explicitly.

### 5. MySQL and Redis Benchmarks Require External Services

**Severity: Low**

`src/main.rs` includes Redis and MySQL benchmarks that require live service connections. There's no documentation on how to configure or skip these, and no `--skip-external` flag. A developer running `cargo run --release` without those services will get a runtime panic with a poor error message.

**Recommendation:** Make external-service benchmarks opt-in via a feature flag (`cargo run --release --features redis,mysql`) or check for connectivity and skip gracefully.

### 6. No ARM/Apple Silicon Numbers

**Severity: Low**

All benchmarks target x86_64 (including the AVX2 SIMD path). The README does not note ARM architecture numbers, which are increasingly relevant as M-series Macs and Graviton AWS instances are common developer and production targets. Sequential memory bandwidth in particular differs significantly between x86 and ARM.

---

## Code Quality Notes

### `memory_read.rs`
- Excellent use of `core_affinity` for pinned-thread benchmarks.
- The `ThreadedMemoryReadBenchmark` struct with `Arc<Barrier>` synchronization is a clean design.
- The AVX2 path uses 4-accumulator unrolling to hide load-to-use latency — this is the correct technique for memory bandwidth benchmarks.
- The scalar arm's inline assembly correctly prevents auto-vectorization. Most benchmark authors use a `#[inline(never)]` function without a `volatile` read; this implementation is more rigorous.

### `compressed_memory_read.rs`
- The benchmark measures decompression only, not compression. This is fine for the stated use case (read performance), but should be documented.
- `i` is mutated inside the closure to cycle through compressed blocks, which is stateful and could cause benchmark instability if Criterion runs the closure fewer times than `1_000_000`.

### `go/main.go`
- The GC stats collection and printing pattern is practical and demonstrates a real technique for profiling Go programs.
- The struct definitions with varying padding sizes are clear pedagogical examples.
- No benchmark framework (testing.B) is used — the program uses `time.Since()` manually. This produces less statistically robust measurements than `go test -bench`.

---

## Summary Table

| Area | Rating | Notes |
|------|--------|-------|
| Reference numbers | Excellent | Fresh 2026 hardware, explicit date |
| Rust benchmark quality | Very Good | SIMD, core pinning, Criterion — minor data validity issue |
| Go implementation | Good | Useful patterns, no `testing.B` |
| Reproducibility | Fair | Wildcard deps, `failure` crate, two harnesses |
| Usability | Fair | External services not skippable, no ARM |
| Documentation | Good | README is practical; in-code comments are sparse |

---

## Recommendation

Strong reference resource; the Rust benchmarking code is more rigorous than most comparable projects. The main actionable fixes are: pin dependency versions, fix the compressed benchmark's unrealistic data distribution, and make Redis/MySQL benchmarks opt-in. None of these are blockers for its primary use as a reference table.

**Suggested priority fixes:**
1. Replace `"*"` version constraints with explicit ranges in `Cargo.toml`
2. Replace `failure` with `anyhow`
3. Use realistic data in `compressed_memory_read.rs` and document `num_bits`
4. Gate Redis/MySQL benchmarks behind a feature flag
