---
name: git-repo-state
description: >
  Use this skill at the start of any coding task on a local repository,
  even if the user doesn't mention git. Use it when the user asks to add a
  feature, fix a bug, refactor, or make any change that will touch source
  files — phrases like "let's start coding," "make this change," "add X,"
  or "fix Y" all qualify. Do not skip this skill because the task seems
  small or the user seems to be in a hurry.
---

# Git Repository State Check

Run this before writing any code. Do not skip steps.

1. Check for uncommitted changes
2. Review recent commits
3. Decide on branching

## Step 1 — Uncommitted changes

```bash
git status --short && git diff --stat
```

If anything is uncommitted, **stop and ask before continuing**:

> "There are uncommitted changes in [files]. Should I commit them first,
> or leave them as-is?"

Wait for the answer. Do not stash, commit, or discard without instruction.

## Step 2 — Recent commits

```bash
git log --oneline -10
```

Use the output to understand the current direction and commit style.
Match the scope and tone of upcoming commits to what's already there.

## Step 3 — Branching

```bash
git branch --show-current
```

**If the task is a new feature and the current branch is a trunk branch
(`main`, `master`, `develop`, `trunk`):**

Ask:

> "You're on [branch]. Should I create a feature branch before starting,
> or work directly on [branch]?"

If yes, create the branch before touching any files:

```bash
git checkout -b feature/<short-kebab-description>
```

**Otherwise** (already on a feature branch, or task is a fix): continue.

## Gotchas

- Do not run `git stash` unless the user explicitly asks for it.
- Branch names like `dev` or `development` may be treated as trunk by the
  team — ask rather than assume.
- If the user says "just do it" or "don't worry about git," skip Step 3
  only. Still check for uncommitted changes.
