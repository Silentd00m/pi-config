# Design Smells & Anti-Patterns

## Structural Smells
*   **God Object**: A class/module that knows too much or does too much. (Check: line count > 500, or more than 7 distinct responsibilities).
*   **Divergent Change**: One module that has to be changed every time you change a different, unrelated feature.
*   **Shotgun Surgery**: One change requires small edits to 10+ different files.
*   **Feature Envy**: A method that seems more interested in the data of another class than its own.

## Language-Specific Over-Engineering
*   **Go**: "Interface Bloat." Defining interfaces before they are needed. Using `interface{}`/`any` where a concrete type or generic is safer.
*   **Rust**: "Trait Over-Abstraction." Deeply nested trait bounds that make the code impossible to read or compile-times explode. Unnecessary use of `Arc<Mutex<T>>` where simple ownership would suffice.
*   **Python**: "Class Obsession." Using classes for logic that should be simple, pure functions.

## The "Dry-Rot" Check
*   **Cargo Culting**: Copy-pasting boilerplate that serves no purpose in the current context.
*   **Premature Generalization**: Building "Generic Frameworks" for a feature that only has one use case.
