---
name: plan-runner
description: >
  Use this skill when a PLAN.md file exists in the repository, or when the
  user asks to create a plan, work through a plan, continue a plan, or
  execute tasks from a list. Also use it when the user says "what's next"
  or "keep going" and there is a PLAN.md present.
---

# Plan Runner

## If PLAN.md does not exist

Ask the user to describe the work. Then create PLAN.md with one task per
line in this format:

```markdown
# Plan

- [ ] First task description
- [ ] Second task description
- [ ] Third task description
```

Show the plan to the user and ask for confirmation before doing any work.

## If PLAN.md exists

1. Read PLAN.md
2. Find the first unchecked item (`- [ ]`)
3. Tell the user which task you are starting
4. Complete the task
5. Mark it done by replacing `- [ ]` with `- [x]` in PLAN.md
6. Repeat from step 2 until all items are checked or the user says to stop

After each task, briefly report what was done before moving to the next.

## Gotchas

- Edit PLAN.md to mark items done immediately after finishing each task,
  not at the end of all tasks. This way the file always reflects current
  progress if the session is interrupted.
- Do not skip items or reorder them unless the user explicitly asks.
- If a task is ambiguous, ask for clarification before starting it — not
  halfway through.
- If a task fails, mark it with `- [!]` and note the reason inline, then
  ask the user whether to continue with the next task, retry or stop.
- Call `plan_start` before working on the first task
- Call `plan_done` after marking the last task `[x]`
- If the .pi folder does not exist, create it befor calling /plan_start.
