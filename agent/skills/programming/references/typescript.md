# TypeScript & Frontend Reference

## Workflow (Step 4)
- [ ] Step 1 — Format & Lint: `biome check --apply .`
- [ ] Step 2 — Type Check: `tsc --noEmit`
- [ ] Step 3 — Security: `npm audit` (or `pnpm audit`)
- [ ] Step 4 — Test: `vitest run`

## Development Standards
- **Strict Types**: Always use `strict: true` in `tsconfig.json`. Avoid `any`; prefer `unknown` for untrusted input.
- **Functional Patterns**: Prefer `const` and immutability. Use Discriminated Unions for state management.
- **Imports**: Group by: 1. React/Framework, 2. Third-party libs, 3. Internal modules, 4. Assets/Styles.

## Error Handling
- Use **Result Types** (like `ts-results`) for complex logic to avoid `try/catch` blocks for expected failures.
- Always validate external API data with **Zod** or **Valibot** before casting to a type.

## Performance Audit (Step 3.5)
- **Tool**: `biome lint` for cognitive complexity.
- **Visual**: Use `dependency-cruiser` to flag circular dependencies or "leaky" layers.
