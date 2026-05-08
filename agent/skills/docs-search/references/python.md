# Python — Local Documentation

## Lookup — `pydoc`

Built into Python. Covers stdlib and any installed package in the active
environment. No install needed.

```bash
python -m pydoc <module>                  # module overview
python -m pydoc <module>.<Class>          # specific class
python -m pydoc <module>.<Class>.<method> # specific method
python -m pydoc str.join                  # example
python -m pydoc os.path                   # example: submodule
```

---

## Search — `pydoc -k`

`pydoc` has a built-in keyword search that scans docstrings across all
importable modules in the current environment:

```bash
python -m pydoc -k <keyword>      # search all module docstrings
python -m pydoc -k "base64"       # example: find base64-related modules
python -m pydoc -k "sort"         # example: find sort-related functions
```

This is genuine search — try it before reaching for qi. Its coverage depends
on the active environment, so run it inside the project's virtual environment
(e.g. `uv run python -m pydoc -k <keyword>`) to include project dependencies.

**Limitation**: `-k` matches against module and function names and their
one-line summaries only — not full docstring text. For deeper search, use qi.

---

## qi fallback

For full-text search across detailed docstrings, index the stdlib docs into
qi using the Dash-User-Contributions workflow in the main skill
(collection name: `python`).

```bash
qi search "context manager protocol" -c python -n 5
```

---

## Workflow

1. Know the module and symbol → `python -m pydoc <module>.<symbol>`
2. Searching for a keyword → `python -m pydoc -k <keyword>` (inside project venv)
3. Need full-text search → `qi search "<term>" -c python`
4. Collection not indexed → follow Dash workflow in main skill
