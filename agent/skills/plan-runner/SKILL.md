---
name: plan-runner
description: Run and manage a task plan via plan tools. Usewhen the user asks to work through a plan, continue a plan, or execute tasks from a list. Also use when the user says "what's next" or "keep going" and there is a PLAN.md present.
---

## Available Tools

| Tool                | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `plan_start`        | Mark plan as actively running (sets `.pi/plan-running` flag)       |
| `plan_progress`     | Update status bar with `(done/total) task name`                    |
| `plan_general`      | Get summary: total/done/remaining/failed/progress %                |
| `plan_sections`     | List all tasks grouped by section with status: `[ ]`, `[x]`, `[!]` |
| `plan_get_section`  | Get tasks of a specific section by 1-indexed number                |
| `plan_next_section` | **Primary entry point** — find the next section with open tasks    |
| `plan_mark_done`    | Mark a task as done by section title and task text                 |
| `plan_pause`        | Pause: clear running flag, show idle status bar                    |
| `plan_done`         | Mark complete: clear flag, clear status bar                        |

## Starting Work

1. Call `plan_start` to mark the plan as actively running.
2. Call `plan_next_section` to find the next section with open tasks.
3. The tool returns the section title and all its tasks with their status.
4. Pick the first unchecked task (`[ ]`) from that section.
5. Call `plan_progress` with `taskName` (short description of what you're about to do).
6. Tell the user which task you are starting.
7. Complete the task.
8. Call `plan_mark_done` with the `section_title` and `task` text to mark it as done.
9. Repeat from step 2 until all tasks are done or the user says to stop.

After each task, briefly report what was done before moving to the next.

## Creating a New Plan

If the user wants to create a new plan:

1. Ask the user to describe the work.
2. Create PLAN.md with one task per line:

```markdown
# Plan

## Section Title

- [ ] Task one
- [ ] Task two
```

3. Tell the user the plan is ready and ask if they want to start working on it.

## Pausing

If the session ends before all tasks are done, or the user asks to stop:

1. Call `plan_pause` to save state and show idle progress in the status bar.
