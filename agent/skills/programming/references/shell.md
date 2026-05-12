# Modern Shell (POSIX/Bash) Reference

## Workflow (Step 4)

- [ ] Step 1 — Lint: `shellcheck script.sh`
- [ ] Step 2 — Format: `shfmt -w -i 2 -ci script.sh`
- [ ] Step 3 — Safety Check: Verify `set -euo pipefail` boilerplate is present.

## Safety Boilerplate

Every script must begin with:

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t
```'

## Best Practices

- Quoting: Always quote variables "$VAR" to prevent word splitting.
- Local Scope: Always use local for variables inside functions.
- Tools: Use uv run for Python-based CLI dependencies to avoid polluting the global environment.
- Logic: If a script exceeds 100 lines, trigger a reasoning loop to suggest a rewrite in Go or Python.

