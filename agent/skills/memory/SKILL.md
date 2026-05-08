---
name: memory
description: Store, retrieve, and manage project knowledge via the knowledge graph. Use when you need to persist information across sessions, look up prior decisions or context, search for known entities, or organize facts about the project, users, or their preferences.
---

# Memory (Knowledge Graph)

## When to use memory

- **At session start:** Read the graph to pick up context from previous sessions.
- **During a task:** Store important decisions, user preferences, or project facts so they persist across sessions.
- **Before finishing:** Save any new learnings so the next session starts with full context.

## Tools

| Tool                         | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `memory_read_graph`          | Read the entire knowledge graph                                |
| `memory_search_nodes`        | Search for nodes by query (matches names, types, observations) |
| `memory_open_nodes`          | Open specific nodes by name to get full details                |
| `memory_create_entities`     | Create new entities in the graph                               |
| `memory_create_relations`    | Create relations between existing entities (use active voice)  |
| `memory_add_observations`    | Add observations (facts/notes) to existing entities            |
| `memory_delete_entities`     | Delete entities and their relations                            |
| `memory_delete_observations` | Delete specific observations                                   |
| `memory_delete_relations`    | Delete specific relations                                      |

## Best practices

- **Be specific with entity names** — use descriptive names like `AuthModule` instead of `module`.
- **Use active voice for relations** — `"AuthModule implements JWT validation"` not `"JWT validation is implemented by AuthModule"`.
- **Store actionable facts as observations** — decisions, constraints, user preferences, known bugs.
- **Don't store ephemeral state** — things that only matter for the current task don't need to persist.

| ✅ Store                          | ❌ Don't store                   |
| --------------------------------- | -------------------------------- |
| User prefers tabs over spaces     | Current file being edited        |
| AuthModule uses JWT RS256         | Which task is next in plan       |
| API returns 429 after 100 req/min | Temp variable value              |
| Build requires `--features ssl`   | Intermediate plan revision state |

- **Search before creating** — check if an entity already exists before creating a duplicate.
