# Input Validation & Deserialization

## General Input Validation

- Validate type, length, format, and range as close to the entry point as possible.
- Prefer allowlists (what is permitted) over denylists (what is blocked) — denylists are always incomplete.
- Validate on the server side; client-side validation is UX, not security.
- Reject or fail closed on invalid input rather than attempting to sanitise and continue — silent sanitisation hides bugs.

## Unsafe Deserialization

Deserializing untrusted data with a format that supports arbitrary object instantiation can lead to RCE.

- **Python**: `pickle.loads(user_data)`, `yaml.load(data)` without `Loader=yaml.SafeLoader`, `marshal.loads`. Use `json`, `yaml.safe_load`, or schema-validated deserialization.
- **Java**: native Java serialization (`ObjectInputStream.readObject`) on untrusted data. Use JSON (Jackson with default typing disabled), or check for gadget chain mitigations (SerialKiller, NotSoSerial).
- **PHP**: `unserialize()` on user input. Use `json_decode`.
- **Ruby**: `Marshal.load` on user input. Use `JSON.parse`.
- **Node.js**: `eval(JSON.stringify(...))` or deserializing with `node-serialize` — look for patterns that execute code during deserialization.

## Type Confusion

- Loose type comparisons (`==` in PHP and JavaScript) used for security checks: `"0" == false`, `"1e4" == 10000`, `null == undefined`.
- Type juggling in authentication: `hash == user_input` where both could coerce to a falsy value.
- GraphQL / API inputs not validated for type before use — integer expected, string received, passed to arithmetic or comparison.

## File Upload Validation

- File type validated only by extension or MIME type header (both user-controlled) — not by inspecting the file magic bytes.
- Uploaded files stored with their original filename (path traversal, overwrite risk).
- Uploaded files stored in a web-accessible directory and executable (`.php`, `.jsp`, `.py` uploads leading to RCE).
- Missing file size limit — DoS via large upload.
- SVG uploads not sanitised — SVGs can contain JavaScript and trigger XSS when served inline.
- Archive uploads not inspected for Zip Slip (see `injection.md`).

## ReDoS (Regular Expression DoS)

- Regex patterns applied to user-controlled input that exhibit exponential backtracking on crafted inputs.
- Danger patterns: nested quantifiers `(a+)+`, alternation with overlap `(a|aa)+`, back-references on long strings.
- Languages particularly affected: JavaScript (single-threaded event loop — one ReDoS blocks all requests), Python (re module before 3.11 with no timeout).
- Mitigation: use linear-time regex engines (`re2`, `hyperscan`), add input length limits before regex, or set a match timeout.

## Mass Assignment

- ORM or framework automatically binds all request parameters to model fields without an explicit allowlist.
- Look for: Rails `params.permit!` or missing `permit`, Django `ModelForm` without `fields`, Node/Express spreading `req.body` directly into a database update, FastAPI models without field-level visibility control.
- Risk: user sets `is_admin=true`, `balance=99999`, or `owner_id=<other_user>` by adding fields to the request.

## References

- CWE-20 (Improper Input Validation), CWE-502 (Unsafe Deserialization), CWE-434 (Unrestricted File Upload), CWE-1333 (ReDoS), CWE-915 (Mass Assignment)
- OWASP Top 10 2025 A03: Injection, A08: Software and Data Integrity Failures
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- ReDoS checker: https://redoslyzer.secdim.com/
