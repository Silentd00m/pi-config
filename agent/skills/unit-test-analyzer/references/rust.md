# Rust — Test Quality Tooling

## Coverage analysis — cargo-llvm-cov

`cargo-llvm-cov` wraps LLVM's source-based coverage (more accurate than the
older `cargo-tarpaulin` line-based approach).

```bash
cargo install cargo-llvm-cov
rustup component add llvm-tools-preview

# Text summary with branch info
cargo llvm-cov --branch

# HTML report (best for auditing)
cargo llvm-cov --branch --html
open target/llvm-cov/html/index.html

# LCOV output (for CI / badge integrations)
cargo llvm-cov --branch --lcov --output-path coverage.lcov

# Exclude test files themselves and generated code
cargo llvm-cov --branch --ignore-filename-regex '(test|spec|generated)'
```

### Reading the report

The HTML view shows per-line execution counts and branch arrows (green = taken,
red = not taken). Look for:

- Functions with 100% line hits but red branch arrows — the `else` or error
  path was never tested
- Functions shown in red entirely — not called by any test

### cargo-tarpaulin (alternative, line-only)

```bash
cargo install cargo-tarpaulin

cargo tarpaulin --out Html --output-dir htmlcov/
cargo tarpaulin --out Lcov                         # CI-friendly
cargo tarpaulin --exclude-files "tests/*"
```

Tarpaulin does not support branch coverage. Use `cargo-llvm-cov` when branch
analysis is needed.

---

## Mutation testing — cargo-mutants

```bash
cargo install cargo-mutants

# Run against the whole crate
cargo mutants

# Target a specific source file
cargo mutants --file src/pricing.rs

# Parallel workers (speeds up significantly)
cargo mutants --jobs 4

# Output
# Results written to mutants.out/
cat mutants.out/missed.txt    # surviving mutants (most important)
cat mutants.out/caught.txt    # killed mutants
cat mutants.out/timeout.txt   # timed-out mutants
```

### Reading surviving mutants

```
src/pricing.rs:42:12: replace + with - in calculate_total
src/auth.rs:88:5: replace >= with > in is_authorized
```

Each line is a mutant that no test caught. For each:
1. Read the file + line to understand what was mutated
2. Find which test *should* cover that path (use `cargo llvm-cov` context)
3. Add an assertion that would fail if the mutation were real

### cargo-mutants in CI

```bash
# Fail CI if mutation score drops below threshold
cargo mutants --error-on-uncaught
```

---

## Combining llvm-cov + cargo-mutants

```bash
# Step 1: get branch coverage baseline
cargo llvm-cov --branch --html

# Step 2: run mutation on modules with suspicious branch coverage
cargo mutants --file src/suspicious_module.rs --jobs 4

# Any surviving mutant in a branch that IS covered = weak test
```
