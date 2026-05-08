# Authentication, Authorization & Session Management

## Authentication

- **Missing authentication**: endpoints or functions that should require a valid session/token but don't check for one. Look for routes registered without an auth middleware, or middleware that can be bypassed by manipulating request parameters.
- **Credential storage**: passwords stored in plaintext, with weak hashing (MD5, SHA-1 unsalted), or without per-user salt. Only bcrypt, scrypt, argon2, or PBKDF2 with adequate iterations are acceptable.
- **Brute force**: no account lockout, rate limiting, or CAPTCHA on login, password reset, or OTP endpoints.
- **Insecure password reset**: reset tokens that are short-lived but predictable, reset links that don't expire, or reset flows that leak whether an email exists.

## Authorization & IDOR

- **Missing authorisation checks**: authenticated users accessing resources they don't own. This is OWASP 2025 A01 (Broken Access Control) and found in 94% of tested applications.
- **IDOR (Insecure Direct Object Reference)**: sequential or guessable IDs used directly in URLs or API parameters without verifying the requesting user owns the resource. A user authenticated as ID 42 should not be able to request `/invoice/43`. Look for database lookups by ID without a `WHERE owner = current_user` constraint.
- **Privilege escalation**: users able to elevate their own role or permissions via API parameters (`role=admin`), mass assignment, or missing server-side role checks.
- **Function-level access control**: admin-only routes or functions accessible by regular users because the check is only in the UI, not the server.

## Session Management

- **Session fixation**: session ID not rotated on login — attacker can pre-set a session ID and wait for the victim to authenticate.
- **Insecure session tokens**: short, predictable, or non-cryptographically-random tokens. Tokens must be generated with a CSPRNG.
- **Missing session invalidation**: logout does not invalidate the server-side session; tokens remain valid indefinitely.
- **Cookie flags**: session cookies missing `Secure` (sent over HTTP), `HttpOnly` (accessible to JS), or `SameSite=Strict/Lax` (CSRF vector). See `secrets-and-config.md` for the full header/cookie checklist.

## JWT

- **`alg: none` attack**: server accepts JWTs with `"alg": "none"` — no signature required.
- **Algorithm confusion**: server accepts both RS256 and HS256; attacker signs with HS256 using the public key as the HMAC secret.
- **Missing claim validation**: `exp`, `iss`, `aud` claims not validated on every request.
- **Sensitive data in payload**: JWTs are base64-encoded, not encrypted — PII or secrets in the payload are readable by anyone who intercepts the token.
- **Weak or hardcoded signing secret**: short HMAC secrets brute-forceable offline.

## OAuth / OIDC

- **Missing `state` parameter**: OAuth flows without a CSRF-resistant `state` value allow login CSRF attacks.
- **Unvalidated `redirect_uri`**: server accepts any redirect URI or uses prefix/substring matching rather than exact match.
- **Implicit flow**: use of the OAuth implicit flow (`response_type=token`) which exposes access tokens in the URL fragment and browser history. Deprecated in OAuth 2.1.
- **Missing `nonce` validation** (OIDC): `nonce` not included in the ID token request or not validated on receipt — allows token replay.
- **`id_token` not verified**: accepting ID tokens without verifying the signature against the provider's JWKS endpoint.

## Timing Attacks

- Comparing secrets, tokens, HMAC values, or password hashes with `==` or string equality instead of a constant-time function. Look for: Python `==` on `hmac.digest()` results (use `hmac.compare_digest`), Node.js `===` on token strings (use `crypto.timingSafeEqual`), Ruby `==` on digests (use `ActiveSupport::SecurityUtils.secure_compare`).

## References

- CWE-287 (Improper Authentication), CWE-639 (IDOR), CWE-384 (Session Fixation), CWE-347 (JWT signature not verified)
- OWASP Top 10 2025 A01: Broken Access Control, A07: Identification and Authentication Failures
- OWASP JWT Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- OAuth 2.0 Security Best Current Practice: https://datatracker.ietf.org/doc/html/rfc9700
