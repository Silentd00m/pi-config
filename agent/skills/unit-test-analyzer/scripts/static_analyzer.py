#!/usr/bin/env python3
"""
Unit Test Static Analyzer
Detects structural anti-patterns in Python test suites via AST analysis.

Usage:
    python static_analyzer.py tests/
    python static_analyzer.py tests/ --json
"""
from __future__ import annotations

import ast
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional


@dataclass
class Issue:
    file: str
    test: str
    line: int
    pattern: str
    severity: str
    detail: str
    suggestion: str


class FunctionChecker:
    def __init__(self, filepath: str, func: ast.FunctionDef, class_name: Optional[str]):
        self.filepath = filepath
        self.func = func
        self.issues: list[Issue] = []
        self._name = f"{class_name}.{func.name}" if class_name else func.name

    def check(self) -> list[Issue]:
        self._check_empty()
        # Skip NO_ASSERTIONS if EMPTY_TEST already fired (redundant noise)
        if not any(i.pattern == "EMPTY_TEST" for i in self.issues):
            self._check_no_assertions()
        self._check_tautological()
        self._check_pure_mock()
        self._check_swallowed_exceptions()
        self._check_weak_assertions()
        self._check_mock_circular()
        return self.issues

    # ── Checks ────────────────────────────────────────────────────────────

    def _check_empty(self):
        substantive = [
            n for n in self.func.body
            if not isinstance(n, ast.Pass)
            and not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))
        ]
        if not substantive:
            self._add(self.func.lineno, "EMPTY_TEST", "CRITICAL",
                      "Test body is empty (only pass or a docstring).",
                      "Implement the test or delete it.")

    def _check_no_assertions(self):
        if not self._has_any_assertion() and not self._has_side_effect_check():
            self._add(self.func.lineno, "NO_ASSERTIONS", "CRITICAL",
                      "No assertions and no mock call checks — only verifies the code doesn't crash.",
                      "Add assertions on return values, state changes, or raised exceptions.")

    def _check_tautological(self):
        for n in ast.walk(self.func):
            if isinstance(n, ast.Assert):
                t = n.test
                if isinstance(t, ast.Constant) and t.value:
                    self._add(n.lineno, "TAUTOLOGICAL_ASSERTION", "CRITICAL",
                              f"`assert {t.value!r}` always passes.",
                              "Assert against a real expected value.")
                elif (isinstance(t, ast.Compare) and len(t.ops) == 1
                      and isinstance(t.ops[0], ast.Eq)
                      and isinstance(t.left, ast.Name)
                      and len(t.comparators) == 1
                      and isinstance(t.comparators[0], ast.Name)
                      and t.left.id == t.comparators[0].id):
                    self._add(n.lineno, "TAUTOLOGICAL_ASSERTION", "CRITICAL",
                              f"`assert {t.left.id} == {t.left.id}` — comparing a variable to itself.",
                              "Compare against a computed expected value.")
            elif isinstance(n, ast.Call):
                attr = n.func.attr if isinstance(n.func, ast.Attribute) else ""
                if attr in ("assertEqual", "assertEquals") and len(n.args) >= 2:
                    a, b = n.args[0], n.args[1]
                    if isinstance(a, ast.Name) and isinstance(b, ast.Name) and a.id == b.id:
                        self._add(n.lineno, "TAUTOLOGICAL_ASSERTION", "CRITICAL",
                                  f"`assertEqual({a.id}, {a.id})` — same variable on both sides.",
                                  "Pass the expected constant as one argument.")

    def _check_pure_mock(self):
        mock_calls = sum(
            1 for n in ast.walk(self.func)
            if isinstance(n, ast.Call) and self._is_mock(n)
        )
        real_calls = sum(
            1 for n in ast.walk(self.func)
            if isinstance(n, ast.Call) and not self._is_mock(n) and not self._is_assert_call(n)
        )
        if mock_calls > 0 and real_calls == 0 and self._has_any_assertion():
            self._add(self.func.lineno, "PURE_MOCK_EXERCISE", "HIGH",
                      f"{mock_calls} mock interaction(s), 0 real calls — exercises mock wiring, not behavior.",
                      "Call the actual code under test; mock only external boundaries.")

    def _check_swallowed_exceptions(self):
        for n in ast.walk(self.func):
            if isinstance(n, ast.ExceptHandler):
                body_mod = ast.Module(body=n.body, type_ignores=[])
                if not any(isinstance(c, (ast.Assert, ast.Raise)) for c in ast.walk(body_mod)):
                    self._add(n.lineno, "SWALLOWED_EXCEPTION", "HIGH",
                              "Exception caught but not asserted or re-raised — any exception (or none) would pass.",
                              "Use pytest.raises(SpecificException, match='...') instead.")

    def _check_weak_assertions(self):
        for n in ast.walk(self.func):
            if not isinstance(n, ast.Assert):
                continue
            src = self._unparse(n.test)
            if "len(" in src and ("> 0" in src or ">= 1" in src):
                self._add(n.lineno, "WEAK_ASSERTION_NONEMPTY", "MEDIUM",
                          f"Only asserts non-empty: `{src}`",
                          "Assert the expected length or inspect specific elements.")
            elif "is not None" in src and len(src) < 35:
                self._add(n.lineno, "WEAK_ASSERTION_NOT_NONE", "MEDIUM",
                          f"Only asserts non-None: `{src}`",
                          "Assert the actual expected value or relevant attributes.")
            elif isinstance(n.test, ast.Name):
                self._add(n.lineno, "BARE_TRUTHINESS", "MEDIUM",
                          f"`assert {n.test.id}` passes for any truthy value.",
                          "Use == to compare against a specific expected value.")

    def _check_mock_circular(self):
        mock_return_vars: set[str] = set()
        for n in ast.walk(self.func):
            if isinstance(n, ast.Assign) and "return_value" in self._unparse(n):
                for t in n.targets:
                    if isinstance(t, ast.Name):
                        mock_return_vars.add(t.id)
        if not mock_return_vars:
            return
        asserted: set[str] = set()
        for n in ast.walk(self.func):
            if isinstance(n, ast.Call):
                attr = n.func.attr if isinstance(n.func, ast.Attribute) else ""
                if attr in ("assertEqual", "assertEquals"):
                    for arg in n.args:
                        if isinstance(arg, ast.Name):
                            asserted.add(arg.id)
        if asserted and asserted.issubset(mock_return_vars):
            self._add(self.func.lineno, "MOCK_RETURN_CIRCULAR", "MEDIUM",
                      "All assertions compare against values configured as mock return_value — circular.",
                      "Assert how the code under test transforms the mock data, not the mock data itself.")

    # ── Helpers ───────────────────────────────────────────────────────────

    def _has_any_assertion(self) -> bool:
        for n in ast.walk(self.func):
            if isinstance(n, ast.Assert):
                return True
            if isinstance(n, ast.Call):
                name = (n.func.attr if isinstance(n.func, ast.Attribute)
                        else n.func.id if isinstance(n.func, ast.Name) else "")
                if name.startswith("assert") or name in ("raises", "warns"):
                    return True
        return False

    def _has_side_effect_check(self) -> bool:
        mock_asserts = {
            "assert_called", "assert_called_once", "assert_called_with",
            "assert_called_once_with", "assert_any_call", "assert_has_calls",
            "assert_not_called",
        }
        return any(
            isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
            and n.func.attr in mock_asserts
            for n in ast.walk(self.func)
        )

    def _is_mock(self, n: ast.Call) -> bool:
        return any(kw in self._unparse(n) for kw in ("Mock", "mock", "patch", "MagicMock", "AsyncMock"))

    def _is_assert_call(self, n: ast.Call) -> bool:
        name = (n.func.attr if isinstance(n.func, ast.Attribute)
                else n.func.id if isinstance(n.func, ast.Name) else "")
        return name.startswith("assert") or name in ("raises", "warns")

    @staticmethod
    def _unparse(node: ast.AST) -> str:
        return ast.unparse(node) if hasattr(ast, "unparse") else ""

    def _add(self, line: int, pattern: str, severity: str, detail: str, suggestion: str):
        self.issues.append(Issue(
            file=self.filepath, test=self._name, line=line,
            pattern=pattern, severity=severity, detail=detail, suggestion=suggestion,
        ))


class FileAnalyzer(ast.NodeVisitor):
    def __init__(self, filepath: str):
        self.filepath = filepath
        self.issues: list[Issue] = []
        self._classes: list[str] = []

    def visit_ClassDef(self, node: ast.ClassDef):
        self._classes.append(node.name)
        self.generic_visit(node)
        self._classes.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if node.name.startswith("test"):
            cls = self._classes[-1] if self._classes else None
            self.issues.extend(FunctionChecker(self.filepath, node, cls).check())
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef):
                self.visit(child)

    visit_AsyncFunctionDef = visit_FunctionDef


def analyze_path(path: str) -> list[Issue]:
    p = Path(path)
    if p.is_dir():
        files = sorted(p.rglob("test_*.py")) + sorted(p.rglob("*_test.py"))
    else:
        files = [p]
    issues: list[Issue] = []
    for f in files:
        try:
            tree = ast.parse(f.read_text("utf-8"), filename=str(f))
            v = FileAnalyzer(str(f))
            v.visit(tree)
            issues.extend(v.issues)
        except SyntaxError as e:
            print(f"[WARN] Cannot parse {f}: {e}", file=sys.stderr)
    return issues


ICONS = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}
ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]


def print_report(issues: list[Issue]):
    if not issues:
        print("✅ No anti-patterns detected.")
        return
    by_sev: dict[str, list[Issue]] = {s: [] for s in ORDER}
    for i in issues:
        by_sev.setdefault(i.severity, []).append(i)
    print(f"\n{'═'*68}")
    print(f"  Unit Test Static Analysis — {len(issues)} issue(s)")
    print(f"{'═'*68}\n")
    for sev in ORDER:
        bucket = by_sev[sev]
        if not bucket:
            continue
        print(f"{ICONS[sev]} {sev} ({len(bucket)})\n{'─'*60}")
        for i in bucket:
            print(f"  {i.file}:{i.line}  {i.test}")
            print(f"  Pattern   : {i.pattern}")
            print(f"  Detail    : {i.detail}")
            print(f"  Suggestion: {i.suggestion}\n")
    print(f"{'═'*68}")
    print("  Summary: " + "  ".join(
        f"{ICONS[s]} {s}: {len(by_sev[s])}" for s in ORDER if by_sev[s]))
    print(f"{'═'*68}\n")


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("path", help="Test file or directory")
    p.add_argument("--json", action="store_true", help="Output JSON")
    args = p.parse_args()
    found = analyze_path(args.path)
    if args.json:
        print(json.dumps([asdict(i) for i in found], indent=2))
    else:
        print_report(found)
    sys.exit(1 if any(i.severity in ("CRITICAL", "HIGH") for i in found) else 0)
