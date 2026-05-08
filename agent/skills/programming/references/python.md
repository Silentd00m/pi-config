# Python Reference

## Workflow

Run these steps in order. All must pass cleanly before declaring a task done.
If a step fails, fix it and re-run before moving on.

- [ ] Step 1 — Format: `ruff format --check .`
- [ ] Step 2 — Lint: `ruff check .`
- [ ] Step 3 — Type check: `mypy .`
- [ ] Step 4 — Security: `pip-audit`
- [ ] Step 5 — Test: `pytest`

## Commands

```bash
ruff format --check .   # format check
ruff check .            # lint
mypy .                  # type check
pip-audit               # security audit
pytest                  # full test suite
pytest tests/path/test_file.py       # single file
pytest -k "test_name_substring"      # tests matching a substring
pytest -s                            # show print() / logging output
pytest --tb=short                    # shorter traceback on failure
pytest --doctest-modules             # also run inline doctests
```

---

## Linting — Ruff

`ruff format` and `ruff check` are separate passes — always run both. Ruff can
apply many fixes automatically with `--fix`. Fix the root cause; do not suppress
warnings with `# noqa` unless it is a confirmed false positive. If you do
suppress one, add an inline comment explaining why.

---

## Type checking — mypy

Always configure `strict = true` (or at minimum `disallow_untyped_defs = true`)
in `pyproject.toml` or `mypy.ini`, otherwise mypy runs in lenient mode and the
check is not meaningful.

All public functions must have fully annotated signatures. Use
`from __future__ import annotations` at the top of each file to enable deferred
evaluation and avoid forward-reference issues — but do not use it in files that
evaluate annotations at runtime (e.g. Pydantic v1 models).

Use `Optional[X]` (or `X | None` on Python ≥ 3.10) for values that may be
absent. Prefer `Sequence` / `Mapping` over bare `list` / `dict` in function
signatures to keep call sites flexible.

---

## Documentation

Every public function, class, and module must have a docstring (Google style).
Every function must include an `Examples:` section that pytest can run as a
doctest.

```python
from __future__ import annotations


def add(left: int, right: int) -> int:
    """Add two integers and return their sum.

    Args:
        left: The first number to add.
        right: The second number to add.

    Returns:
        The sum of ``left`` and ``right``.

    Examples:
        >>> add(2, 3)
        5
    """
    return left + right
```

---

## Writing tests

Tests live under `tests/`. Each test file mirrors the module it covers:
`src/math/utils.py` → `tests/math/test_utils.py`. Shared fixtures go in
`tests/conftest.py`.

```python
from __future__ import annotations

import pytest

from mypackage.math.utils import add


def test_add_positive_numbers() -> None:
    assert add(2, 3) == 5


def test_add_raises_on_wrong_type() -> None:
    with pytest.raises(TypeError, match="unsupported operand"):
        add("a", 1)  # type: ignore[arg-type]
```

Always pin the `match` argument on `pytest.raises` — without it the test passes
on any exception of that type, even an unrelated one.

---

## Error handling

Raise specific exception types — never bare `Exception`. Define custom exception
hierarchies for library code. Use `raise NewError(...) from original` to
preserve exception chains when translating errors across abstraction boundaries.
Reserve `assert` for internal invariants, not input validation — assertions are
stripped with `-O`.

---

## Dependency auditing — pip-audit

Run inside the project's virtual environment — it audits the active environment,
not `requirements.txt` directly. Keep dependencies pinned or auditing is
unreliable. If upgrading a vulnerable package is not possible, document why near
the pinned version.

---

## Gotchas

- `mypy` without strict configuration runs in lenient mode and misses most errors.
- `ruff format` and `ruff check` are separate commands — running only one is not enough.
- `pytest` discovering zero tests must be treated as a failure — check `testpaths` config and that files are named `test_*.py`.
- `pytest.raises` without `match` passes silently on the wrong reason — always add it.
- Mutable default arguments (`def f(x=[])`) are a footgun — enable Ruff rule B006 (`flake8-bugbear`) to catch them.
- `pip-audit` audits the active environment, not `requirements.txt` — run it inside the venv.
- Doctests are skipped by default — add `addopts = --doctest-modules` to `pyproject.toml` to always run them.
- `from __future__ import annotations` breaks runtime annotation evaluation — do not use it with Pydantic v1.
