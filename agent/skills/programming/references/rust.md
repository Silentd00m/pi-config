# Rust Reference

## Workflow

Run these steps in order. All must pass cleanly before declaring a task done.
If a step fails, fix it and re-run before moving on.

- [ ] Step 1 — Format: `cargo fmt --check`
- [ ] Step 2 — Lint: `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] Step 3 — Type check: *(built into the compiler, surface via clippy/build)*
- [ ] Step 4 — Security: `cargo deny check` and `cargo audit`
- [ ] Step 5 — Test: `cargo test`
- [ ] Step 6 — Doctests: `cargo test --doc`
- [ ] Step 7 — UB / fuzz: *only if `rust-toolchain.toml` specifies nightly — see [Nightly-only tools](#nightly-only-tools) below*

## Commands

```bash
cargo fmt --check                                          # format check
cargo clippy --all-targets --all-features -- -D warnings  # lint
cargo deny check                                           # advisory, license, and ban check
cargo audit                                                # RustSec advisory DB (standalone)
cargo test                                                 # full test suite (includes doctests for lib crates)
cargo test --doc                                           # doctests only (explicit check)
cargo test test_name                                       # single test by substring
cargo test module::                                        # all tests in a module
cargo test -- --nocapture                                  # show println! output
cargo test --test integration_test_file                    # one integration test file
```

Install the required tools once per machine:

```bash
cargo install cargo-audit
cargo install cargo-deny
```

---

## Linting — Clippy

Read every diagnostic in full — Clippy usually shows the exact fix inline.
Fix the root cause; do not suppress warnings with `#[allow(...)]` unless it is
a confirmed false positive. If you do suppress one, add a comment explaining
why directly above the attribute.

---

## Documentation

Every public function must use `///` doc comments and include an `# Examples`
section that `cargo test --doc` can run.

```rust
/// Adds two numbers together.
///
/// # Arguments
///
/// * `left` - The first number to add.
/// * `right` - The second number to add.
///
/// # Examples
///
/// ```
/// use my_crate::math::add;
///
/// let sum = add(2, 3);
/// assert_eq!(sum, 5);
/// ```
pub fn add(left: usize, right: usize) -> usize {
    left + right
}
```

---

## Writing tests

Unit tests go in the same file under a `#[cfg(test)]` module. Integration tests
go in `tests/` at the crate root — each file compiles as its own crate. Put
shared helpers in `tests/common/mod.rs`.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_two_numbers() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    #[should_panic(expected = "overflow")]
    fn panics_on_overflow() {
        add(usize::MAX, 1);
    }
}
```

---

## Error handling

Use `?` in fallible functions. Use `thiserror` for library error types, `anyhow`
for binaries and application code. Reserve `expect()` for cases where a panic is
genuinely correct — always pass a message explaining the assumed invariant.

---

## Dependency auditing — cargo-deny

Requires a `deny.toml` in the project root. Checks for CVEs, banned crates, and
disallowed licenses. If a check fails on a security advisory, attempt
`cargo update -p <package>` first. If a license is unknown, verify it manually
before adding it to the allow-list.

---

## Gotchas

- `cargo clippy` without `--all-targets` skips test code — always pass it.
- `#[should_panic]` without `expected = "..."` passes even if the panic reason is wrong.
- Integration tests in `tests/` cannot access private items.
- `cargo test` captures stdout by default — use `-- --nocapture` or assert on return values.
- `--all-features` can fail if features are mutually exclusive; lint each combination separately if so.
- `cargo-deny` requires a `deny.toml` in the project root.
- `cargo test` reporting "0 tests" must be treated as a failure.
- Functions without a doctest example must have one written — it must use meaningful inputs and assert on outputs, not be a stub.
- `cargo miri test` is slow — budget 10–50× the normal test runtime; run it in CI rather than blocking local commits if it takes too long.
- Miri does not support all system calls and FFI — tests that hit unsupported operations will error, not fail; isolate them with `#[cfg(not(miri))]`.
- `cargo fuzz` requires the project to be a standalone crate or workspace root — it does not work inside a workspace member without extra configuration.

---

## Dependency auditing — cargo-audit

`cargo audit` is a simpler standalone scanner against the RustSec advisory
database. It requires no configuration file, making it useful as a quick second
opinion alongside `cargo deny`, or as a first step in projects that don't yet
have a `deny.toml`. Run both: `cargo deny` covers licenses and banned crates
while `cargo audit` is purpose-built for vulnerability scanning and may surface
advisories slightly sooner.

---

## Nightly-only tools

First check whether the project opts into nightly by inspecting
`rust-toolchain.toml` in the project root:

```toml
[toolchain]
channel = "nightly"   # only run the steps below if this is set to nightly
```

If the project is on nightly, run these additional steps after the standard
pre-commit workflow.

### cargo miri — undefined behaviour detector

Miri runs the test suite under an interpreter that enforces Rust's memory and
aliasing rules at runtime. It catches use-after-free, out-of-bounds access,
data races on raw pointers, and aliasing rule violations — none of which the
compiler or Clippy will catch. It is essential for any crate with `unsafe`
blocks, and valuable even for safe code because the standard library contains
unsafe internals.

```bash
rustup component add miri               # install once
cargo miri test                         # run tests under Miri
cargo miri test --all-targets           # include all targets
```

Fix every Miri diagnostic at the root cause. Do not silence with
`#[allow(...)]` or unsafe workarounds unless the code is provably correct and
Miri is wrong — if so, add a comment citing the relevant Unsafe Code Guidelines
issue.

### cargo-fuzz — fuzz testing

Fuzz testing is the most effective way to find correctness and security bugs in
code that parses external input (files, network data, user strings). Use it for
any such code path.

```bash
cargo install cargo-fuzz
cargo fuzz init                         # set up fuzz directory (once per project)
cargo fuzz add <target_name>            # scaffold a new fuzz target
cargo fuzz run <target_name>            # run until crash or interrupted
cargo fuzz run <target_name> -- -max_total_time=60   # time-boxed run for CI
```

Fuzz targets live in `fuzz/fuzz_targets/`. Each target receives arbitrary byte
input and must not panic or exhibit undefined behaviour for any input. Commit
any crash-reproducing corpus files found under `fuzz/corpus/` so regressions
are caught by future runs.
