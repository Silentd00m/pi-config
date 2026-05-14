# JavaScript / TypeScript — Test Quality Tooling

## Coverage analysis

### Vitest (recommended for modern projects)

```bash
npm install -D @vitest/coverage-v8   # or coverage-istanbul

# Run with branch coverage
npx vitest run --coverage

# Config (vitest.config.ts)
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',          # v8 is faster; istanbul has better branch detail
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['**/*.test.ts'],
      branches: 80,            # fail below this threshold
      lines: 90,
    },
  },
})

open coverage/index.html
```

### Jest

```bash
npx jest --coverage --coverageReporters=text --coverageReporters=html \
         --collectCoverageFrom='src/**/*.{js,ts}'

open coverage/lcov-report/index.html
```

### Reading V8 vs Istanbul branch reports

V8 coverage tracks which code paths were executed at the bytecode level —
fast and accurate for statements/lines. Istanbul additionally instruments
logical branches (`if/else`, `? :`, `||`, `&&`), producing the `Branch %`
column.

Look for:
- `Branches: 100% | Lines: 100%` — passes the naive metric; still check for
  tautological assertions
- `Branches: 45% | Lines: 98%` — the `else` / error paths are dark; tests
  are smoke-testing the happy path only

---

## Mutation testing — Stryker

Stryker is the standard mutation framework for JS/TS.

```bash
npm install -D @stryker-mutator/core @stryker-mutator/jest-runner
# or for vitest:
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner

npx stryker init     # interactive config wizard
npx stryker run
```

### stryker.config.mjs (Jest example)

```js
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',      // use per-test coverage to skip irrelevant mutants
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
  thresholds: { high: 80, low: 60, break: null },
};
```

### Reading the Stryker HTML report

```
open reports/mutation/mutation.html
```

Each mutant is colour-coded:
- 🟢 **Killed** — at least one test failed → good
- 🔴 **Survived** — all tests passed despite the bug → action required
- ⚪ **No coverage** — mutant was in a line not reached → fix coverage first
- ⏱ **Timeout** — test suite hung → investigate flaky tests

Click a survived mutant to see the exact diff and which file/test should have
caught it.

### coverageAnalysis: 'perTest'

With `coverageAnalysis: 'perTest'` Stryker only runs the tests that cover a
given mutant, skipping the full suite for each mutation. This reduces runtime
dramatically on large projects. Requires that your test runner supports per-test
coverage (Jest and Vitest both do).

---

## Combining coverage + Stryker

```bash
# Step 1: get Istanbul branch coverage
npx vitest run --coverage

# Step 2: Stryker with perTest analysis (uses the same coverage data internally)
npx stryker run

# Survived mutants inside covered branches = weak assertions
# No-coverage mutants = coverage gaps to fix before worrying about mutation
```
