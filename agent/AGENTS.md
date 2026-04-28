## Memory

Read MEMORY.md at the start of every session if it exists.

## Session History

If you need context from earlier in this session that may have been compacted away, use the `vcc_recall` tool to search session history. It supports regex and multi-word queries.

Examples:
- `vcc_recall({ query: "auth token" })` — search for relevant entries
- `vcc_recall({ query: "hook|inject" })` — regex search
- `vcc_recall()` — browse last 25 entries
- `vcc_recall({ expand: [41, 42] })` — get full content for specific entries

Use this proactively when resuming after a compaction or when you're unsure what was done earlier.
