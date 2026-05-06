---
name: security-code-audit
version: 1.0.1
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

1. Call `/skill_read path=plan-runner/SKILL.md`
2. Keep its instructions in mind — you will hand off to it after writing PLAN.md

---

## Scope Override (Fast Path)

If the user provides a **narrow scope hint** (e.g. "just check for secrets", "only look at auth", "focus on network calls"), skip the full audit checklist and run a targeted pass:

1. Note the scope at the top of `PLAN.md` under `**Scope**`.
2. In Phase 1, only analyse the categories directly relevant to that scope (see category list in Phase 1).
3. Mark all other categories as `skipped (out of scope)` in `FINDINGS.md` so the report is transparent about coverage.
4. Proceed normally through Phase 3 (grounding) and Phase 4 (report), but omit empty severity sections from the final report.

> A targeted audit is better than a shallow full audit. If scope is narrow, say so clearly in the Executive Summary.

---

## Workflow

### Phase 0 — Write `PLAN.md`, then hand off to plan-runner

Before doing any analysis, write a concrete checklist of every step to `PLAN.md`. Use the template below, filling in the target file(s) and any scope hints from the user.

```markdown
# Security Audit Plan

**Target**: <file(s)>
**Scope**: <user hints, or "full audit">

## Steps

- [ ] Detect language and framework from file(s); note findings context (e.g. Django app, Express API, CLI tool)
- [ ] Read target file(s) in chunks (~100–150 lines) and analyse each chunk for security issues
- [ ] For every finding discovered, immediately append it to `FINDINGS.md` (do not batch)
- [ ] Repeat until the entire file is analysed
- [ ] Audit dependency manifests (package.json / requirements.txt / Gemfile.lock / go.sum / etc.) for known-vulnerable packages
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

The `plan-runner` skill is responsible for executing `PLAN.md` sequentially — task by task, marking progress, and calling `/plan_start` / `/plan_done`. This skill **only writes the plan and the phase guidance**. Plan-runner does the rest.

After writing `PLAN.md`, follow these steps **in order**:

1. **Load plan-runner**: Call `/skill_read path=plan-runner/SKILL.md`
2. **Follow plan-runner instructions**: Let plan-runner take over. It will:
   - Call `/plan_start`
   - Iterate through each `- [ ]` in PLAN.md one at a time
   - Use the Phase 1–4 guidance below to know how to implement each step
   - Mark items `- [x]` as it completes them
   - Call `/plan_done` when finished

> **STOP HERE** — Do not execute PLAN.md yourself. Do not manually call `/plan_start`, do not iterate through tasks, and do not write findings or the report directly.
> Plan-runner is the executor. Phases 1–4 below are the implementation guidance plan-runner will use for each step.

---

### Phase 1 — Framework Detection + Incremental Analysis → `FINDINGS.md`

> **Key principle**: write every finding to disk _immediately_ as you discover it. Do not accumulate findings in memory and write them all at the end — the context window may not survive that long.

#### Step 1a — Detect language and framework

Before reading any code, identify:

- **Language**: Python, TypeScript/JavaScript, Go, Ruby, Rust, Java, etc.
- **Framework / runtime**: Django, Flask, Express, FastAPI, Spring, Rails, etc.
- **Role of the code**: web API, CLI tool, background worker, library, etc.

Note this at the top of `FINDINGS.md` as a context block:

```markdown
## Audit Context

**Language**: Python
**Framework**: Django (REST framework)
**Role**: Web API backend
**Dependency manifest found**: requirements.txt
```

This context informs which vulnerability categories are most relevant and what language-specific pitfalls to watch for (e.g. Python `pickle` deserialization, JS prototype pollution, Go `unsafe` package usage, Ruby `send`/`eval` abuse, Java deserialization gadgets).

#### Step 1b — Analyse code chunks

1. Open and read the target file(s) in logical chunks (function by function, module by module, or in blocks of ~100–150 lines for large files).
2. For each chunk, look for issues across these categories (not exhaustive — use judgment, and skip categories marked out-of-scope per the Scope Override rules):
   - **Secrets / credentials**: hardcoded API keys, tokens, passwords, private keys
   - **Network / exfiltration**: unvalidated outbound requests, data sent to untrusted endpoints, missing TLS checks, SSRF
   - **Injection**: SQL, shell, template, path-traversal, prototype pollution
   - **Authentication / authorization**: missing checks, insecure session handling, privilege escalation paths
   - **Cryptography**: weak algorithms, insecure random, missing integrity checks
   - **Input validation**: missing sanitization, unsafe deserialization, type confusion
   - **Dependency risks**: calls to known-vulnerable APIs or patterns (detailed in Step 1c)
   - **Logic / business logic**: race conditions, TOCTOU, insecure defaults
   - **Information leakage**: verbose errors, stack traces, debug endpoints left on

3. **Immediately after identifying a finding**, append it to `FINDINGS.md` using the format below. Do not wait.

4. Continue to the next chunk. Repeat until the entire file is analysed.

#### Step 1c — Dependency audit

After analysing the source code, look for any dependency manifest files in the project:

| Ecosystem | Files to check |
| --- | --- |
| Node.js | `package.json`, `package-lock.json`, `yarn.lock` |
| Python | `requirements.txt`, `Pipfile`, `pyproject.toml`, `poetry.lock` |
| Ruby | `Gemfile`, `Gemfile.lock` |
| Go | `go.mod`, `go.sum` |
| Java/Kotlin | `pom.xml`, `build.gradle` |
| Rust | `Cargo.toml`, `Cargo.lock` |

For each manifest found:
- List direct dependencies and their pinned versions.
- During Phase 3 grounding, search for known CVEs or advisories against the pinned versions (e.g. `"lodash 4.17.20 CVE"`, `"Django 3.2 vulnerability"`).
- Record any vulnerable dependencies as findings using the standard format below, with severity based on the CVE rating.

#### `FINDINGS.md` entry format

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

What is wrong: describe the root cause in plain language.
How to fix it: describe the correct approach, pattern, or configuration — without writing concrete replacement code.

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

> Skip this step if running in an environment without a compact command. If no compact command is available, flush any remaining in-memory notes to `FINDINGS.md` and proceed.

After finishing the analysis, compact the conversation history so Phase 3 starts with a fresh context budget.

---

### Phase 3 — Grounding & Research

1. Re-read `FINDINGS.md` from disk (do not rely on memory).
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

[2–4 paragraph non-technical overview of the most important risks and overall security posture.
If a scope override was in effect, state clearly which categories were audited and which were excluded.]

## Critical Findings

[One subsection per finding: description, evidence, impact, remediation guidance (what is wrong
and how to fix it — no concrete code), references.]

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
3. **Chunk large files** — never load a file > ~150 lines entirely into working memory; process it in overlapping windows.
4. **If context is running low mid-analysis**, stop, flush the current finding to disk, and note a clear `<!-- PAUSED HERE: line N -->` marker in `FINDINGS.md` so analysis can resume.

---

## Output files

| File                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `PLAN.md`              | Actionable checklist written before execution begins |
| `FINDINGS.md`          | Raw, incremental findings written during analysis    |
| `REPORT.security.md`   | Final polished report with remediation guidance      |

All files are written to the working directory unless the user specifies otherwise.

---

## Checklist for correct execution

Use this self-check before finishing Phase 0:

- [ ] PLAN.md was written to disk with phase annotations on each step
- [ ] plan-runner skill was loaded via `/skill_read`
- [ ] Language and framework detection is the first task in PLAN.md
- [ ] Dependency manifest audit is included as a task in PLAN.md
- [ ] `/plan_start` and `/plan_done` will be called by plan-runner (not by this skill)

If any box is unchecked, **do not proceed** — complete that step first.
