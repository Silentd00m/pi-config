# Go — Test Quality Tooling

## Coverage analysis — go test -cover

Go has first-class coverage support in the toolchain. Since Go 1.20, coverage
instrumentation also works for integration tests and binaries, not just unit
tests.

```bash
# Quick summary
go test ./... -cover

# Per-function breakdown
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out

# HTML report (per-line, clickable)
go tool cover -html=coverage.out -o htmlcov/coverage.html
open htmlcov/coverage.html
```

### Branch coverage (Go 1.21+)

Go's built-in coverage does **not** report branch-level data by default.
Use `-covermode=atomic` for race-safe instrumentation, but for branch analysis
use `gocov` or interpret the HTML report manually:

```bash
go install github.com/axw/gocov/gocov@latest
go install github.com/AlekSi/gocov-xml@latest

gocov test ./... | gocov report           # per-function with branch hint
```

Alternatively, read the HTML output: uncovered lines after an `if` statement
indicate an untested branch.

### Spotting coverage-padding tests

```bash
# List packages sorted by coverage (lowest first)
go test ./... -cover 2>&1 | grep -v "^ok" | sort -t% -k1 -n

# Per-function detail: functions at 100% line coverage are still suspects
# if their error paths are not tested
go tool cover -func=coverage.out | grep -v "100.0%"
```

Key pattern: a function like `func Process(...) (Result, error)` that shows
100% coverage but whose `error` return is never triggered in tests — the
`if err != nil` branch is dark.

---

## Mutation testing — gremlins

`gremlins` is the idiomatic Go mutation testing tool.

```bash
go install github.com/go-gremlins/gremlins/cmd/gremlins@latest

# Run on the whole module
gremlins unleash

# Target a package
gremlins unleash --coverpkg ./internal/pricing/...

# Output: table of mutants with KILLED / LIVED / NOT_COVERED status
```

### Reading gremlins output

```
pkg/pricing/calculator.go:42 LIVED   ArithmeticBase + -> -
pkg/auth/checker.go:88      LIVED   ConditionalsBoundary >= -> >
pkg/cache/store.go:15       KILLED  LogicalInversion && -> ||
```

`LIVED` = survived, no test caught it. `NOT_COVERED` = line not reached by
any test at all (fix the coverage gap first before worrying about mutation).

### Mutation types gremlins applies

| Mutator | Example |
|---------|---------|
| ArithmeticBase | `+` → `-`, `*` → `/` |
| ConditionalsBoundary | `>=` → `>`, `<` → `<=` |
| LogicalInversion | `&&` → `||` |
| IncrementDecrement | `i++` → `i--` |
| InvertNegatives | `-x` → `x` |

---

## Combining go cover + gremlins

```bash
# Step 1: collect coverage profile
go test ./... -coverprofile=coverage.out -covermode=atomic

# Step 2: run gremlins using the coverage profile to skip uncovered mutants
gremlins unleash --coverpkg ./... 2>&1 | tee mutation_report.txt

# Step 3: cross-reference
# LIVED mutants in covered lines = tests that execute but don't assert
grep LIVED mutation_report.txt
```
