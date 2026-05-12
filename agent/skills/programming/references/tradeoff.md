# Architectural Tradeoff Heuristics (ATAM-Lite)

When two quality attributes conflict, use this priority matrix:

| High Priority | Low Priority | Reasoning |
| :--- | :--- | :--- |
| **Security** | **Performance** | Performance can be scaled; a breach is terminal. |
| **Maintainability** | **Time-to-Market** | Clean boundaries prevent "The Big Ball of Mud" in 6 months. |
| **Simplicity** | **Generalization** | Only abstract what is *already* repeated, not what *might* be. |

## The Sensitivity Point Check
Identify "Sensitivity Points"—parts of the code where a small change has a massive impact on a quality attribute. 
*   *Example*: A central locking mechanism in Go is a sensitivity point for **Availability**.
