---
name: docs-search
description: >
  Search local documentation. Use when you need to look up an API,
  function signature, module, type, or any language/library reference during a
  coding task — before guessing at a signature, making an assumption about
  behaviour, or reaching for web search. Also use when the programming skill's
  reference files don't cover a specific API in enough depth.
---

# docs-search

Offline-first documentation lookup. Always try the **native tool** for the
current language first — it is faster, requires no indexing, and covers
project dependencies automatically. Fall back to **qi** when no native tool
exists or when the native tool does not cover what you need.

Use docs-search **before** guessing. Guessing costs compile cycles and
produces hallucinated APIs.

---

## Step 1 — Try the native tool

Load the reference file for the current language and follow it. Each file
documents the native lookup and search tools available for that language,
and when to fall through to qi.

| Language | Reference file |
|---|---|
| Rust | `references/rust.md` |
| Go | `references/go.md` |
| Python | `references/python.md` |
| JavaScript / TypeScript | `references/javascript-typescript.md` |
| Bash / shell | `references/bash.md` |
| Puppet | `references/puppet.md` |

Load with: `/skill_read path=docs-search/references/<language>.md`

If the language is not in the table, skip to Step 2.

---

## Step 2 — qi search

Use qi when the native tool is unavailable, has no search capability, or
the collection covers material the native tool doesn't (e.g. module-level
docs, third-party libraries, language reference prose).

### Quick reference

```bash
qi list                                   # list all indexed collections
qi search "query" -c <collection>         # BM25 search
qi search "query" -c <collection> -n 5   # limit results
qi ask "question" -c <collection>         # LLM Q&A with citations (needs provider)
qi get <doc-id> -c <collection>           # retrieve full document by ID
qi stats -c <collection>                  # collection size / index health
qi index <path> --name <collection>       # index or re-index a directory
```

### Known collections

| Language / Library | Collection name | Docset source           |
|--------------------|-----------------|-------------------------|
| Python (stdlib)    | `python`        | Dash-User-Contributions |
| Node.js stdlib     | `nodejs`        | Dash-User-Contributions |
| MDN Web APIs       | `mdn`           | Dash-User-Contributions |
| Puppet             | `puppet`        | Dash-User-Contributions |
| Bash / man pages   | `bash`          | Dash-User-Contributions |

For languages not listed, check Dash-User-Contributions first (Step 2a),
then fall back to the official documentation source (Step 2b).

If the collection is already indexed → search immediately.
If not → download and index it first (Steps 2a–2b).

### Step 2a — Download from Dash-User-Contributions

```bash
NAME="Python_3"   # title-cased docset name
mkdir -p .qi-staging/$NAME
curl -fL \
  "https://raw.githubusercontent.com/Kapeli/Dash-User-Contributions/master/docsets/${NAME}/${NAME}.tgz" \
  -o .qi-staging/$NAME/${NAME}.tgz
```

If curl returns HTTP 404, the tarball has moved to Kapeli's CDN — use Step 2b.

If the download succeeds, extract and convert:

```bash
tar -xzf .qi-staging/$NAME/${NAME}.tgz -C .qi-staging/$NAME/
DOCS_DIR=$(find .qi-staging/$NAME -type d -name "Documents" | head -1)
```

Convert each HTML file to Markdown using the `html2md` tool — once per file:

```
for each .html file under $DOCS_DIR:
  html2md({ path: "<file>.html", output: "<file>.md" })
```

Then index:

```bash
qi index "$DOCS_DIR" --name <collection>
```

### Step 2b — Fall back to official documentation

Use crawl4ai to scrape the official documentation. Save each page as a `.md`
file into `.qi-staging/<collection>/`, then index:

```bash
qi index ./.qi-staging/<collection> --name <collection>
```

Add `.qi-staging/` to `.gitignore` — it is a build artefact, not source.

---

## Integration with the programming skill

Reach for docs-search when:

- Unsure of an exact signature, return type, or trait bound.
- A compiler error references an unfamiliar type or method.
- About to write code against stdlib or a dependency where getting the
  details wrong wastes a compile cycle.

---

## Gotchas

**Dash-User-Contributions tarballs for popular languages may be absent.**
Once a docset moves to Kapeli's CDN it is removed from the repo. If the curl
404s, use Step 2b.

**qi collection names are case-sensitive.** Standardise on lowercase to avoid
accidental duplicates.

**Large docsets take 1–2 minutes to index.** One-time cost; re-indexes of
unchanged files are fast.

**Re-index stale collections** with `qi index <original-path> --name <collection>`.
qi is content-addressable so re-indexing only processes changed files.
