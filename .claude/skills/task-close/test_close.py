#!/usr/bin/env python3
"""Unit tests for T-17 B-19: ADR-covered runtime dependencies."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import close  # noqa: E402


class PackageAppearsIn(unittest.TestCase):
    def test_prose_zod_covers_package_zod(self):
        self.assertTrue(close.package_appears_in("… and Zod for validation", "zod"))

    def test_next_js_covers_next(self):
        self.assertTrue(close.package_appears_in("Next.js App Router", "next"))

    def test_radix_ui_prose_covers_radix_ui(self):
        self.assertTrue(close.package_appears_in("Radix UI primitives", "radix-ui"))

    def test_unrelated_package_does_not_match(self):
        self.assertFalse(close.package_appears_in("Zod for validation", "left-pad"))

    def test_does_not_match_inside_a_longer_word(self):
        self.assertFalse(close.package_appears_in("the context object", "tex"))


class AdrFilesMentioning(unittest.TestCase):
    def test_real_adr_names_zod(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        hits = close.adr_files_mentioning(root, "zod")
        self.assertTrue(any(p.endswith("0004-api-simulation.md") for p in hits), hits)

    def test_real_adr_does_not_name_a_fiction(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        self.assertEqual(close.adr_files_mentioning(root, "left-pad"), [])

    def test_fixture_dir(self):
        tmp = tempfile.mkdtemp()
        adr = os.path.join(tmp, "docs", "adr")
        os.makedirs(adr)
        with open(os.path.join(adr, "0001-example.md"), "w", encoding="utf-8") as fh:
            fh.write("We buy Zod and decline Zustand.\n")
        self.assertEqual(
            close.adr_files_mentioning(tmp, "zod"),
            ["docs/adr/0001-example.md"],
        )
        self.assertEqual(close.adr_files_mentioning(tmp, "zustand"), ["docs/adr/0001-example.md"])
        self.assertEqual(close.adr_files_mentioning(tmp, "redux"), [])


if __name__ == "__main__":
    unittest.main()
