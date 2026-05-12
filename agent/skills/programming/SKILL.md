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

## References

### Strategy & Architecture
- **Spec Refinement** → `references/spec-refinement.md` (Use for Step 0)
- **Architectural Review** → `architectural-review/SKILL.md` (Use for Step 5)
- **System Mapping** → `references/graphviz.md` (Use for visualization/Graphviz)

### Language Specifics
- **Go** → `references/go.md` | `references/go-errors.md`
- **Rust** → `references/rust.md` | `references/rust-errors.md`
- **Python** → `references/python.md` | `references/python-errors.md`
- **Puppet** → `references/puppet.md`
- **Shell** → `references/shell.md`
- **Typescript** → `references/typescript.md`

## Development workflow

Before writing any code, follow this sequence:

1. **Refine the specification** — Read `references/spec-refinement.md`. Analyze the 
   request for ambiguity, extract constraints, and map the internal logic. Do 
   not proceed until you have a clear "Technical Logic Map."

2. **Define the interface** — Document every public type, function, and module
   in `INTERFACE.md` before touching any source file. Include signatures,
   parameter types, return types, error conditions, and a short description of
   each item's responsibility. Get agreement on the interface before proceeding.

3. **Write the tests** — With the interface fixed, write all unit (and
   integration) tests first. Tests must cover the happy path, edge cases, and
   expected failure modes for every item in `INTERFACE.md`. The test suite
   should fail at this point because no implementation exists yet — that is
   expected and correct.

4. **Write the implementation** — Only once `INTERFACE.md` is complete and
   tests are in place should any implementation code be written.

5. **Test and lint** — Run the full pre-commit workflow as described in the
   language reference. All steps must pass before the task is done.

5. **Architectural Review (Optional)** — If the module is a core system component,
   trigger the `architectural-review` skill to ensure the implementation hasn't
   introduced "Design Smells" while passing tests.

6. **Performance Review (Optional)**
  - Trigger the `performance-audit` skill.
  - Use external tools to verify that the implementation isn't "accidentally expensive."
  - Block the workflow if **Cognitive Complexity** exceeds 15 or if $O(n^2)$ patterns are detected in the Hot Path.
  - Document findings in `PERFORMANCE.md`.

This order is strict. Do not write implementation code before both the
interface document and the tests exist.

---

## Workflow

1. Identify the primary language and its reference file.
2. Load the relevant **Strategy** and **Language** references via `/skill_read`.
3. Execute the **Development Workflow** (Steps 0–5).
4. All steps must pass cleanly before declaring the task done.
