# Cryptography

## Weak or Broken Algorithms

- **Hashing**: MD5 and SHA-1 are cryptographically broken — not acceptable for integrity or signature use. SHA-256 minimum for general hashing; bcrypt/scrypt/argon2 for passwords.
- **Symmetric encryption**: DES, 3DES, RC4 are broken. AES is the standard; use AES-GCM (authenticated) rather than AES-CBC (unauthenticated, padding oracle risk) or AES-ECB (deterministic, pattern-leaking).
- **Asymmetric encryption**: RSA keys below 2048 bits, EC curves below 256 bits (avoid secp192r1, secp224r1). Avoid RSA-PKCS1v1.5 padding (PKCS#1 v1.5 is vulnerable to Bleichenbacher attacks); use OAEP.
- **Key exchange**: DHE with groups below 2048 bits. Prefer ECDHE.
- **TLS versions**: TLS 1.0 and 1.1 are deprecated. Enforce TLS 1.2 minimum, TLS 1.3 preferred.
- **MAC**: HMAC-MD5 and HMAC-SHA1 acceptable for legacy compatibility only; prefer HMAC-SHA256 or better.

## Insecure Randomness

- Using non-cryptographic PRNGs for security-sensitive values: `Math.random()` (JS), `random.random()` (Python), `rand()` (C/Go math package), `java.util.Random`.
- These must be replaced with a CSPRNG for: session tokens, password reset tokens, CSRF tokens, nonces, salts, API keys, OTPs.
- Correct alternatives: `crypto.randomBytes` (Node.js), `secrets.token_bytes` / `secrets.token_hex` (Python), `crypto/rand` (Go), `SecureRandom` (Java), `OsRng` (Rust).

## Key Management

- Encryption keys hardcoded in source (covered also in `secrets-and-config.md`).
- Same key used for multiple purposes (encryption key reused as signing key).
- Keys never rotated — no mechanism exists to rotate without re-encrypting all data.
- Symmetric keys stored alongside the ciphertext they protect.
- Private keys stored unencrypted at rest outside a dedicated key store (HSM, KMS, Vault).

## Integrity & Authenticity

- Data encrypted but not authenticated (AES-CBC without HMAC or AEAD mode) — vulnerable to padding oracle or bit-flipping attacks.
- Missing signature verification on received data, webhooks, or downloaded artifacts.
- Signatures verified but the signing key is not pinned or validated against a trusted root.
- JWT `none` algorithm (see `auth.md`).

## Common Footguns by Language

| Language | Pattern to flag | Safe alternative |
|---|---|---|
| Python | `hashlib.md5(password)` | `argon2-cffi`, `bcrypt` |
| Python | `random.randint()` for tokens | `secrets.token_hex()` |
| Python | `Crypto.Cipher.AES` CBC without MAC | `cryptography` library with GCM |
| JavaScript | `Math.random()` | `crypto.randomBytes()` |
| JavaScript | `CryptoJS` (legacy) | Web Crypto API / `node:crypto` |
| Go | `math/rand` | `crypto/rand` |
| Java | `new Random()` | `SecureRandom` |
| Java | `DESede` / `DES` cipher | `AES/GCM/NoPadding` |

## References

- CWE-327 (Broken Cryptographic Algorithm), CWE-338 (Insecure PRNG), CWE-310 (Cryptographic Issues)
- OWASP Top 10 2025 A02: Cryptographic Failures
- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
