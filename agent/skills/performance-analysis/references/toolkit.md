# Performance Audit Tools

| Tool        | Language | Command                     | Metric                        |
|-------------|----------|-----------------------------|-------------------------------|
| scc         | General  | scc --complexity .          | Complexity & DRYness          |
| radon       | Python   | radon cc mi -s .            | Cyclomatic Complexity & MI    |
| gocognit    | Go       | gocognit -over 15 .         | Cognitive Complexity          |
| cargo-bloat | Rust     | cargo-bloat --release -n 10 | Binary/Function Size          |
| sqlc        | SQL      | sqlc check                  | Query Validity & Optimization |
