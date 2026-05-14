# Python — Test Quality Tooling

## Coverage analysis — pytest-cov + coverage.py

```bash
pip install pytest-cov

# Run with full branch coverage
pytest --cov=<src_dir> --cov-branch --cov-report=term-missing --cov-report=html -v

# Term-missing output shows uncovered lines and branches:
# src/pricing.py    85%   42-45, 67->70 (branch)
#                                        ^^^^^^ missed branch: line 67 never went to 70

# HTML report (recommended for large projects)
open htmlcov/index.html
```

### Reading the branch report

Each missed branch appears as `LINE->TARGET` in `--cov-report=term-missing`.
`67->70` means the conditional on line 67 never fell through to line 70 — the
`else` or guard clause was never executed.

Files with high line % but low branch % are prime candidates for padding tests.
Extract these with:

```bash
coverage report --sort=cover | head -30   # sort by lowest coverage first
coverage json -o coverage.json            # machine-readable for scripting
```

### Per-test coverage breakdown (coverage.py contexts)

```bash
# Tag each test as a separate context
pytest --cov=<src_dir> --cov-branch \
       --cov-context=test \
       --cov-report=html

# Now htmlcov shows which test covers which line
# A line covered by only one trivial test is a risk signal
```

---

## Mutation testing — mutmut

```bash
pip install mutmut

# Run on a specific source directory
mutmut run --paths-to-mutate src/ --tests-dir tests/

# View results
mutmut results           # summary: killed / survived / timeout / suspicious
mutmut show <id>         # show the diff for a specific mutant
mutmut html              # full HTML report → html/index.html

# Re-run only survivors (fast iteration)
mutmut run --use-coverage  # skip mutants in uncovered lines (requires prior coverage run)
```

### Interpreting results

```
Mutation testing starting...
⠸ 143/200  🎉 112  ⏰ 0  🤔 0  🙁 31  🔇 0
```

- 🎉 Killed — a test failed, good
- 🙁 Survived — no test caught the bug; examine these
- ⏰ Timeout — test suite hung on this mutant
- 🔇 Suspicious — test suite result was unexpected

For each survivor:
```bash
mutmut show <id>
# Shows: file, line, original → mutated form
# e.g.:  return a + b  →  return a - b
```

Map survivors back to which tests *should* have caught them (based on coverage
context) — those tests are your weakest links.

### Targeting a hot module (recommended for large codebases)

```bash
mutmut run --paths-to-mutate src/critical_module.py
```

---

## Static analysis — bundled script

```bash
python scripts/static_analyzer.py tests/
```

See `references/antipatterns.md` for the full pattern list.
