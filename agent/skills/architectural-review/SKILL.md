---
name: architectural-review
description: >
  Perform a structural audit of code to evaluate design health, technical debt, 
  and pattern adherence. Use this when the user asks to "review the design," 
  "check for SOLID violations," "identify code smells," or "evaluate technical 
  debt." Trigger on mentions of refactoring, Clean Architecture, or decoupling.
metadata:
  requires-skill: plan-runner
---

# Architectural Review

A structural analysis workflow focused on long-term maintainability and design integrity.

---

## Workflow

### Phase 0 — Plan & Hand-off
Write a `DESIGN_PLAN.md` checklist. Focus on:
1. **Pattern Detection**: Is it Hexagonal, Layered, Monolithic, or Actor-based?
2. **SOLID Audit**: Specifically hunt for Single Responsibility and Dependency Inversion violations.
3. **Complexity & Coupling**: Identify "God Objects" and "Circular Dependencies."
4. **Over-Engineering Check**: Flag unnecessary abstractions (e.g., interfaces with only one implementation).

**Hand off to `plan-runner`** immediately after writing the plan.

### Phase 1 — Analysis → `DESIGN_FINDINGS.md`
Load references from `architectural-review/references/` based on the detected pattern:
- `references/solid.md`
- `references/clean-architecture.md`
- `references/design-smells.md`

### Phase 2 — The Design Report
Produce `REPORT.architecture.md` with:
- **Design Score**: (A-F) based on maintainability.
- **Structural Risks**: High-level architectural flaws (e.g., "The database layer is leaking into the UI").
- **Refactoring Roadmap**: Specific, prioritized steps to improve the score.
