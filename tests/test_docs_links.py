import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CHECKER = REPOSITORY_ROOT / "scripts" / "docs" / "check_docs.py"


class DocsLinkCheckerTest(unittest.TestCase):
    def run_checker(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CHECKER), "--root", str(root)],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_reports_a_missing_local_document(self) -> None:
        """Removing target existence validation must make this test fail."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docs = root / "docs"
            docs.mkdir()
            (docs / "README.md").write_text(
                "# Index\n\n[Missing](missing.md)\n", encoding="utf-8"
            )

            result = self.run_checker(root)

            self.assertEqual(1, result.returncode)
            self.assertIn("docs/README.md", result.stdout)
            self.assertIn("missing.md", result.stdout)

    def test_reports_a_missing_heading_anchor(self) -> None:
        """Removing heading validation must make this test fail."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docs = root / "docs"
            docs.mkdir()
            (docs / "README.md").write_text(
                "# Index\n\n[Wrong](guide.md#missing-section)\n", encoding="utf-8"
            )
            (docs / "guide.md").write_text(
                "# Guide\n\n## Existing section\n", encoding="utf-8"
            )

            result = self.run_checker(root)

            self.assertEqual(1, result.returncode)
            self.assertIn("#missing-section", result.stdout)

    def test_accepts_existing_files_unicode_anchors_and_external_links(self) -> None:
        """Rejecting valid local or external links must make this test fail."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docs = root / "docs"
            nested = docs / "architecture"
            nested.mkdir(parents=True)
            (docs / "README.md").write_text(
                "# Index\n\n[Flow](architecture/flow.md#путь-к-публикации)\n"
                "[External](https://example.com/docs)\n",
                encoding="utf-8",
            )
            (nested / "flow.md").write_text(
                "# Flow\n\n## Путь к публикации\n", encoding="utf-8"
            )

            result = self.run_checker(root)

            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertIn("Documentation links OK", result.stdout)


if __name__ == "__main__":
    unittest.main()
