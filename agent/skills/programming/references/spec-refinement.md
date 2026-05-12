# Specification Refinement & Requirements Analysis

## Overview
Use this reference when a task is ambiguous, high-level, or lacks clear constraints. The goal is to produce a "Technical Logic Map" that serves as the source of truth for the `INTERFACE.md` in the programming skill.

---

## 1. Requirement Extraction
Identify the core components of the request. If any of these are missing, ask the user for clarification before proceeding to Step 2.

*   **Input Data**: What is the format, source, and expected volume?
*   **Output Data**: What is the destination and required schema?
*   **Success Condition**: What specific outcome proves the task is complete?
*   **Constraints**: Are there specific libraries, versions, or resource limits?

---

## 2. Structural Decomposition
Break the high-level request into discrete logic blocks.

- [ ] **Data Flow**: Trace a single "unit of work" from input to output.
- [ ] **State Changes**: Identify if the system is stateful. If so, map the transitions.
- [ ] **Concurrency**: Determine if the task requires async/parallel execution (Critical for Go/Rust).

---

## 3. The "Boundary Map" (Pre-Testing)
Before writing tests, define the edges. These will become your test cases in Step 2 of the Programming skill.

| Category | Examples to Identify |
| :--- | :--- |
| **Empty/Null** | Empty strings, null pointers, empty lists, zero-byte files. |
| **Overflow/Max** | Max integer values, maximum allowed string length, buffer limits. |
| **Permissions** | Read-only filesystems, expired tokens, unauthorized IDs. |
| **Network** | Timeouts, 500 errors from upstream APIs, malformed JSON. |

---

## 4. Complexity Analysis
Estimate the theoretical cost of the proposed solution.

*   **Time Complexity**: Target $O(1)$ or $O(n)$ where possible. Flag $O(n^2)$ or higher for review.
*   **Space Complexity**: Identify if the solution requires loading the entire dataset into memory or if it can be streamed.

---

## 5. Output Format (The "Draft Spec")
The result of this refinement should be a structured block that you can use to populate `INTERFACE.md`.

> **Proposed Module Name**: `...`
> **Public Responsibilities**:
> 1. (Function A): Description and signature.
> 2. (Function B): Description and signature.
> **Internal Invariants**: (e.g., "The cache must never exceed 500MB").
> **Dependencies**: (e.g., "Requires `tokio` for async runtime").
