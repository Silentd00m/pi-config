# Secrets, Configuration & Security Headers

## Hardcoded Secrets

- API keys, tokens, passwords, or private keys committed directly in source code or config files tracked in version control.
- Known token prefixes to scan for: `ghp_`, `gho_`, `ghs_`, `github_pat_` (GitHub), `sk-` (OpenAI), `sk-ant-` (Anthropic), `xoxb-`/`xoxp-` (Slack), `glpat-` (GitLab), `AKIA` (AWS access key ID).
- Secrets in test files or fixture data — often overlooked, still a real exposure.
- Secrets in comments: `// TODO: remove password=hunter2`.
- Private keys (PEM blocks) anywhere outside a secrets manager or dedicated key store.

## Configuration & Environment

- Secrets or environment-specific values (database URLs, API endpoints, feature flags) hardcoded rather than injected via environment variables or a secrets manager.
- `DEBUG=True` or equivalent left on in production code paths — exposes stack traces and internal state.
- Default credentials not changed: admin/admin, default API keys from SDKs, demo tokens committed alongside the code.
- Secrets passed as command-line arguments — visible in process lists and shell history.
- `.env` files committed to version control — check `.gitignore` and git history.

## Security Headers (web apps and APIs)

Check that the application sets these response headers. Missing headers are typically Low–Medium severity but are quick wins.

| Header | Required value / guidance |
|---|---|
| `Content-Security-Policy` | Restrict script/style sources; no `unsafe-inline` or `unsafe-eval` without justification |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` for HTTPS-only services |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` to prevent clickjacking (superseded by CSP `frame-ancestors` but still set for older browsers) |
| `X-Content-Type-Options` | `nosniff` — prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` or stricter |
| `Permissions-Policy` | Restrict access to camera, microphone, geolocation unless required |
| `Cache-Control` | `no-store` on responses containing sensitive data |

## Cookie Security Flags

Every cookie that carries a session token or auth credential must have:

- `Secure` — only sent over HTTPS
- `HttpOnly` — not accessible via JavaScript (`document.cookie`)
- `SameSite=Strict` or `SameSite=Lax` — prevents CSRF via cross-site requests; `None` requires `Secure` and is only acceptable for intentional cross-site cookies (e.g. embedded widgets)
- `Path` and `Domain` scoped as narrowly as possible

## References

- CWE-798 (Hardcoded Credentials), CWE-16 (Configuration), CWE-614 (Sensitive Cookie without Secure), CWE-1004 (HttpOnly)
- OWASP Top 10 2025 A02: Cryptographic Failures, A05: Security Misconfiguration
- OWASP Secure Headers Project: https://owasp.org/www-project-secure-headers/
- Have I Been Pwned API key scanner: https://haveibeenpwned.com/API/v3
