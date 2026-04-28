---
name: security-code-audit
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

A structured, context-safe workflow for auditing source files for security vulnerabilities and producing a grounded, well-researched report.

---

## When to use this skill

- Auditing any source file for security risks (injection, exfiltration, auth bypass, hardcoded secrets, insecure dependencies, etc.)
- Producing a formal security report from an existing findings file
- Reviewing network-related, auth-related, or data-handling code
- Any request involving "security", "vulnerability", "risk", "exploit", "safe to deploy?"

---

## Inputs

- **Target file(s)**: one or more source files to audit (path or uploaded content)
- **Optional scope hints**: e.g. "focus on network calls", "look for secrets", "check for OWASP Top 10"
- **Optional output path**: where to write `PLAN.md`, `FINDINGS.md`, and `REPORT.md` (default: current working directory)

---

## Skill Dependency

This skill **requires** the `plan-runner` skill. Before executing Phase 0:

1. Read the plan-runner skill with `skill_read path=plan-runner/SKILL.md`
2. Keep its instructions in mind — you will hand off to it after writing PLAN.md

---

## Workflow

### Phase 0 — Write `PLAN.md`, then hand off to plan-runner

Before doing any analysis, write a concrete checklist of every step to `PLAN.md`. Use the template below, filling in the target file(s) and any scope hints from the user.

```markdown
# Security Audit Plan

**Target**: <file(s)>
**Scope**: <user hints, or "full audit">

## Steps

- [ ] Read target file(s) in chunks (~100–150 lines) and analyse each chunk for security issues
- [ ] For every finding discovered, immediately append it to `FINDINGS.md` (do not batch)
- [ ] Repeat until the entire file is analysed
- [ ] Compact context to free memory
- [ ] Re-read `FINDINGS.md` from disk
- [ ] For each finding, assess confidence; search the web for any uncertain CVE/CWE/library behaviour
- [ ] Annotate or remove false positives found during grounding
- [ ] Write `REPORT.security.md` — Executive Summary
- [ ] Write `REPORT.security.md` — Critical Findings
- [ ] Write `REPORT.security.md` — High Findings
- [ ] Write `REPORT.security.md` — Medium Findings
- [ ] Write `REPORT.security.md` — Low / Informational Findings
- [ ] Write `REPORT.security.md` — Remediation Roadmap & References
```

> **Note**: Each `- [ ]` item must be on its own line with no numbering prefix. The plan-runner matches on `- [ ]` to find unchecked items.

#### Hand off to plan-runner (MANDATORY — do not skip)

The `plan-runner` skill is responsible for executing `PLAN.security.md` sequentially — task by task, marking progress, and calling `plan_start` / `plan_done`. This skill **only writes the plan and the phase guidance**. Plan-runner does the rest.

After writing `PLAN.security.md`, follow these steps **in order**:

1. **Load plan-runner**: Call `skill_read` to load `plan-runner/SKILL.md`
2. **Follow plan-runner instructions**: Let plan-runner take over. It will:
   - Call `plan_start()`
   - Iterate through each `- [ ]` in PLAN.md one at a time
   - Use the Phase 1–4 guidance below to know how to implement each step
   - Mark items `- [x]` as it completes them
   - Call `plan_done()` when finished

> **STOP HERE** — Do not execute PLAN.md yourself. Do not manually call `plan_start()`, do not iterate through tasks, and do not write findings or the report directly.
> Plan-runner is the executor. Phases 1–4 below are the implementation guidance plan-runner will use for each step.

---

### Phase 1 — Incremental Analysis → `FINDINGS.security.md`

> **Key principle**: write every finding to disk _immediately_ as you discover it. Do not accumulate findings in memory and write them all at the end — the context window may not survive that long.

1. Open and read the target file(s) in logical chunks (function by function, module by module, or in blocks of ~100–150 lines for large files).
2. For each chunk, look for issues across these categories (not exhaustive — use judgment):
   - **Secrets / credentials**: hardcoded API keys, tokens, passwords, private keys
   - **Network / exfiltration**: unvalidated outbound requests, data sent to untrusted endpoints, missing TLS checks, SSRF
   - **Injection**: SQL, shell, template, path-traversal, prototype pollution
   - **Authentication / authorization**: missing checks, insecure session handling, privilege escalation paths
   - **Cryptography**: weak algorithms, insecure random, missing integrity checks
   - **Input validation**: missing sanitization, unsafe deserialization, type confusion
   - **Dependency risks**: calls to known-vulnerable APIs or patterns
   - **Logic / business logic**: race conditions, TOCTOU, insecure defaults
   - **Information leakage**: verbose errors, stack traces, debug endpoints left on

3. **Immediately after identifying a finding**, append it to `FINDINGS.security.md` using the format below. Do not wait.

4. Continue to the next chunk. Repeat until the entire file is analyzed.

#### `FINDINGS.security.md` entry format

```markdown
## [SEVERITY] <Short Title>

**File**: `path/to/file.ts`
**Lines**: 42–57
**Category**: Network / Exfiltration
**Severity**: Critical | High | Medium | Low | Informational

### Description

One-paragraph description of the issue and why it is a risk.

### Evidence

\`\`\`
code snippet or paraphrased logic
\`\`\`

### Initial Recommendation

Brief remediation idea (will be refined in the report).

---
```

Severity scale:

| Level             | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| **Critical**      | Exploitable without auth; direct data loss or RCE   |
| **High**          | Exploitable with minimal effort; significant impact |
| **Medium**        | Requires specific conditions; moderate impact       |
| **Low**           | Minor issue, defence-in-depth, best-practice gap    |
| **Informational** | No direct risk; worth noting for code quality       |

---

### Phase 2 — Compact

> Skip this step if running in an environment without a compact command.

After finishing the analysis, compact the conversation history so Phase 3 starts with a fresh context budget.

---

### Phase 3 — Grounding & Research

1. Re-read `FINDINGS.security.md` from disk (do not rely on memory).
2. For each finding, ask: _"Am I confident this is actually a vulnerability in this context, or could I be wrong?"_
   - If uncertain: search the web for the relevant CVE, pattern, or library behaviour before finalising.
   - Use searches like: `"<library name> <version> <vulnerability type>"`, `"<pattern> security risk"`, `"CWE-<id> example"`.
3. Annotate or correct any findings that grounding reveals were false positives or required nuance.
4. Note external references (CVEs, CWEs, OWASP links) to include in the report.

---

### Phase 4 — Write `REPORT.security.md` (section by section)

> **Key principle**: write each section to disk as soon as it is complete. Do not draft the entire report in memory.

Structure:

```markdown
# Security Audit Report

**File(s) audited**: …
**Date**: …
**Auditor**: Clanker
**Summary**: X Critical, Y High, Z Medium, W Low, V Informational findings.

## Executive Summary

[2–4 paragraph non-technical overview of the most important risks and overall security posture.]

## Critical Findings

[One subsection per finding: description, evidence, impact, remediation steps, references.]

## High Findings

…

## Medium Findings

…

## Low Findings

…

## Informational

…

## Remediation Roadmap

[Prioritised action list. Group quick wins vs longer-term work.]

## References

[CVEs, CWEs, OWASP links gathered during grounding.]
```

Write each severity section to disk before moving to the next. If a section is large, flush after every 2–3 findings within it.

---

## Context safety rules (always follow)

1. **Write findings and report sections to disk immediately** — never hold more than one finding in memory at a time.
2. **Re-read files from disk** at the start of Phase 3 and Phase 4 — never trust in-context memory across phase boundaries.
3. **Chunk large files** — never load a file > ~300 lines entirely into working memory; process it in overlapping windows.
4. **If context is running low mid-analysis**, stop, flush the current finding to disk, and note a clear `<!-- PAUSED HERE: line N -->` marker in `FINDINGS.md` so analysis can resume.

---

## Output files

| File                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `PLAN.md`              | Actionable checklist written before execution begins |
| `FINDINGS.security.md` | Raw, incremental findings written during analysis    |
| `REPORT.security.md`   | Final polished report with remediation guidance      |

All files are written to the working directory unless the user specifies otherwise.

---

## Checklist for correct execution

Use this self-check before finishing Phase 0:

- [ ] PLAN.md was written to disk
- [ ] plan-runner skill was loaded via `skill_read`
- [ ] `plan_start()` was called
- [ ] Tasks are being executed one at a time, with `- [ ]` → `- [x]` after each
- [ ] `plan_done()` will be called after the last task is marked `[x]`

If any box is unchecked, **do not proceed** — complete that step first.
