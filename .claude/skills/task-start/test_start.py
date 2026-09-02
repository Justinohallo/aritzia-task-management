#!/usr/bin/env python3
"""Unit tests for T-17: task-start prints open blockers and does not refuse."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import start  # noqa: E402

FIXTURE = """# BLOCKERS.md

## Log

| ID | Date | Raised by | Finding | Resolution | Commit |
|---|---|---|---|---|---|
| B-01 | 2026-09-01 | ARCH-03 Architect | **Closed finding.** It was wrong. | Two layers. | `docs: ARCH-03` |
| B-20 | 2026-09-02 | T-03 Builder | **Nobody mounts `<TasksProvider>`.** Wave 2 will throw. | open | |
| B-99 | 2026-09-02 | T-08 Builder | **Unrelated open row.** Something else. | open | |
| B-18 | 2026-09-01 | T-16 Builder | **`spec-lint.py` cannot be wired into CI from T-16's lane.** Mentions `.github/workflows/repo-guard.yml`. | open | |
"""


class OpenBlockers(unittest.TestCase):
    def test_only_open_rows(self):
        rows = start.open_blockers(FIXTURE)
        self.assertEqual([r["ID"] for r in rows], ["B-20", "B-99", "B-18"])

    def test_closed_rows_are_ignored(self):
        self.assertFalse(any(r["ID"] == "B-01" for r in start.open_blockers(FIXTURE)))

    def test_empty_when_none_open(self):
        md = FIXTURE.replace("| open |", "| resolved |")
        self.assertEqual(start.open_blockers(md), [])

    def test_this_task_and_owned_paths_sort_first(self):
        rows = start.open_blockers(FIXTURE)
        ranked = start.prioritise_blockers(
            rows, "T-17", [".github/workflows/repo-guard.yml", ".claude/skills/**"],
        )
        # B-18 names a path T-17 owns; B-20/B-99 do not name T-17.
        # Wait: B-18 names repo-guard.yml which is in owned_paths → rank 1
        # B-20 and B-99 rank 2. Among rank 2, sort by ID: B-20 then B-99.
        self.assertEqual([r["ID"] for r in ranked], ["B-18", "B-20", "B-99"])

    def test_naming_the_task_sorts_first(self):
        rows = start.open_blockers(FIXTURE)
        ranked = start.prioritise_blockers(rows, "T-08", [])
        self.assertEqual(ranked[0]["ID"], "B-99")

    def test_format_is_a_warning_not_a_refusal(self):
        rows = start.open_blockers(FIXTURE)
        block = start.format_open_blockers(rows, "T-17", [".github/workflows/repo-guard.yml"])
        self.assertIn("warning, not a refusal", block)
        self.assertIn("does not refuse", block)
        self.assertIn("B-20", block)
        self.assertIn("B-18", block)

    def test_format_none_when_empty(self):
        self.assertIsNone(start.format_open_blockers([], "T-17", []))


if __name__ == "__main__":
    unittest.main()
