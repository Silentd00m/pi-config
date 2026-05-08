# Logging: Information Leakage & Missing Security Events

## Information Leakage

- **Stack traces exposed to clients**: full exception stack traces returned in API responses or rendered in HTML. These reveal internal file paths, framework versions, and logic that aids attackers.
- **Verbose error messages**: database errors, internal IDs, or system details returned to the client. Errors shown to users should be generic; detail stays server-side.
- **Debug endpoints left active**: `/debug`, `/admin`, `/__debug__`, `/actuator`, `/metrics`, `/env`, `/heapdump`, Spring Boot Actuator endpoints, Django `DEBUG=True` toolbar. Check framework-specific debug tooling.
- **Sensitive data in logs**: passwords, tokens, credit card numbers, SSNs, or PII written to log files. Look for logging of full request bodies, request headers containing `Authorization`, or form fields named `password`/`token`/`secret`.
- **Sensitive data in URLs**: tokens or credentials in query parameters end up in server access logs, browser history, and `Referer` headers. Should be in the request body or headers instead.
- **Internal IP addresses or hostnames** in responses — reveals network topology.

## Missing Security Event Logging

The absence of logging for security-relevant events is a finding because it makes incident detection and response impossible.

Check that the following events are logged with sufficient detail (timestamp, user ID, IP address, outcome):

| Event | Why it matters |
|---|---|
| Failed authentication attempts | Brute force detection |
| Successful authentication | Session establishment audit trail |
| Account lockout triggered | Abuse pattern detection |
| Password change / reset | Account takeover detection |
| Privilege escalation / role change | Admin abuse detection |
| Access to sensitive resources | Data access audit trail |
| Admin actions (user creation, deletion, config change) | Change audit trail |
| Input validation failures (repeated) | Attack probe detection |
| JWT / token validation failures | Token abuse detection |

Missing security event logging is typically **Low** severity but becomes **Medium** in regulated environments (HIPAA, PCI-DSS, SOC 2) where audit trails are required.

## Log Injection

- User input written directly to log files without sanitisation can corrupt log structure or inject false log entries.
- CRLF injection in logs: `\r\n` in user-controlled values creates fake log lines.
- Log format injection: user input containing log format characters (e.g. `%n`, `{` in Log4j) — see Log4Shell (CVE-2021-44228) for the extreme case.
- Mitigation: sanitise or encode user input before logging; use structured logging (JSON) where field boundaries are enforced.

## References

- CWE-209 (Information Exposure Through Error Messages), CWE-532 (Sensitive Information in Log Files), CWE-778 (Insufficient Logging)
- OWASP Top 10 2025 A09: Security Logging and Monitoring Failures
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
