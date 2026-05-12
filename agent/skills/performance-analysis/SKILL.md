---
name: performance-analysis
description: >
  Execute a data-driven performance audit using external static analysis tools. 
  Evaluates algorithmic complexity, cognitive load, resource efficiency, and 
  database interaction patterns. Trigger on Step 3.5 of the programming workflow.
metadata:
  requires-skill: plan-runner
---

# Performance Analysis

A multi-stage audit that combines symbolic reasoning with external telemetry to identify bottlenecks before code execution.

---

## Workflow

### Phase 0 — Tool Selection & Planning
Write `PERFORMANCE_PLAN.md`. Detect the language and select the appropriate toolset from `references/toolkit.md`.
- **Primary Goal**: Identify the "Hot Path" (the most frequently executed code).
- **Secondary Goal**: Quantify technical debt and scaling limits.

### Phase 1 — External Telemetry Execution
Call `plan-runner` to execute the selected tools.
- **Complexity**: Run `scc --complexity` or language-specific equivalents (`radon`, `gocognit`).
- **Bloat**: For compiled languages (Rust/Go), run `cargo-bloat` or `go tool nm`.
- **Database**: Run `sqlc` or `sqlx` checks to catch N+1 query patterns.

### Phase 2 — Telemetry Interpretation
Re-read the output of the tools. Use the "Thinking Mode" to bridge the gap between numbers and logic:
- If **Cognitive Complexity > 15**: Flag for logic simplification.
- If **Maintainability Index < 50**: Flag for structural refactor.
- If **Loop Nesting > 2**: Perform a Big-O symbolic trace to check for $O(n^2)$ growth.

### Phase 3 — The Performance Report
Generate `PERFORMANCE.md` with the following sections:
- **Telemetry Snapshot**: Raw scores from external tools.
- **Bottleneck Analysis**: Mapping high-complexity scores to specific functions.
- **Resource Forecast**: Predicted memory/CPU behavior at $10\times$ current data volume.
- **Refactoring Roadmap**: Specific diffs or logic changes to optimize the Hot Path.
