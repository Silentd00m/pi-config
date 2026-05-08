---
name: security-code-audit
version: 1.1.0
description: >
  Perform a thorough, context-safe security audit of one or more source files.
  Use this skill whenever the user asks to: audit code for security risks,
  find vulnerabilities, check for data exfiltration risks, review code safety,
  analyze a file for security issues, or produce a security report. Trigger even
  when the user just says "check this file for issues" or "is this code safe?" —
  any security-flavored code review belongs here.
metadata:
  requires-skill: plan-runner # This skill writes PLAN.md; plan-runner executes it
---

# Security Code Audit

A structured, context-safe workflow for auditing source files for security
vulnerabilities and producing a grounded, well-researched report.

---

## When to use this skill

- Auditing any source file for security risks
- Producing a formal security report from an existing findings file
- Reviewing network-related, auth-related, or data-handling code
- Any request involving "security", "vulnerability", "risk", "exploit", "safe to deploy?"

---

## Inputs

- **Target file(s)**: one or more source files to audit (path or uploaded content)
- **Optional scope hints**: e.g. "focus on network calls", "look for secrets", "check for OWASP Top 10"
- **Optional output path**: where to write `PLAN.md`, `FINDINGS.md`, and `REPORT.security.md` (default: current working directory)

---

## Skill Dependency

This skill **requires** the `plan-runner` skill. Before executing Phase 0:

1. Call `/skill_read path=plan-runner/SKILL.md`
2. Keep its instructions in mind — you will hand off to it after writing PLAN.md

---

## Scope Override (Fast Path)

If the user provides a **narrow scope hint** (e.g. "just check for secrets",
"only look at auth", "focus on network calls"), skip the full audit and run a
targeted pass:

1. Note the scope at the top of `PLAN.md` under `**Scope**`.
2. In Phase 1, load and apply only the reference file(s) relevant to that scope.
3. Mark all other categories as `skipped (out of scope)` in `FINDINGS.md`.
4. Proceed normally through Phase 3 and Phase 4, omitting empty severity sections.

> A targeted audit is better than a shallow full audit. State the scope clearly
> in the Executive Summary.

---

## Workflow

### Phase 0 — Write `PLAN.md`, then hand off to plan-runner

Write a concrete checklist to `PLAN.md` before doing any analysis:

```markdown
# Security Audit Plan

**Target**: <file(s)>
**Scope**: <user hints, or "full audit">

## Steps

- [ ] Detect language, framework, and role of the code
- [ ] Load relevant reference files for the detected stack
- [ ] Read target file(s) in chunks (~100–150 lines) and analyse each chunk
- [ ] For every finding, immediately append it to `FINDINGS.md`
- [ ] Repeat until the entire file is analysed
- [ ] Audit dependency manifests for supply chain issues
- [ ] Compact context to free memory
- [ ] Re-read `FINDINGS.md` from disk
- [ ] Ground each finding: search for uncertain CVEs/CWEs/library behaviour
- [ ] Annotate or remove false positives
- [ ] Write `REPORT.security.md` — Executive Summary
- [ ] Write `REPORT.security.md` — Critical Findings
- [ ] Write `REPORT.security.md` — High Findings
- [ ] Write `REPORT.security.md` — Medium Findings
- [ ] Write `REPORT.security.md` — Low / Informational Findings
- [ ] Write `REPORT.security.md` — Remediation Roadmap & References
```

> Each `- [ ]` item must be on its own line with no numbering prefix.

#### Hand off to plan-runner (MANDATORY — do not skip)

After writing `PLAN.md`:

1. Call `/skill_read path=plan-runner/SKILL.md`
2. Let plan-runner take over — it calls `/plan_start`, iterates tasks, and calls
   `/plan_done`. Do not execute PLAN.md yourself.

---

### Phase 1 — Framework Detection + Incremental Analysis → `FINDINGS.md`

> Write every finding to disk _immediately_ as you discover it. Never
> accumulate findings in memory.

#### Step 1a — Detect language and framework

Identify language, framework/runtime, and role of the code. Record at the top
of `FINDINGS.md`:

```markdown
## Audit Context

**Language**: Python
**Framework**: Django (REST framework)
**Role**: Web API backend
**Dependency manifest found**: requirements.txt
```

#### Step 1b — Load reference files

Before reading any code, load the reference files relevant to the detected
stack. For a full audit, load all of them. For a targeted audit, load only
those matching the scope.

| Reference file | Categories covered |
|---|---|
| `references/injection.md` | SQL, shell, template, path-traversal, Zip Slip, LDAP, XXE, prototype pollution |
| `references/auth.md` | Authentication, authorization, IDOR, session management, JWT, OAuth/OIDC, timing attacks |
| `references/network.md` | SSRF, CORS, open redirect, exfiltration, TLS |
| `references/secrets-and-config.md` | Hardcoded secrets, env config, security headers, cookie flags |
| `references/crypto.md` | Weak algorithms, insecure randomness, key management, integrity |
| `references/input.md` | Input validation, unsafe deserialization, type confusion, file upload, ReDoS, mass assignment |
| `references/supply-chain.md` | Vulnerable dependencies, version pinning, lock files, SBOM, dependency confusion |
| `references/logging.md` | Information leakage, missing security event logging, log injection |
| `references/dos-and-logic.md` | Rate limiting, unbounded queries, race conditions, business logic flaws |

Load each with: `/skill_read path=security-code-audit/references/<file>`

#### Step 1c — Analyse code chunks

Read the target file(s) in logical chunks (~100–150 lines). For each chunk,
apply the guidance from the loaded reference files. Write each finding to
`FINDINGS.md` immediately using the format below.

#### Step 1d — Dependency audit

Apply `references/supply-chain.md` guidance to any manifest files found.

---

### Finding format (`FINDINGS.md`)

```markdown
## [SEVERITY] <Short Title>

**File**: `path/to/file.ts`
**Lines**: 42–57
**Category**: Injection / SSRF / Auth / etc.
**Severity**: Critical | High | Medium | Low | Informational

### Description

One-paragraph description of the issue and why it is a risk.

### Evidence

\`\`\`
code snippet or paraphrased logic
\`\`\`

### Initial Recommendation

Root cause and correct approach — no concrete replacement code.

---
```

Severity scale:

| Level | Meaning |
|---|---|
| **Critical** | Exploitable without auth; direct data loss or RCE |
| **High** | Exploitable with minimal effort; significant impact |
| **Medium** | Requires specific conditions; moderate impact |
| **Low** | Minor issue, defence-in-depth, best-practice gap |
| **Informational** | No direct risk; worth noting for code quality |

---

### Phase 2 — Compact

Compact conversation history after analysis so Phase 3 starts with a fresh
context budget. If no compact command is available, flush remaining notes to
`FINDINGS.md` and proceed.

---

### Phase 3 — Grounding & Research

1. Re-read `FINDINGS.md` from disk.
2. For each finding, ask: *"Am I confident this is actually a vulnerability
   in this context?"*
   - If uncertain: search the web — `"<library> <version> CVE"`,
     `"CWE-<id> example"`, `"OWASP 2025 <category>"`.
3. Annotate or remove false positives.
4. Collect CVEs, CWEs, and OWASP Top 10 2025 links for the report.

---

### Phase 4 — Write `REPORT.security.md` (section by section)

Write each section to disk before starting the next.

```markdown
# Security Audit Report

**File(s) audited**: …
**Date**: …
**Auditor**: pi
**Summary**: X Critical, Y High, Z Medium, W Low, V Informational findings.

## Executive Summary

[2–4 paragraph non-technical overview. State scope if a scope override was used.]

## Critical Findings

[One subsection per finding: description, evidence, impact, remediation guidance, references.]

## High Findings

…

## Medium Findings

…

## Low / Informational Findings

…

## Remediation Roadmap

[Prioritised action list. Group quick wins vs longer-term work.]

## References

[CVEs, CWEs, OWASP Top 10 2025 links (https://owasp.org/Top10/).]
```

---

## Context safety rules (always follow)

1. Write findings and report sections to disk immediately — never hold more than one in memory.
2. Re-read files from disk at the start of Phase 3 and Phase 4.
3. Chunk large files — never load > ~150 lines at once.
4. If context runs low mid-analysis, flush the current finding and write `<!-- PAUSED HERE: line N -->` in `FINDINGS.md`.

---

## Output files

| File | Purpose |
|---|---|
| `PLAN.md` | Checklist written before execution |
| `FINDINGS.md` | Incremental findings written during analysis |
| `REPORT.security.md` | Final polished report |

---

## Pre-flight checklist

- [ ] PLAN.md written to disk
- [ ] plan-runner loaded via `/skill_read`
- [ ] Language/framework detection is the first task in PLAN.md
- [ ] Reference files listed in PLAN.md as a load step
- [ ] Dependency manifest audit included in PLAN.md

If any box is unchecked, **do not proceed** — complete that step first.
