---
name: unit-test-analyzer
description: >
  Use this skill when analyzing, auditing, or reviewing unit tests for quality.
  Trigger on any mention of: finding bad tests, useless tests, coverage padding,
  improving test quality, tests that always pass, weak assertions, test suite audits,
  "my coverage is high but bugs still slip through", "which tests can I delete",
  "are my tests actually testing anything", or any review of test effectiveness.
  Also trigger when the user asks about mutation testing, test coverage gaps, or
  gcov / lcov / coverage.py / cargo-tarpaulin results they want interpreted.
---

# Unit Test Analyzer

Finds low-quality, redundant, and coverage-padding tests through three lenses:

1. **Static analysis** — AST/pattern checks catch structural problems without running anything
2. **Coverage analysis** — per-file and per-branch coverage reveals what is hit vs. what is verified
3. **Mutation testing** — the ground truth: mutate the source, see which tests fail (good) vs. pass (useless)

## References

- **Anti-pattern catalog** → `references/antipatterns.md`
- **Python** → `references/python.md`
- **JavaScript / TypeScript** → `references/javascript.md`
- **Rust** → `references/rust.md`
- **Go** → `references/go.md`
- **C / C++** → `references/cpp.md`
- **Java / Kotlin** → `references/java.md`

---

## Workflow

### Step 0 — Identify the ecosystem

```bash
ls pytest.ini setup.cfg pyproject.toml 2>/dev/null  # Python
ls package.json jest.config.* vitest.config.* 2>/dev/null  # JS/TS
ls Cargo.toml 2>/dev/null  # Rust
ls go.mod 2>/dev/null  # Go
ls CMakeLists.txt Makefile 2>/dev/null  # C/C++
ls pom.xml build.gradle 2>/dev/null  # Java
```

Load the matching language reference file before proceeding.

---

### Step 1 — Static analysis (always run first; no test execution required)

Run the bundled analyzer on the test directory:

```bash
python scripts/static_analyzer.py <test_dir_or_file>
```

This finds: no-assertion tests, tautological assertions, pure mock exercises,
swallowed exceptions, bare truthiness checks, and empty test bodies.
Full pattern catalog: `references/antipatterns.md`.

---

### Step 2 — Coverage analysis

Goal: separate *line coverage* (code was executed) from *branch coverage*
(conditions were actually exercised both ways). A file at 100% line / 0% branch
coverage is a strong signal of coverage-padding tests.

See the language reference for exact commands and how to read the output.

Key signals to extract:
- Files/modules with high line coverage but low/zero branch coverage
- Branches only covered by a single trivial smoke test
- Functions covered but with no assertion on their return value (cross-reference with Step 1)

---

### Step 3 — Mutation testing

Mutation testing introduces small, syntactically valid bugs (*mutants*) into
source code one at a time and re-runs the test suite. If all tests pass despite
the bug, the mutant *survives* — meaning no test catches that class of defect.

**Mutation score** = killed mutants / total mutants.

| Score | Interpretation |
|-------|---------------|
| ≥ 80% | Healthy |
| 60–79% | Moderate gaps — audit survivors |
| < 60% | Critical — line coverage metrics are misleading |

See the language reference for setup and commands.
For large codebases, target a critical module rather than the whole project —
mutation testing is O(mutants × test-suite-runtime).

---

### Step 4 — Synthesize findings

Combine all signals into a prioritized report:

```
## Test Quality Report: <project>

### 🔴 Critical — delete or rewrite
| Test | File:Line | Pattern | Evidence |

### 🟠 High — significant behavioral gaps
| Test | File:Line | Pattern | Surviving mutant / missing branch |

### 🟡 Medium — weaken coverage signal
| Test | File:Line | Pattern | Suggestion |

### 📊 Coverage summary
Line: X% | Branch: Y% | Mutation score: Z% (A killed / B total)

### Top surviving mutants
5–10 most impactful survivors with a suggested assertion to kill each.
```

---

### Step 5 — Concrete recommendations

For every flagged test provide one of:

- **Rewrite** — exact assertion(s) to add with expected values
- **Delete** — name the better test that already covers the same ground
- **Demote** — move to a smoke/integration suite so it stops inflating unit coverage metrics

Do not recommend deletion without confirming another test covers the behavior.
