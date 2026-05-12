---
name: incident-report
description: >
  Use this skill whenever a user wants to write, create, or document an incident report,
  post-mortem, outage report, or service disruption summary. Triggers include phrases like
  "write an incident report", "document an outage", "create a post-mortem", "log an incident",
  "help me write up what happened", or any mention of a system failure, downtime, or production
  issue that needs to be formally documented. Use this even if the user only mentions "incident"
  casually.
---

# Incident Report Skill

This skill guides Claude through an **interactive, question-driven interview** to produce a
complete, professional incident report as a Markdown file. Work through the four phases below
in order. Ask questions one small group at a time — never dump a giant list on the user.
Confirm each section before moving on. At the end, write everything to a `.md` file.

---

## Ground Rules

- **Ask, don't assume.** Every data point in the final report should come from the user's
  answers, not inference.
- **One topic at a time.** Group related sub-questions together (2–4 per turn), but never
  ask about timeline *and* affected systems in the same turn.
- **Confirm before advancing.** After each phase, summarise what you've captured and ask:
  *"Does this look right, or is there anything to add or correct?"*
- **Never skip a phase.** Even if the user says "keep it brief", still collect the minimum
  fields for each phase (marked ★).
- **Severity language.** Use the standard scale: SEV-1 (complete outage), SEV-2 (major
  degradation), SEV-3 (partial/minor), SEV-4 (cosmetic / low impact).
- When the user says they're done or asks to "write it up", proceed directly to the
  **Write the Report** step.

---

## Phase 1 — Incident Overview ★

Collect the high-level facts. Ask these questions (split into 2 turns if needed):

**Turn 1 — Identity & Severity**
1. ★ What is a short title for this incident? (e.g., "Payment Service Outage")
2. ★ When did the incident start? (date + time + timezone)
3. ★ When was it resolved, or is it still ongoing?
4. ★ What severity level would you assign? (SEV-1 through SEV-4, or ask them to describe impact and assign for them)
5. Who is the incident commander / lead responder?
6. Who are the other responders involved?
7. Who is authoring this report, and when?

**Turn 2 — Summary & Business Impact**
8. ★ In 1–3 sentences, what happened? (the "executive summary")
9. ★ What was the user-facing impact? (e.g., "checkout was unavailable for ~40 minutes")
10. How was the incident first detected? (monitoring alert, customer report, internal discovery?)
11. Was any SLO or SLA breached? If so, which one and by how much?
12. Is there a ticket or incident ID in your ticket/incident-tracking system for this event?

---

## Phase 2 — Timeline

Build the timeline **entry by entry**. Start with:

> "Now let's build the timeline. Tell me the first notable event — what happened and when?"

After each entry, ask:
> "Got it. What happened next? (or type 'done' if the timeline is complete)"

Each timeline entry needs:
- ★ Timestamp (exact or approximate)
- ★ Event description (what happened / was observed / was done)
- Who took the action or made the observation (optional but encouraged)

Keep a running numbered list in your head. When the user says "done", read back the full
timeline and ask for confirmation.

**Prompts to help users who get stuck:**
- "When did the team first notice something was wrong?"
- "Was there an alert, or did a customer report it?"
- "When did you start the investigation?"
- "When was the root cause identified?"
- "When did you apply the fix or rollback?"
- "When did you confirm the service was restored?"

**After the timeline is confirmed, ask:**
- How long did it take from the incident starting to it being detected? (MTTD)
- How long from detection to resolution? (MTTR)
- Could monitoring or alerting have caught this faster? Why or why not?

---

## Phase 3 — Affected Systems

For **each** system/service/component the user mentions, collect:

1. ★ System name (e.g., "Payment API", "PostgreSQL primary", "CDN edge nodes")
2. ★ How was it affected? (down, degraded, elevated errors, slow, data inconsistency, etc.)
3. What is this system's role / what does it do? (skip if obvious)
4. Was data lost or corrupted? If so, describe scope.
5. Approximate number of users or requests impacted on this system.

Start with:
> "Let's document every system that was affected. What's the first system or service that was involved?"

After each system:
> "Any other systems affected? (or 'done' if that's all)"

When done, summarise the list and confirm.

---

## Phase 4 — Root Cause & Resolution

**Root Cause — Five Whys**

Don't just ask for the root cause directly. Guide the user through a Five Whys analysis:

> "Let's dig into the root cause. What was the immediate cause of the incident?"

After each answer, ask:
> "And why did that happen?"

Repeat until either (a) the user reaches a systemic/process-level cause, or (b) they've answered "why" five times. Label each level Why-1 through Why-N in your notes. The deepest answer is the root cause for the report.

Also collect:
- ★ Root cause category: Code change / Config change / Infrastructure failure / Dependency failure / Human error / Other
- Was there a contributing factor that made the incident worse or harder to detect?

**Stakeholder Communications**

> "Let's log the communications that went out during the incident."

For each communication:
- ★ When was it sent?
- ★ Who was notified? (e.g., on-call team, engineering leadership, customers, support team)
- ★ What channel? (e.g., status page, email, internal chat, phone)
- What was the message or update?

After each entry: "Any other notifications or updates sent? (or 'done')"

**Resolution Steps**
Walk through resolution step by step:

> "Now let's document how the incident was resolved. What was the first action taken to fix it?"

Collect for each step:
- ★ Action taken
- ★ Who performed it
- When it was performed (timestamp or relative, e.g., "T+45 min")
- Whether it was a temporary mitigation or the permanent fix

**References**

> "Are there any links or references worth including — such as a ticket ID, monitoring dashboard, runbook, or chat thread?"

Collect whatever the user provides: ticket/incident IDs, internal links, runbook names, etc. No need to force a specific format.

**Follow-up Action Items**
> "What follow-up action items came out of this incident?"

For each action item:
- ★ Description of the task
- Owner (person or team)
- Priority / due date (optional)

**Lessons Learned (required)**
> "Finally, what lessons did the team take away from this incident? These can be about the technology, the process, the tooling, or the team response."

Collect at least one lesson. If the user is stuck, prompt: "What would you do differently next time? Was there anything that went well that's worth preserving?"

When done with all phases, confirm with the user:
> "I have everything I need. Ready to write the report?"

---

## Write the Report

Once all phases are confirmed, generate the Markdown report and save it to:

```
/mnt/user-data/outputs/incident-report-<SLUG>.md
```

Where `<SLUG>` is a lowercase, hyphenated version of the incident title
(e.g., `incident-report-payment-service-outage.md`).

Use the template below. Fill in every section from your notes. If a field was not provided,
write `_Not recorded_`.

---

### Markdown Template

```markdown
# Incident Report: {TITLE}

| Field              | Value                        |
|--------------------|------------------------------|
| **Severity**       | {SEV}                        |
| **Start Time**     | {START}                      |
| **End Time**       | {END}                        |
| **Duration**       | {DURATION}                   |
| **Status**         | {Resolved / Ongoing}         |
| **Commander**      | {NAME}                       |
| **Responders**     | {NAMES}                      |
| **Ticket / ID**    | {TICKET ID or _Not recorded_}|
| **Report Author**  | {NAME}                       |
| **Report Date**    | {ISO DATE}                   |

---

## Executive Summary

{1–3 sentence summary of what happened, impact, and resolution}

---

## User Impact

{Description of what users experienced, how many were affected, for how long}

**Detection method:** {how it was first discovered}

**SLO / SLA breach:** {Yes – describe which SLO/SLA and by how much / No}

---

## Detection & Response Metrics

| Metric | Value |
|--------|-------|
| **MTTD** (time to detect) | {duration} |
| **MTTR** (time to resolve) | {duration} |
| **Detection gap analysis** | {Could alerting have caught this faster? Why / why not?} |

---

## Timeline

| Time | Event | Who |
|------|-------|-----|
| {TIME} | {EVENT} | {WHO} |
| ... | ... | ... |

---

## Affected Systems

### {SYSTEM NAME 1}
- **Role:** {what the system does}
- **Impact:** {how it was affected}
- **Data loss / corruption:** {Yes – describe / No}
- **Users / requests impacted:** {number or estimate}

### {SYSTEM NAME 2}
...

---

## Root Cause Analysis

### Five Whys

| Level | Question | Answer |
|-------|----------|--------|
| Why 1 | Why did the incident occur? | {ANSWER} |
| Why 2 | Why did that happen? | {ANSWER} |
| Why 3 | Why did that happen? | {ANSWER} |
| ... | ... | ... |

**Root cause:** {The deepest systemic cause identified}

**Category:** {Code change / Config change / Infrastructure failure / Dependency failure / Human error / Other}

**Contributing factors:** {Factors that made it worse or harder to detect, or "None identified"}

---

## Stakeholder Communications

| Time | Recipients | Channel | Summary |
|------|------------|---------|---------|
| {TIME} | {WHO} | {CHANNEL} | {MESSAGE SUMMARY} |
| ... | ... | ... | ... |

---

## Resolution Steps

| Time | Action | Performed By | Type |
|------|--------|--------------|------|
| {TIME} | {ACTION} | {WHO} | {Mitigation / Fix} |
| ... | ... | ... | ... |

---

## References

{List of ticket IDs, runbooks, dashboards, chat threads, or other relevant links}

---

## Action Items

| # | Task | Owner | Priority | Due Date |
|---|------|-------|----------|----------|
| 1 | {TASK} | {OWNER} | {P1/P2/P3} | {DATE} |
| ... | ... | ... | ... | ... |

---

## Lessons Learned

{What the team learned — about the technology, process, tooling, or response}

---

_Report generated: {ISO date}_
```

After writing the file, present it to the user with `present_files` and give a one-sentence
summary of what was written.

---

## Quick Reference — Minimum Required Fields

| Phase | Required (★) |
|-------|-------------|
| Overview | Title, start time, severity, summary, user impact |
| Timeline | At least 3 entries with timestamps + MTTD/MTTR |
| Affected Systems | At least 1 system with name + impact |
| Root Cause | At least 2 levels of Five Whys + category |
| Communications | At least 1 stakeholder notification |
| Resolution | At least 1 resolution step |
| Action Items | At least 1 action item |
| Lessons Learned | At least 1 lesson (required, not optional) |
