# Injection

## What to look for

- **SQL injection**: string concatenation or format strings used to build queries instead of parameterised queries / prepared statements. Look for raw `execute(f"... {user_input}")`, `query + variable`, ORM `.raw()` calls with interpolation.
- **Shell injection**: user input passed to `subprocess`, `exec`, `os.system`, `child_process.exec`, backtick execution, or shell=True without sanitisation. Any call that constructs a command string from external input.
- **Template injection (SSTI)**: user-controlled strings rendered by a template engine (Jinja2, Twig, Pebble, Freemarker, Handlebars). Particularly dangerous when the template string itself comes from user input rather than a static file.
- **Path traversal**: user-controlled filenames or paths not normalised before use. Look for `open(user_input)`, `path.join(base, user_input)` without a check that the result is still under `base`, or archive extraction without stripping `../` sequences.
- **Zip Slip**: path traversal via crafted archive entries. Any code that extracts `.zip`, `.tar`, `.tar.gz`, `.jar` without validating that each entry's resolved path stays within the target directory. Look for loops over `zipfile.extractall`, `tarfile.extract`, or manual entry-by-entry extraction without a containment check.
- **LDAP injection**: user input interpolated into LDAP filter strings without escaping. Look for `(&(uid=` + variable constructions.
- **XML/XXE (XML External Entity)**: XML parsers configured with external entity resolution enabled. In Python: `lxml` with `resolve_entities=True`; in Java: `DocumentBuilderFactory` without `FEATURE_SECURE_PROCESSING`; in Node: `libxmljs` with `noent: true`. Any parser that accepts user-supplied XML is a candidate.
- **Prototype pollution** (JavaScript/TypeScript): recursive merge or deep-clone functions that do not guard against `__proto__`, `constructor`, or `prototype` keys. Look for `merge(target, userObj)`, `Object.assign` with unsanitised sources in recursive contexts, or JSON parsed directly into object spread.

## Severity guidance

| Pattern | Typical severity |
|---|---|
| SQL injection with no WAF | Critical |
| Shell injection on server | Critical |
| Path traversal reading arbitrary files | High |
| Zip Slip overwriting server files | High |
| SSTI with full template engine access | Critical |
| XXE with external entity resolution | High |
| LDAP injection | High |
| Prototype pollution | Medium–High depending on context |

## References

- CWE-89 (SQL Injection), CWE-78 (OS Command Injection), CWE-22 (Path Traversal), CWE-91 (XML Injection), CWE-1321 (Prototype Pollution)
- OWASP Top 10 2025 A03: Injection
- Zip Slip: https://github.com/snyk/zip-slip-vulnerability
