"""Content-addressed verification evidence: reuse must be honest or absent."""

import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import unittest


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = REPOSITORY_ROOT / "scripts/orchestration/verification_evidence.py"
SPEC = importlib.util.spec_from_file_location("verification_evidence", MODULE_PATH)
assert SPEC and SPEC.loader
EVIDENCE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = EVIDENCE
SPEC.loader.exec_module(EVIDENCE)


class EvidenceHarness(unittest.TestCase):
    """A throwaway repository with one declared input and a counting command."""

    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.root = pathlib.Path(self._temporary.name)
        (self.root / "src").mkdir()
        (self.root / "src/unit.txt").write_text("one\n", encoding="utf-8")
        self.store = self.root / ".codex/evidence/verification"
        self.runs = self.root / "runs.log"

    def execute(self, *, command=None, environment=None, tools=None, inputs=None):
        return EVIDENCE.run_with_evidence(
            repo_root=self.root,
            step="unit",
            command=command or "printf 'x\\n' >> runs.log",
            inputs=inputs if inputs is not None else ["src/**"],
            cwd=".",
            tools=tools if tools is not None else [],
            environment_names=[],
            store=self.store,
            environ=environment if environment is not None else {},
        )

    def run_count(self):
        if not self.runs.exists():
            return 0
        return len(self.runs.read_text(encoding="utf-8").splitlines())

    def only_receipt(self):
        receipts = sorted(self.store.glob("*.json"))
        self.assertEqual(len(receipts), 1, f"expected one receipt, got {receipts}")
        return receipts[0]


class ReuseTest(EvidenceHarness):
    def test_unchanged_inputs_are_reused_without_running_again(self):
        first = self.execute()
        self.assertEqual(first.status, "verified")
        self.assertEqual(first.exit_code, 0)
        self.assertEqual(self.run_count(), 1)

        second = self.execute()
        self.assertEqual(second.status, "reused")
        self.assertEqual(second.exit_code, 0)
        self.assertEqual(self.run_count(), 1)
        self.assertEqual(second.fingerprint, first.fingerprint)

    def test_receipt_declares_the_v2_schema_and_hashes_its_own_identity(self):
        result = self.execute()
        receipt = json.loads(self.only_receipt().read_text(encoding="utf-8"))
        self.assertEqual(receipt["schema_version"], "verification-evidence/v2")
        self.assertEqual(receipt["fingerprint"], result.fingerprint)
        self.assertEqual(
            EVIDENCE.fingerprint_of(receipt["identity"]), receipt["fingerprint"]
        )
        self.assertEqual(self.only_receipt().stem, receipt["fingerprint"])


class InputChangeTest(EvidenceHarness):
    def test_changed_input_content_forces_a_fresh_run(self):
        self.execute()
        (self.root / "src/unit.txt").write_text("two\n", encoding="utf-8")
        second = self.execute()
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)

    def test_added_input_file_forces_a_fresh_run(self):
        self.execute()
        (self.root / "src/extra.txt").write_text("new\n", encoding="utf-8")
        second = self.execute()
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)

    def test_changed_command_forces_a_fresh_run(self):
        self.execute()
        second = self.execute(command="printf 'y\\n' >> runs.log")
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)

    def test_changed_tool_version_forces_a_fresh_run(self):
        versions = {"node": "v22.23.2"}
        tools = [EVIDENCE.ToolIdentity("node", lambda: versions["node"])]
        self.assertEqual(self.execute(tools=tools).status, "verified")
        versions["node"] = "v24.0.0"
        self.assertEqual(self.execute(tools=tools).status, "verified")
        self.assertEqual(self.run_count(), 2)


class ForgeryTest(EvidenceHarness):
    def test_receipt_edited_to_claim_other_inputs_is_rejected(self):
        self.execute()
        path = self.only_receipt()
        receipt = json.loads(path.read_text(encoding="utf-8"))
        receipt["identity"]["inputs"][0]["digest"] = "0" * 64
        path.write_text(json.dumps(receipt), encoding="utf-8")

        (self.root / "src/unit.txt").write_text("two\n", encoding="utf-8")
        second = self.execute()
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)

    def test_receipt_renamed_to_the_expected_fingerprint_is_rejected(self):
        self.execute()
        honest = self.only_receipt()
        stolen = json.loads(honest.read_text(encoding="utf-8"))
        honest.unlink()

        (self.root / "src/unit.txt").write_text("two\n", encoding="utf-8")
        target = EVIDENCE.compute_identity(
            repo_root=self.root,
            command="printf 'x\\n' >> runs.log",
            inputs=["src/**"],
            cwd=".",
            tools=[],
            environment_names=[],
            environ={},
        )
        (self.store / f"{EVIDENCE.fingerprint_of(target)}.json").write_text(
            json.dumps(stolen), encoding="utf-8"
        )

        second = self.execute()
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)

    def test_malformed_receipt_is_rejected_rather_than_trusted(self):
        result = self.execute()
        (self.store / f"{result.fingerprint}.json").write_text("{", encoding="utf-8")
        second = self.execute()
        self.assertEqual(second.status, "verified")
        self.assertEqual(self.run_count(), 2)


class KillSwitchTest(EvidenceHarness):
    def test_switch_is_off_by_default_so_the_hash_decides(self):
        self.execute()
        self.assertEqual(self.execute(environment={}).status, "reused")

    def test_switch_forces_a_fresh_run_and_never_relaxes_the_hash(self):
        self.execute()
        environment = {EVIDENCE.KILL_SWITCH_ENV: "1"}
        forced = self.execute(environment=environment)
        self.assertEqual(forced.status, "verified")
        self.assertEqual(self.run_count(), 2)
        self.assertEqual(self.execute(environment={}).status, "reused")

    def test_switch_value_that_is_not_truthy_leaves_reuse_alone(self):
        self.execute()
        second = self.execute(environment={EVIDENCE.KILL_SWITCH_ENV: "0"})
        self.assertEqual(second.status, "reused")


class FailClosedTest(EvidenceHarness):
    def test_failed_command_records_no_receipt(self):
        result = self.execute(command="printf 'x\\n' >> runs.log; exit 3")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.exit_code, 3)
        self.assertEqual(sorted(self.store.glob("*.json")), [])

        again = self.execute(command="printf 'x\\n' >> runs.log; exit 3")
        self.assertEqual(again.exit_code, 3)
        self.assertEqual(self.run_count(), 2)

    def test_declared_input_matching_nothing_is_an_error(self):
        with self.assertRaises(EVIDENCE.EvidenceError):
            self.execute(inputs=["src/absent/**"])

    def test_empty_input_set_is_an_error(self):
        with self.assertRaises(EVIDENCE.EvidenceError):
            self.execute(inputs=[])

    def test_paths_outside_the_repository_are_rejected(self):
        for hostile in ["/etc/hostname", "../outside.txt"]:
            with self.subTest(path=hostile):
                with self.assertRaises(EVIDENCE.EvidenceError):
                    self.execute(inputs=[hostile])

    def test_symlinked_input_is_rejected(self):
        outside = self.root.parent / "outside.txt"
        outside.write_text("elsewhere\n", encoding="utf-8")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        os.symlink(outside, self.root / "src/link.txt")
        with self.assertRaises(EVIDENCE.EvidenceError):
            self.execute()


if __name__ == "__main__":
    unittest.main()
