# Python error handling patterns

## Custom exception hierarchies (libraries)

Define a base exception for the package so callers can catch broadly or
narrowly as needed.

```python
from __future__ import annotations


class AppError(Exception):
    """Base exception for this package."""


class FileNotFoundError(AppError):
    def __init__(self, path: str) -> None:
        self.path = path
        super().__init__(f"file not found: {path}")


class ParseError(AppError):
    def __init__(self, reason: str) -> None:
        super().__init__(f"parse failed: {reason}")
```

## Chaining exceptions across abstraction boundaries

Use `raise NewError(...) from original` to preserve the original traceback
while presenting a cleaner error to the caller.

```python
import tomllib
from pathlib import Path


def read_config(path: str) -> dict:
    try:
        return tomllib.loads(Path(path).read_text())
    except FileNotFoundError as exc:
        raise ConfigError(f"config not found at {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"invalid TOML in {path}") from exc
```

## Suppressing expected exceptions (contextlib)

Use `contextlib.suppress` instead of a bare `try/except/pass` block.

```python
from contextlib import suppress
from pathlib import Path


def delete_if_exists(path: str) -> None:
    with suppress(FileNotFoundError):
        Path(path).unlink()
```

## Asserting on exceptions in tests

```python
import pytest


def test_parse_error_message() -> None:
    with pytest.raises(ParseError, match="unexpected token"):
        parse_expression("1 +* 2")


def test_exception_is_chained() -> None:
    with pytest.raises(ConfigError) as exc_info:
        read_config("/nonexistent/path.toml")
    assert exc_info.value.__cause__ is not None
```
