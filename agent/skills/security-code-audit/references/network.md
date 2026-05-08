# Network Security: SSRF, CORS, Exfiltration & Redirects

## SSRF (Server-Side Request Forgery)
OWASP Top 10 2025 A10 — standalone category.

- User-controlled input passed directly or indirectly to an outbound HTTP request (`fetch`, `requests.get`, `http.Get`, `curl`, webhooks, URL previews, PDF generators, image processors).
- Internal cloud metadata endpoints reachable: `169.254.169.254` (AWS/GCP/Azure IMDSv1), `fd00:ec2::254` (AWS IMDSv2 IPv6), `metadata.google.internal`.
- DNS rebinding: no check that the resolved IP is not a private/loopback address after DNS resolution.
- Missing allowlist: code that blocks by checking for `localhost` or `127.0.0.1` but not the full RFC 1918 range (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), or IPv6 equivalents.
- Protocol smuggling: user-controlled scheme allows `file://`, `gopher://`, `dict://`, `ftp://` — not just `http://`.

Severity: **Critical** if internal metadata or internal services are reachable without auth; **High** otherwise.

## CORS Misconfiguration

- `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Credentials: true` — browsers block this combination, but misconfigurations that reflect the request origin (`Origin: https://evil.com` → `Access-Control-Allow-Origin: https://evil.com`) with credentials are exploitable.
- Reflecting the `Origin` header without validation: `res.setHeader('Access-Control-Allow-Origin', req.headers.origin)` — any origin is trusted.
- Overly broad origin patterns: regex like `https://.*\.example\.com` that can be bypassed with `https://evil.example.com.attacker.com`.
- Missing `Vary: Origin` response header when CORS headers vary by origin — causes incorrect caching.
- Preflight (`OPTIONS`) responses that allow all methods and headers without restriction.

## Unvalidated Redirects (Open Redirect)

- User-controlled `next`, `redirect`, `return_to`, `url` parameters used as redirect targets without validation.
- Bypass patterns to check for: `//evil.com`, `https://trusted.com.evil.com`, URL-encoded variants, `javascript:` scheme.
- Impact: phishing, OAuth redirect URI hijacking, bypassing referrer checks.
- Safe fix: use a whitelist of allowed redirect destinations, or only allow relative paths validated to stay within the application.

## Network / Exfiltration

- Sensitive data (PII, credentials, internal tokens) sent in outbound requests to third-party endpoints — analytics, logging services, error trackers.
- Missing TLS verification: `verify=False` (Python requests), `rejectUnauthorized: false` (Node.js), `InsecureSkipVerify: true` (Go) — allows MITM.
- Sensitive data in query parameters of outbound URLs (logged by servers and proxies).
- Webhooks or callbacks that POST internal data to user-supplied URLs without origin validation.

## References

- CWE-918 (SSRF), CWE-601 (Open Redirect), CWE-942 (Permissive CORS)
- OWASP Top 10 2025 A10: SSRF
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
