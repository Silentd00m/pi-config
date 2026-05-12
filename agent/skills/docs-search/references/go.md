# Go — Local Documentation

## Lookup — `go doc`

Built into the Go toolchain. Covers stdlib and all packages in the current
module's dependency graph. No install or indexing step needed.

```bash
go doc <package>                    # package overview
go doc <package>.<Symbol>           # specific type, function, or method
go doc fmt.Fprintf                  # example: function
go doc http.Client.Do               # example: method
go doc -all <package>               # full package reference (all exported symbols)
go doc builtin                      # built-in functions and types
```

If a third-party package is not found, run `go mod download` first to
populate the module cache.

**Limitation**: `go doc` requires you to know the package and symbol name. It
is a lookup tool, not a search tool. `go doc "write formatted output"` returns
nothing useful.

---

## Search — workarounds

### Within a known package

Dump the full package reference and grep it:

```bash
go doc -all <package> | grep -i "<term>"
```

This works when you know which package to search but not the exact symbol name.

### Across stdlib

Enumerate all stdlib packages and grep across them:

```bash
go list std | while read pkg; do
  go doc -all "$pkg" 2>/dev/null
done | grep -i "<term>"
```

Slow but comprehensive. Pipe through `less` or redirect to a file for
repeated searches.

### qi (recommended for real search)

Index stdlib docs into qi for fast BM25 search. Generate the source material
by dumping `go doc -all` for each package:

```bash
mkdir -p .qi-staging/go
go list std | while read pkg; do
  safe=$(echo "$pkg" | tr '/' '_')
  go doc -all "$pkg" > ".qi-staging/go/${safe}.md" 2>/dev/null
done
qi index .qi-staging/go              # name auto-generated from path
```

Then search:

```bash
qi search "sort slice custom comparator" -c go -n 5
```

---

## Workflow

1. Know the package and symbol → `go doc <package>.<Symbol>`
2. Know the package, searching for symbol → `go doc -all <package> | grep -i <term>`
3. Searching across stdlib → `qi search "<term>" -c go` (after indexing above)
4. Neither available → fall through to the qi/Dash workflow in the main skill
