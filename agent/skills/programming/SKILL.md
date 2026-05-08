---
name: programming
description: >
  Use this skill when writing, editing, or reviewing any code.
  Also use it whenever the task touches programming workflow, tooling,
  or conventions: linting, formatting, type checking, testing, code quality,
  build failures, or CI pipelines. Trigger on any mention of Rust, Python,
  cargo, ruff, mypy, pytest, uv, or Clippy, even if the user is asking
  broadly rather than requesting a specific fix.
---

# Programming

## Development workflow

Before writing any code, follow this sequence:

1. **Define the interface** — Document every public type, function, and module
   in `INTERFACE.md` before touching any source file. Include signatures,
   parameter types, return types, error conditions, and a short description of
   each item's responsibility. Get agreement on the interface before proceeding.

2. **Write the tests** — With the interface fixed, write all unit (and
   integration) tests first. Tests must cover the happy path, edge cases, and
   expected failure modes for every item in `INTERFACE.md`. The test suite
   should fail at this point because no implementation exists yet — that is
   expected and correct.

3. **Write the implementation** — Only once `INTERFACE.md` is complete and
   tests are in place should any implementation code be written.

4. **Test and lint** — Run the full pre-commit workflow as described in the
   language reference. All steps must pass before the task is done.

This order is strict. Do not write implementation code before both the
interface document and the tests exist.

---

## Workflow

Identify the language, then read its reference file before running any commands:

- Go → [references/go.md](references/go.md) 
- Puppet → [references/puppet.md](references/puppet.md) 
- Rust → [references/rust.md](references/rust.md)
- Python → [references/python.md](references/python.md)

The reference file contains the exact commands and sequence to run. All steps
must pass cleanly before declaring a task done.
