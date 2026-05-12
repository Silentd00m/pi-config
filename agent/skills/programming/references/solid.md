# SOLID Heuristics for 2026

## S: Single Responsibility (Module Level)
*   **Check**: Does this module change for more than one business reason? 
*   **Violation**: An `OrderProcessor` that also handles PDF generation and DB schema migrations.

## O: Open/Closed (Extension via Composition)
*   **Check**: Can I add a new "Payment Type" without editing the core `PaymentLogic` file?
*   **Violation**: Large `switch` or `match` blocks that grow with every new feature.

## L: Liskov Substitution (Contract Integrity)
*   **Check**: Does a subclass/implementation break the invariants of the interface?
*   **Violation**: Throwing an `UnsupportedOperationException` in a required interface method.

## I: Interface Segregation (Client Specificity)
*   **Check**: Is the interface "fat"? Do clients depend on methods they don't use?
*   **Violation**: A `FileSystem` interface that forces a "Read-Only" client to implement `Delete()`.

## D: Dependency Inversion (The "Plug-in" Rule)
*   **Check**: Does high-level policy depend on low-level detail?
*   **Violation**: Hardcoding a specific `PostgreSQL` driver inside your `UserService`.
