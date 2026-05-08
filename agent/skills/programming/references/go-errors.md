# Go error handling patterns

## Sentinel errors (libraries)

Define typed sentinel errors at package level so callers can use `errors.Is` to
inspect wrapped chains.

```go
package mypkg

import "errors"

var (
	ErrNotFound = errors.New("not found")
	ErrLocked   = errors.New("resource locked")
)
```

## Wrapping errors with context

Use `fmt.Errorf` with `%w` to wrap errors and preserve the chain. Always add
context that identifies the operation or subsystem.

```go
import "fmt"

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	cfg, err := parseConfig(data)
	if err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}
```

## Inspecting wrapped errors

Use `errors.Is` to check for sentinel errors and `errors.As` to extract typed
errors. Never compare error strings with `==`.

```go
import "errors"

func handle(err error) {
	if errors.Is(err, ErrNotFound) {
		// resource missing, create a default
	} else if errors.Is(err, ErrLocked) {
		// back off and retry
	}
}
```

## Custom error types

For errors that carry structured data, define a type that implements the
`error` interface.

```go
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("invalid %s: %s", e.Field, e.Message)
}

func validate(input Input) error {
	if input.Email == "" {
		return &ValidationError{Field: "email", Message: "required"}
	}
	return nil
}

// Inspecting a custom error:
var ve *ValidationError
if errors.As(err, &ve) {
	fmt.Printf("field %s: %s\n", ve.Field, ve.Message)
}
```

## Asserting on errors in tests

```go
func TestLoadConfig(t *testing.T) {
	_, err := loadConfig("/nonexistent")
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected ErrNotExist, got %v", err)
	}
}
```

## Multi-error aggregation

When multiple operations can fail and you want to report all of them, use
`errors.Join` (Go 1.20+).

```go
var errs []error

if err := step1(); err != nil {
	errs = append(errs, fmt.Errorf("step1: %w", err))
}
if err := step2(); err != nil {
	errs = append(errs, fmt.Errorf("step2: %w", err))
}

if len(errs) > 0 {
	return errors.Join(errs...)
}
```
