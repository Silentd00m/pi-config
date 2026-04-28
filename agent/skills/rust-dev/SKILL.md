---
name: rust-dev
description: >
  Use this skill when working on Rust code — writing, editing, or reviewing
  it. Also use it whenever the task touches Rust workflow, tooling, or
  conventions: linting, Clippy, formatting, testing, code quality, build
  failures, CI pipelines, or "what does the Rust workflow look like."
  Trigger on any mention of Rust, Clippy, cargo, or Rust CI, even if
  the user is asking broadly rather than requesting a specific fix.
---

# Rust Development

## Pre-commit workflow

Run this sequence before declaring any task done. All steps must pass cleanly.

- [ ] Step 1: Check formatting — `cargo fmt --check`
- [ ] Step 2: Lint — `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] Step 3: Security & License Check — `cargo deny check`
- [ ] Step 4: Test — `cargo test`

If any step fails, fix the issues and run that step again before moving on.
Do not move to the next step while the current one is still failing.

## Linting with Clippy

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

Read every diagnostic in full — Clippy usually shows the exact fix inline.
Fix the root cause; do not suppress warnings with `#[allow(...)]` unless
it's a confirmed false positive. If you do suppress one, add a comment
explaining why directly above the attribute.

Validation loop:

1. Run Clippy
2. Fix all reported issues
3. Run Clippy again
4. Repeat until output is clean

## Dependency Auditing (cargo-deny)

Use this to ensure the project remains secure and compliant with licensing.

```bash
cargo deny check
```

- **Advisories:** Checks for crates with known security vulnerabilities (CVEs).
- **Licenses:** Ensures all dependencies use approved licenses.
- **Bans:** Checks for forbidden crates or duplicate versions of the same crate.

If a check fails due to a security advisory, attempt to update the crate using `cargo update -p <package_name>`. If the license is unknown, verify it manually before adding it to the allow-list in `deny.toml`.

## Binary Size Analysis (cargo-bloat)

Use this when optimizing for binary size or identifying "heavy" dependencies.

```bash
cargo bloat --release -n 20
```

- `-n 20`: Shows the top 20 largest functions/crates.
- `--release`: Always analyze release builds, as debug builds contain symbol overhead that obscures real size.

When investigating size, look for generic functions instantiated multiple times (monomorphization) or large dependencies that provide functionality only used in a small part of the code.

## Documentation

Every function must be documented using Rust's doc comments (`///`). The documentation must include a clear explanation of what the function does, its parameters, and its return values. Additionally, every function must include an `# Examples` section demonstrating its usage. 

```rust
// Standard library imports
// Third-party imports
// Internal module imports

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

## Writing tests

Unit tests go in the same file as the code under a `#[cfg(test)]` module:

```rust
// Standard library imports
// Third-party imports
// Internal module imports

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

Integration tests go in `tests/` at the crate root — each file compiles as
its own crate. Put shared helpers in `tests/common/mod.rs` and declare them
with `mod common;` at the top of each test file that needs them.

## Running tests

```bash
cargo test                         # full suite (default — use this first)
cargo test test_name               # single test by substring match
cargo test module::                # all tests in a module
cargo test -- --nocapture          # show println! output
cargo test --test integration_test_file  # one integration test file
```

## Gotchas

- `cargo clippy` without `--all-targets` skips test code — always pass
  `--all-targets` or you'll miss lints in `#[cfg(test)]` blocks.
- `#[should_panic]` passes even if the function panics for the wrong reason.
  Always add `expected = "substring"` to pin down the panic message.
- Integration tests in `tests/` cannot access private items — if a test
  needs internal access, it must be a unit test inside the crate.
- `cargo test` captures stdout by default. A test that relies on side effects
  visible only through print output will appear to pass silently. Use
  `-- --nocapture` or assert on return values instead.
- Clippy's `--all-features` can fail if features are mutually exclusive.
  If that happens, lint each feature combination separately.
- `cargo-deny` requires a `deny.toml` configuration file in the project root to function effectively across all check categories.
- `cargo test` outputting "0 tests" must be interpreted as a failure.
- If a function without an example is encountered when running tests, an example must be written. The example must demonstrate a valid, realistic use of the function—providing meaningful inputs and using or asserting the outputs—and not simply be a stub that discards them.

## Error handling

Use `?` in fallible functions. Use `thiserror` for library error types,
`anyhow` for binaries and application code. Reserve `expect()` for cases
where a panic is genuinely the correct behaviour — always pass a message
that explains the invariant being assumed.

If you encounter unfamiliar error patterns, read `references/errors.md`.
