# Supply Chain & Dependency Security

## Dependency Manifests to Check

| Ecosystem | Files |
|---|---|
| Node.js | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| Python | `requirements.txt`, `Pipfile`, `pyproject.toml`, `poetry.lock`, `uv.lock` |
| Ruby | `Gemfile`, `Gemfile.lock` |
| Go | `go.mod`, `go.sum` |
| Java/Kotlin | `pom.xml`, `build.gradle`, `gradle.lockfile` |
| Rust | `Cargo.toml`, `Cargo.lock` |

## Version Pinning

- **Unpinned versions** (`^1.2.3`, `~1.2`, `>=1.0`, `*`, `latest`) allow automatic upgrades to versions that may introduce vulnerabilities or breaking changes. Flag as Medium.
- **Missing lock file**: without a lock file, installs are not reproducible — a compromised or updated transitive dependency can silently enter the build. Flag as Medium.
- **Lock file not committed**: lock file exists but is in `.gitignore`. Flag as Medium.
- **Lock file out of sync**: `package.json` specifies different versions from `package-lock.json` — indicates manual editing or a partial update. Flag as Low–Medium.

## Known Vulnerable Dependencies

During Phase 3 grounding, search for CVEs against each pinned direct dependency:

```
"<package> <version> vulnerability"
"<package> <version> CVE"
"<package> <version> security advisory"
```

Also check:
- Node.js: `npm audit` output (if available); advisories at https://github.com/advisories
- Python: `pip-audit` output; PyPI advisories at https://osv.dev
- Rust: `cargo audit` output; RustSec at https://rustsec.org/advisories/
- Go: `govulncheck` output; https://pkg.go.dev/vuln/
- Java: Snyk / OWASP Dependency-Check output

## Transitive Dependencies

- Direct dependencies may themselves pull in vulnerable transitive dependencies. If a vulnerability scanner output is available, check it for transitive hits even when direct dependencies appear clean.
- Deeply nested transitive dependencies with permissive version ranges are the primary vector for supply chain attacks.

## SBOM (Software Bill of Materials)

An SBOM is a machine-readable inventory of all components in a software artifact, including transitive dependencies.

- **Absent SBOM**: Informational for most projects. Medium for projects in regulated industries (healthcare, finance, critical infrastructure) or those subject to US Executive Order 14028, EU Cyber Resilience Act, or similar mandates.
- **Accepted formats**: CycloneDX (`bom.json`, `bom.xml`) and SPDX (`sbom.spdx.json`, `sbom.spdx`) are the two dominant standards. Note which is present if found.
- **Generation tools**: `syft`, `cdxgen`, `trivy sbom`, `cargo sbom`, `cyclonedx-python`.

## Dependency Confusion / Namespace Attacks

- Internal package names that could be squatted on public registries (npm, PyPI, RubyGems). If the project uses private package names, check whether those names are claimed on the public registry.
- `postinstall` / `prepare` scripts in `package.json` that execute arbitrary code on install — review any lifecycle scripts in direct dependencies.
- Typosquatting: dependencies whose names closely resemble popular packages (`reqeusts`, `colourama`, `lodahs`).

## References

- CWE-1104 (Use of Unmaintained Third Party Components)
- OWASP Top 10 2025 A06: Vulnerable and Outdated Components
- OWASP Dependency-Check: https://owasp.org/www-project-dependency-check/
- OSV (Open Source Vulnerabilities): https://osv.dev
- SLSA supply chain security framework: https://slsa.dev
