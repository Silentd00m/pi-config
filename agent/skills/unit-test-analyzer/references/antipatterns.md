# Test Anti-Pattern Catalog

## Detection key
- 🔧 **Static** — caught by AST analysis without running code
- 📊 **Coverage** — visible in branch/line coverage reports
- 🧬 **Mutation** — only reliably caught by mutation testing

---

## 🔴 Critical

### NO_ASSERTIONS
**Detection**: 🔧 Static

Test body contains no `assert*`, `expect(...)`, `should.*`, or equivalent.
The test only verifies the code doesn't throw — any behavior change will go undetected.

```python
# Bad
def test_process_order():
    process_order(sample_order)

# Good
def test_process_order():
    result = process_order(sample_order)
    assert result.status == "confirmed"
    assert result.total == Decimal("42.00")
```

---

### TAUTOLOGICAL_ASSERTION
**Detection**: 🔧 Static

The assertion always passes regardless of what the code does.

```python
# Bad — always True
assert True
assert 1 == 1
self.assertEqual(result, result)

# Bad — comparing a variable to itself
self.assertEqual(x, x)
```

---

### EMPTY_TEST
**Detection**: 🔧 Static

Test body is only `pass`, a docstring, or a `TODO` comment. Counts toward
test totals and coverage without verifying anything.

```python
# Bad
def test_refund_flow():
    pass  # TODO: implement

# Good — either implement it or mark explicitly as expected failure
@pytest.mark.xfail(reason="refund not yet implemented")
def test_refund_flow():
    ...
```

---

### PURE_MOCK_EXERCISE
**Detection**: 🔧 Static

Every call in the test is to a mock/stub/spy. No real production code runs.
The test verifies mock wiring, not behavior.

```python
# Bad — exercises only the mock, not the code under test
def test_send_email():
    mailer = MagicMock()
    mailer.send("hello")
    mailer.send.assert_called_once_with("hello")

# Good — exercises real code, mocks only external boundary
def test_send_email():
    mailer = MagicMock()
    notifier = Notifier(mailer=mailer)
    notifier.notify_user(user_id=42, message="hello")
    mailer.send.assert_called_once_with(to="user@example.com", body="hello")
```

---

## 🟠 High

### SWALLOWED_EXCEPTION
**Detection**: 🔧 Static

An exception is caught but neither re-raised nor asserted upon. The test
passes whether the expected exception was raised, a different exception was
raised, or no exception was raised at all.

```python
# Bad
def test_invalid_input():
    try:
        parse("")
    except ValueError:
        pass  # swallowed — any ValueError (or none) passes

# Good
def test_invalid_input():
    with pytest.raises(ValueError, match="input cannot be empty"):
        parse("")
```

---

### MOCK_RETURN_CIRCULAR
**Detection**: 🔧 Static

The test asserts that a variable equals the value that was set as a mock's
`return_value`. The assertion is circular — it can only fail if the mock
framework itself is broken.

```python
# Bad
def test_get_price():
    repo = MagicMock()
    repo.get_price.return_value = 99
    result = repo.get_price("SKU-1")
    assert result == 99  # this will ALWAYS be true

# Good — assert that the code under test transforms the value correctly
def test_get_price():
    repo = MagicMock()
    repo.get_price.return_value = 99
    pricer = Pricer(repo)
    assert pricer.get_discounted("SKU-1", discount=0.1) == Decimal("89.10")
```

---

### BRANCH_NEVER_EXERCISED
**Detection**: 📊 Coverage

A conditional branch (the `else`, a guard clause, an error path) is never
taken by any test. Line coverage appears full because the `if` line is
executed, but the alternative path is dead.

Look for: 100% line coverage with < 100% branch coverage on the same file.

```
# Coverage report signal:
src/pricing.py    98%   12->15 (branch not taken: discount < 0 guard)
```

---

### SURVIVING_MUTANT_ARITHMETIC
**Detection**: 🧬 Mutation

Arithmetic operators (`+`→`-`, `*`→`/`, `<`→`<=`) are mutated and no test
fails. Typically means the test checks the wrong output or uses too loose a
comparison.

```python
# Surviving mutant: return a + b  →  return a - b
# Root cause: test only checks return type, not value
def test_add():
    result = add(2, 3)
    assert isinstance(result, int)  # passes for both + and -

# Fix
def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
```

---

### SURVIVING_MUTANT_BOUNDARY
**Detection**: 🧬 Mutation

Boundary conditions (`>=` → `>`, `< 0` → `<= 0`) are mutated without test
failures. Common cause: only happy-path inputs are tested.

```python
# Surviving mutant: if age >= 18  →  if age > 18
# Fix: add boundary test
def test_minimum_age_boundary():
    assert is_adult(17) is False
    assert is_adult(18) is True  # exactly the boundary
    assert is_adult(19) is True
```

---

## 🟡 Medium

### WEAK_ASSERTION_NONEMPTY
**Detection**: 🔧 Static

Asserts only that a collection is non-empty, not that it contains the right
things.

```python
# Bad
assert len(results) > 0

# Good
assert len(results) == 3
assert results[0].name == "Alice"
```

---

### WEAK_ASSERTION_NOT_NONE
**Detection**: 🔧 Static

Asserts only that a value is not `None` (or not `null`). Any non-null value
satisfies this, including error sentinels and empty objects.

```python
# Bad
assert result is not None

# Good
assert result == expected_value
# or, for complex objects:
assert result.id == 42
assert result.status == "active"
```

---

### BARE_TRUTHINESS
**Detection**: 🔧 Static

`assert result` passes for any truthy value: non-zero int, non-empty string,
any object. A function returning `"ERROR"` would pass this test.

```python
# Bad
assert response
assert success_flag

# Good
assert response.status_code == 200
assert success_flag is True
```

---

### DUPLICATE_TEST
**Detection**: 🔧 Static

Two or more tests exercise identical inputs and assertions under different
names. Inflates test counts without adding coverage.

Signals: same call arguments, same assertions, different `test_` name.

```python
# Bad — test_create_user_2 is identical to test_create_user
def test_create_user():
    u = create_user("alice@example.com")
    assert u.email == "alice@example.com"

def test_create_user_2():
    u = create_user("alice@example.com")
    assert u.email == "alice@example.com"
```

---

### SETUP_HEAVIER_THAN_TEST
**Detection**: 🔧 Static

The arrange phase (fixtures, mocks, stubs) is significantly longer than the
act + assert phase. Usually indicates the test is fighting its own design —
the code under test has too many dependencies, or the test is too coarse-grained.

Consider: extract a focused unit, or flag the production code for a design review.

---

### WRONG_LEVEL
**Detection**: 🔧 Static + judgment

A test is named and structured as a unit test but actually invokes a full
stack (database, network, filesystem). It inflates unit test coverage metrics
while running slowly and non-deterministically.

Move to an integration suite, or replace with a focused unit test that uses
a boundary mock.
