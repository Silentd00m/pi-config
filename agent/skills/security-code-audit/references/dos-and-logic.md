# DoS, Rate Limiting & Business Logic

## Rate Limiting & DoS

- **Authentication endpoints without rate limiting**: login, password reset, OTP/MFA, account registration. Without rate limiting, these are trivially brute-forced. Flag as High on login/OTP endpoints, Medium elsewhere.
- **Resource-intensive endpoints without throttling**: endpoints that trigger expensive database queries, external API calls, file processing, or cryptographic operations — an unauthenticated caller can exhaust server resources.
- **Unbounded pagination**: `GET /items?limit=999999` or no `limit` parameter enforced server-side. A single request can dump an entire database table.
- **Unbounded query results**: ORM queries without `.limit()` or equivalent, or where the limit is read from user input without a maximum cap.
- **Algorithmic complexity attacks**: operations whose time or memory cost is super-linear in input size and where input size is user-controlled. Sorting, nested loops over user-supplied lists, recursive operations on user-supplied tree structures.
- **ReDoS**: covered in detail in `input.md`.
- **Missing timeouts**: outbound HTTP requests, database queries, or long-running operations without a timeout — a slow external service hangs the server.
- **Zip bomb / decompression bomb**: archives that expand to many times their compressed size. Check that decompression sets an output size limit before extracting.

## Business Logic

- **Race conditions / TOCTOU (Time-of-Check to Time-of-Use)**: a condition is checked, then time passes before the action based on that check is taken. Classic example: check balance → deduct balance, where a concurrent request can pass the check before the deduction commits. Look for non-atomic read-then-write sequences on shared state.
- **Insecure defaults**: features that should be opt-in are opt-out; security controls disabled by default; new users created with elevated permissions; debug/test features enabled unless explicitly disabled.
- **Mass assignment**: covered in `input.md`.
- **Negative values / integer overflow**: financial calculations, inventory counts, or counters that do not validate for negative inputs or integer overflow — users transferring negative amounts to increase their own balance.
- **Workflow bypass**: multi-step processes (checkout, approval workflows, onboarding) where a later step can be reached directly without completing earlier steps. Look for state that is derived entirely from client-supplied parameters rather than server-side session state.
- **Privilege assumed from context**: assuming a user is an admin because they reached a certain endpoint, rather than checking their actual role. Relying on `Referer` or UI flow as a security control.
- **Predictable resource identifiers**: sequential IDs, timestamp-based tokens, or other guessable values for password reset links, invite tokens, or temporary access URLs.
- **Double-spend / replay**: operations that should be idempotent but are not, allowing the same request to be replayed to trigger the action multiple times. Look for missing idempotency keys on payment or state-change operations.

## References

- CWE-307 (Brute Force), CWE-770 (Allocation Without Limits), CWE-362 (Race Condition / TOCTOU), CWE-840 (Business Logic Errors)
- OWASP Top 10 2025 A04: Insecure Design
- OWASP Business Logic Testing: https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/10-Business_Logic_Testing/
- OWASP Denial of Service Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
