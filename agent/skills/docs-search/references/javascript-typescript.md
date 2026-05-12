# JavaScript / TypeScript — Local Documentation

No native doc lookup tool equivalent to `go doc` or `pydoc` exists for JS/TS.
The ecosystem relies on browser-based docs and IDE tooling. The approaches
below give an agent practical offline access.

---

## Lookup — read `.d.ts` files directly

TypeScript declaration files are the canonical source of truth for type
signatures, JSDoc comments, and often usage examples. Reading them directly
is more accurate than any generated documentation.

### Find the declaration file for a package

```bash
# Check the package's own types field
node -e "const p = require('./node_modules/<pkg>/package.json'); console.log(p.types || p.typings || p.main)"

# Or locate it directly
find node_modules/<pkg> -name "*.d.ts" | head -5
find node_modules/@types/<pkg> -name "*.d.ts" | head -5
```

For packages without bundled types, check `@types/<pkg>`:

```bash
ls node_modules/@types/<pkg>/
```

### Read the declaration file

Once located, read it with the `read` tool. Most packages have a single
`index.d.ts` or a small number of declaration files. Read the relevant one
directly — it will contain all exported types, function signatures, and JSDoc.

**This is the fastest path when you know the package name.**

---

## Search — qi with `.d.ts` files

Index declaration files into qi for BM25 search across all installed packages.
No conversion step needed — `.d.ts` files are already text.

Configure qi to index `.ts` files by adding the extension to your qi config,
or copy `.d.ts` files to `.txt` equivalents. The simpler approach is to index
the `@types` directory and the project's own declaration files:

```bash
# Index all @types packages (third-party type definitions)
qi index node_modules/@types          # name auto-generated from path

# Re-index after npm install
qi index node_modules/@types          # name auto-generated from path
```

Then search (use `qi list` to find the collection name):

```bash
qi search "async iterator protocol" -c <collection> -n 5
qi search "ReadableStream controller" -c <collection> -n 5
```

For packages that bundle their own types (not in `@types`), index them
separately or add their paths to the same collection.

---

## Node.js stdlib — Dash docset

Node.js stdlib docs are not covered by `.d.ts` files in `node_modules`. Use
the Dash workflow from the main skill:

- Docset name: `Node.js` in Dash-User-Contributions
- Collection name: `nodejs`

```bash
qi search "child_process spawn options" -c nodejs -n 5
```

---

## Web APIs (browser) — MDN Dash docset

For browser APIs (`fetch`, `WebSocket`, `ReadableStream`, DOM, etc.):

- Docset name: `MDN` in Dash-User-Contributions
- Collection name: `mdn`

```bash
qi search "IntersectionObserver threshold" -c mdn -n 5
```

---

## Runtime introspection

For checking what a module exports at runtime (shape, not types):

```bash
node -e "console.log(Object.keys(require('<pkg>')))"
node -e "const m = require('<pkg>'); console.log(typeof m, Object.getOwnPropertyNames(m))"
```

Useful for CommonJS packages without declaration files, but gives no type
or documentation information.

---

## Workflow

1. Know the package, need type/signature → find and read `index.d.ts`
2. Searching across installed packages → `qi search "<term>" -c <collection>`
3. Node.js stdlib → `qi search "<term>" -c nodejs`
4. Browser/Web APIs → `qi search "<term>" -c mdn`
5. Collection not indexed → follow Dash workflow in main skill

---

## Gotchas

**`@types` packages must be installed** for `node_modules/@types/` to contain
anything. If a project uses `noImplicitAny` but hasn't installed `@types`
packages, declaration files may be absent — check `package.json` devDependencies.

**Some packages bundle their own types** (no `@types` needed). Check the
`types` or `typings` field in the package's `package.json` to find them.

**qi may need extension configuration** to index `.d.ts` files. If `qi index`
produces an empty collection, check that `.ts` is in the extensions list in
`~/.config/qi/config.yaml`.
