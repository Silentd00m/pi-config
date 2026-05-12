# Rust — Local Documentation

No working native CLI doc viewer exists for Rust. `rusty-man` (the only
candidate) is broken due to yanked transitive dependencies and has not been
maintained since 2021. Use the approaches below instead.

---

## Lookup — read `cargo doc` output directly

`cargo doc` generates HTML documentation in `target/doc/` for the project and
all its dependencies. Each item gets its own HTML file.

```bash
cargo doc                         # build docs (re-run when dependencies change)
```

Find and read the file for a specific type or function:

```bash
find target/doc -name "<symbol>*.html" | head -5
```

Then read the file with the `read` tool — it contains the full signature, doc
comments, and trait implementations.

---

## Search — qi over `target/doc/`

Index the generated documentation into qi for BM25 search. Convert HTML to
Markdown first using `html2md` with `recursive: true` and `output: ".docs/"`, then index:

```
html2md({ file: "target/doc", recursive: true, output: ".docs/" })
```

```bash
qi index target/doc                    # name auto-generated from path
```

Or scope to a single crate:

````
html2md({ file: "target/doc/<crate_name>", recursive: true, output: ".docs/" })

```bash
qi index target/doc/<crate_name>       # name auto-generated from path
````

Then search (use `qi list` to find the auto-generated collection name):

```bash
qi search "trait object dynamic dispatch" -c <collection> -n 5
qi search "async stream poll" -c <collection> -n 5
```

Use a project-specific collection name rather than `rust` to avoid colliding
with a generic stdlib collection and to reflect that the docs cover the exact
dependency versions in use.

Re-run `cargo doc` and re-index whenever dependencies change.

---

## stdlib only — Dash docset

For Rust stdlib without building project docs, use the Dash workflow from the
main skill:

- Docset name: `Rust` in Dash-User-Contributions
- Collection name: `rust`

```bash
qi search "Iterator flat_map" -c rust -n 5
```

---

## Workflow

1. Know the crate and symbol → `find target/doc -name "<symbol>*.html"` then read the file
2. Searching project deps → `qi search "<term>" -c <collection>` (after indexing)
3. Searching stdlib only → `qi search "<term>" -c rust`
4. Collections not indexed → follow Dash workflow in main skill
