## General

- Avoid reading too many files at once. You WILL run out of context.
- When a plan is running, do not stop and wait for user feedback.
- Work in small chunks to allow auto-compaction to do its work to keep your context clean.

## Memory
Read MEMORY.md at the start of every session if it exists.

## Session History
Use `vcc_recall` ONLY when:
- The user explicitly asks about past work
- You hit a specific blocker that cannot be resolved from current files

Do NOT call vcc_recall, session_search, or session_read proactively.
Do NOT read files speculatively before identifying the exact task.
Start with the minimum context needed and fetch more only if blocked.
