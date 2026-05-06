# Rust Reference

## Pre-commit workflow

Run these steps in order. All must pass cleanly before declaring a task done.
If a step fails, fix it and re-run before moving on.

- [ ] Step 1 — Format: `cargo fmt --check`
- [ ] Step 2 — Lint: `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] Step 3 — Type check: *(built into the compiler, surface via clippy/build)*
- [ ] Step 4 — Security: `cargo deny check`
- [ ] Step 5 — Test: `cargo test`

## Commands

```bash
cargo fmt --check                                          # format check
cargo clippy --all-targets --all-features -- -D warnings  # lint
cargo deny check                                           # security audit
cargo test                                                 # full test suite
cargo test test_name                                       # single test by substring
cargo test module::                                        # all tests in a module
cargo test -- --nocapture                                  # show println! output
cargo test --test integration_test_file                    # one integration test file
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
