---
name: plan-creator
description: >
  Use this skill when the user wants to create a plan, describe a new project,
  or asks to "make a plan". This skill guides the user through an interactive
  questioning process to define scope, tasks, and deliverables before
  generating a PLAN.md file. Also use when the user provides a vague request
  and needs help structuring the work.
---

# Plan Creator

## Workflow

1. **Check for Existing Plan:** Read `PLAN.md` if it exists.
2. **Integration Decision:** If `PLAN.md` exists, show it to the user and ask
   how to proceed:
   - **Integrate/Append:** Add new tasks to the existing plan (preserving
     completed `[x]` and failed `[!]` items).
   - **Overwrite:** Replace the entire file with the new plan.
   - **New File:** Create a separate file (e.g., `PLAN-v2.md` or
     `PLAN-feature.md`).
     If no `PLAN.md` exists, skip to step 3.
3. **Initiate:** Ask the user for the high-level goal or description of the
   new work.
4. **Questioning Phase:** Ask targeted questions to clarify scope, constraints,
   deliverables, and dependencies.
   - Ask questions **one at a time** or in small logical groups.
   - Adapt questions based on the user's answers and the project context.
   - Stop asking questions once you have enough detail to create actionable tasks.
5. **Drafting:** Propose a draft plan with tasks listed in the required format.
   - If integrating, show how new tasks will be inserted relative to existing ones.
   - Summarize key assumptions if the user was brief.
6. **Review:** Ask the user for feedback. Add, remove, reorder, or refine tasks
   based on their input. After two revision rounds, write the plan and move on
   unless the user explicitly asks for more changes.
7. **Finalize:** When the user confirms, write the plan to the agreed-upon file.

## Questioning Guidelines

Focus on gathering information that makes tasks **atomic** and **actionable**.
Ask about:

- **Scope:** What is in scope? What is explicitly out of scope?
- **Deliverables:** What files, code, documentation, or artifacts should exist
  when the plan is complete?
- **Constraints:** Tech stack, style guides, performance requirements, or
  existing code patterns to follow?
- **Dependencies:** Does this work rely on other branches, external APIs, or
  prior tasks?
- **Priorities:** What is the most critical outcome? What can be deprioritized?

_Tip: If the user provides a detailed description, you may skip some questions
and proceed to drafting, but always confirm critical assumptions._

## Plan Format

Generate or update the plan using this structure:

```markdown
# Plan

- [ ] First task description
- [ ] Second task description
- [ ] Third task description
```

- Tasks should be **atomic** (doable in a single step without ambiguity).
- Tasks should be **ordered logically** (dependencies first).
- Avoid vague tasks like "Fix bugs"; use "Fix null pointer in UserAuth.ts".

## Gotchas

- **Always read `PLAN.md` first** before starting the planning process.
- **Preserve progress:** If integrating, never delete or modify existing `[x]` or
  `[!]` tasks unless the user explicitly requests it.
- **Do not write or overwrite files until the user explicitly confirms the draft.**
- **Keep questions concise.** Avoid overwhelming the user with a long list of
  questions.
- **If the user says "just do it" or provides a clear list,** create the plan
  immediately and ask for confirmation, minimizing questioning.
- **If a task is too large,** break it down during the drafting phase and show
  the breakdown to the user.
