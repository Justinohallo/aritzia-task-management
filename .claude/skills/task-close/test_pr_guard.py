#!/usr/bin/env python3
"""Unit tests for T-17 merge-boundary PR checks."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pr_guard  # noqa: E402


class ExpandCriteria(unittest.TestCase):
    def test_range_and_singles(self):
        self.assertEqual(
            pr_guard.expand_criteria("AC-LIST-1..4, AC-FILT-1, AC-DEL-3..4"),
            [
                "AC-LIST-1", "AC-LIST-2", "AC-LIST-3", "AC-LIST-4",
                "AC-FILT-1", "AC-DEL-3", "AC-DEL-4",
            ],
        )

    def test_empty(self):
        self.assertEqual(pr_guard.expand_criteria(""), [])
        self.assertEqual(pr_guard.expand_criteria(None), [])


class TitleCheck(unittest.TestCase):
    def test_builder_title_matching_union_passes(self):
        title = (
            "feat(tasks): T-05 list, filter, complete, delete "
            "[AC-LIST-1..4, AC-FILT-1]"
        )
        subjects = [
            "feat(tasks): list [AC-LIST-1, AC-LIST-2, AC-LIST-3, AC-LIST-4]",
            "feat(tasks): filter [AC-FILT-1]",
            "chore: update T-05 ledger row",
        ]
        self.assertEqual(pr_guard.check_title(title, subjects), [])

    def test_title_missing_commit_criteria_fails(self):
        # #17: title pre-filled from the first commit, later commits added IDs.
        title = (
            "feat(auth): T-02 sessionStorage auth provider "
            "[AC-AUTH-2..9, AC-NAV-3, AC-NAV-4]"
        )
        subjects = [
            "feat(auth): sessionStorage [AC-AUTH-2, AC-AUTH-3, AC-AUTH-4, "
            "AC-AUTH-5, AC-AUTH-6, AC-AUTH-7, AC-AUTH-8, AC-AUTH-9, "
            "AC-NAV-3, AC-NAV-4]",
            "feat(auth): root redirect [AC-AUTH-1, AC-NAV-1, AC-NAV-2]",
        ]
        errors = pr_guard.check_title(title, subjects)
        self.assertTrue(errors)
        joined = " ".join(errors)
        self.assertIn("AC-AUTH-1", joined)
        self.assertIn("AC-NAV-1", joined)
        self.assertIn("AC-NAV-2", joined)

    def test_chore_without_task_id_is_exempt(self):
        self.assertEqual(
            pr_guard.check_title("chore(deps): bump eslint from 9 to 10", []),
            [],
        )

    def test_docs_title_is_exempt(self):
        self.assertEqual(
            pr_guard.check_title(
                "docs: ARCH-04 resolve B-18..B-21, amend OPERATOR.md",
                ["docs: ARCH-04 resolve B-18..B-21"],
            ),
            [],
        )

    def test_chore_with_ac_commits_still_requires_union(self):
        title = "chore(skills): T-17 merge-boundary guards"
        subjects = [
            "feat(tasks): mount TasksProvider [AC-STATE-1]",
            "test(api): name the 400 path AC-API-13 [AC-API-13]",
        ]
        errors = pr_guard.check_title(title, subjects)
        self.assertTrue(errors)
        joined = " ".join(errors)
        self.assertIn("AC-STATE-1", joined)
        self.assertIn("AC-API-13", joined)

    def test_chore_with_union_in_title_passes(self):
        title = (
            "chore(skills): T-17 merge-boundary guards "
            "[AC-STATE-1, AC-API-13]"
        )
        subjects = [
            "feat(tasks): mount TasksProvider [AC-STATE-1]",
            "test(api): name the 400 path AC-API-13 [AC-API-13]",
            "chore(skills): pr_guard and task-start warnings",
        ]
        self.assertEqual(pr_guard.check_title(title, subjects), [])

    def test_feat_without_task_id_fails(self):
        errors = pr_guard.check_title("feat(tasks): add a form", [])
        self.assertTrue(any("task id" in e for e in errors))

    def test_non_conventional_fails(self):
        errors = pr_guard.check_title("T-00: wave-aware task-start", [])
        self.assertTrue(errors)


class LedgerCheck(unittest.TestCase):
    ROW = (
        "+| 2026-09-02 | abc | T-17 | - | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1.00 "
        "| m | - | 0 | n/a | notes |\n"
    )

    def test_builder_pr_without_row_fails(self):
        title = "feat(tasks): T-05 list [AC-LIST-1]"
        errors = pr_guard.check_ledger(title, "")
        self.assertTrue(errors)
        self.assertIn("T-05", errors[0])

    def test_builder_pr_with_row_passes(self):
        title = (
            "chore(skills): T-17 merge-boundary guards "
            "[AC-STATE-1, AC-API-13]"
        )
        diff = "diff --git a/docs/LEDGER.md b/docs/LEDGER.md\n+++ b/docs/LEDGER.md\n" + self.ROW
        self.assertEqual(pr_guard.check_ledger(title, diff), [])

    def test_dependabot_chore_skips(self):
        self.assertEqual(
            pr_guard.check_ledger("chore(deps): bump eslint from 9 to 10", ""),
            [],
        )

    def test_added_ids_ignore_plus_plus_plus_header(self):
        diff = "+++ b/docs/LEDGER.md\n" + self.ROW
        self.assertEqual(pr_guard.added_ledger_task_ids(diff), ["T-17"])

    def test_wrong_task_id_in_row_fails(self):
        title = "feat(api): T-06 handlers [AC-API-4]"
        diff = "+++ b/docs/LEDGER.md\n" + self.ROW  # T-17, not T-06
        errors = pr_guard.check_ledger(title, diff)
        self.assertTrue(errors)
        self.assertIn("T-06", errors[0])


class Cli(unittest.TestCase):
    def test_ok_exit(self):
        rc = pr_guard.main([
            "--title", "chore(deps): bump eslint",
            "--check", "all",
            "--subjects", "chore(deps): bump eslint",
            "--diff", "",
        ])
        self.assertEqual(rc, 0)

    def test_fail_exit(self):
        rc = pr_guard.main([
            "--title", "feat(tasks): add a form",
            "--check", "title",
            "--subjects", "feat(tasks): add a form",
            "--diff", "",
        ])
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
