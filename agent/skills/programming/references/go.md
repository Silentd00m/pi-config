# Go Reference

## Pre-commit workflow

Run these steps in order. All must pass cleanly before declaring a task done.
If a step fails, fix it and re-run before moving on.

- [ ] Step 1 — Format: `gofmt -l .` (no output means clean)
- [ ] Step 2 — Vet: `go vet ./...`
- [ ] Step 3 — Lint: `staticcheck ./...`
- [ ] Step 4 — Security: `govulncheck ./...`
- [ ] Step 5 — Test: `go test ./...`

Install the required tools once per machine:

```bash
go install honnef.co/go/tools/cmd/staticcheck@latest
go install golang.org/x/vuln/cmd/govulncheck@latest
```

---

## Commands

```bash
gofmt -l .                        # list files with formatting issues
gofmt -w .                        # reformat files in place
go vet ./...                      # built-in suspicious construct checks
staticcheck ./...                 # deep static analysis (150+ checks)
govulncheck ./...                 # vulnerability scan against Go vuln DB
go test ./...                     # full test suite
go test ./...  -v                 # verbose per-test output
go test ./... -run TestName       # single test by name (regexp)
go test ./... -run TestGroup/     # all subtests in a group
go test -race ./...               # run tests with race detector
go test -cover ./...              # show coverage summary
go test -coverprofile=c.out ./... # write coverage profile
go tool cover -html=c.out         # view coverage in browser
go build ./...                    # build all packages (compile check)
```

---

## Formatting — gofmt

`gofmt` is the single canonical formatter for Go — there is no configuration
and no exceptions. Run `gofmt -w .` to reformat in place. Use `gofmt -l .` in
CI to check without modifying files; a non-empty output is a failure.

If the project uses imports grouping, prefer `goimports` as a drop-in
replacement — it does everything `gofmt` does and also manages import blocks.

---

## Linting — go vet + staticcheck

`go vet` is built into the toolchain and catches a well-defined set of
suspicious constructs (misuse of `Printf`, unreachable code, incorrect mutex
copying, etc.). It runs automatically as part of `go test`, but run it
explicitly in CI so failures are clearly attributed.

`staticcheck` goes significantly further — 150+ checks covering bugs,
performance issues, and deprecated API usage. It has very low false-positive
rates. Fix every issue at the root cause; do not suppress with
`//nolint` or `//lint:ignore` unless it is a confirmed false positive, and if
you do, add a comment explaining why directly above the directive.

For projects that need a broader set of checks, `golangci-lint` is the
standard meta-linter — it bundles `go vet`, `staticcheck`, and many others
into a single binary with a `.golangci.yml` config file. Use it in CI as a
replacement for the separate `go vet` + `staticcheck` calls.

---

## Type checking

Type checking is built into the compiler. A successful `go build ./...` (or
`go test ./...`) means the code is type-correct. There is no separate step.

---

## Security — govulncheck

`govulncheck` scans your code against the Go vulnerability database
(`vuln.go.dev`), maintained by the Go security team. Unlike manifest-only
scanners it only reports vulnerabilities in functions your code actually calls,
so results are low-noise and actionable.

If a vulnerability is reported, try `go get -u=patch <module>` first. If
upgrading is not immediately possible, document why at the relevant `go.mod`
entry and track it as a known issue.

---

## Documentation

Every exported symbol must have a doc comment. Comments begin with the symbol
name and form a complete sentence.

```go
// Add returns the sum of a and b.
func Add(a, b int) int {
    return a + b
}
```

For packages, the package-level comment goes in `doc.go` or above the
`package` declaration in the main file:

```go
// Package math provides basic integer arithmetic helpers.
package math
```

---

## Writing tests

Test files are named `<file>_test.go` and live in the same package (white-box)
or a `_test`-suffixed package (black-box). Use table-driven tests for any
function with more than one interesting case.

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name string
        a, b int
        want int
    }{
        {"positive", 2, 3, 5},
        {"negative", -1, -1, -2},
        {"zero", 0, 0, 0},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            if got := Add(tt.a, tt.b); got != tt.want {
                t.Errorf("Add(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
            }
        })
    }
}
```

For behaviour that must not panic under any input, add a fuzz test alongside
the unit test:

```go
func FuzzAdd(f *testing.F) {
    f.Add(2, 3)
    f.Fuzz(func(t *testing.T, a, b int) {
        Add(a, b) // must not panic
    })
}
```

Shared test helpers go in `testdata/` (static fixtures) or a `internal/testutil`
package (helper functions). Never use `init()` in test files.

---

## Error handling

Always check returned errors — never assign to `_` unless you have a documented
reason. Use `fmt.Errorf("context: %w", err)` to wrap errors and preserve the
chain. Use `errors.Is` / `errors.As` to inspect wrapped errors; never compare
error strings.

For library code, define typed sentinel errors with `errors.New` at package
level. For complex error hierarchies, define custom types that implement the
`error` interface.

```go
var ErrNotFound = errors.New("not found")

// Wrapping to add context:
return fmt.Errorf("load config: %w", err)

// Inspecting a wrapped error:
if errors.Is(err, ErrNotFound) { ... }
```

---

## Gotchas

- `gofmt` is non-negotiable — unformatted code must be treated as a build failure.
- `go vet` runs inside `go test` by default, but run it explicitly in CI so failures are attributed correctly.
- `staticcheck ./...` without any config runs all checks — some SA1019 (deprecation) warnings can be noisy; configure `checks` in `staticcheck.conf` if needed rather than suppressing inline.
- `go test` discovering zero tests is not an error — verify intentionally empty packages are expected before moving on.
- `-race` is off by default; enable it in CI to catch data races that don't reproduce reliably.
- Goroutine leaks don't cause test failures by default — use `goleak` in `TestMain` for packages that spawn goroutines.
- `errors.Is` traverses the chain; `==` on error values does not — always use `errors.Is`.
- Short variable declarations (`:=`) in an outer scope followed by `:=` in an inner scope silently shadow the outer variable — `go vet` catches some but not all cases; `staticcheck` and `-shadow` in `golangci-lint` catch more.
