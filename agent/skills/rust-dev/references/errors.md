# Rust error handling patterns

## thiserror (libraries)

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("file not found: {path}")]
    FileNotFound { path: String },
    #[error("parse failed: {0}")]
    Parse(#[from] std::num::ParseIntError),
}
```

## anyhow (binaries / applications)

```rust
use anyhow::{Context, Result};

fn read_config(path: &str) -> Result<Config> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read config at {path}"))?;
    Ok(toml::from_str(&raw)?)
}
```

## Asserting on errors in tests

```rust
let err = my_function().unwrap_err();
assert!(err.to_string().contains("expected substring"));
```
