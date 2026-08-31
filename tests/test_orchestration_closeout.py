import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
import unittest.mock


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = REPOSITORY_ROOT / "scripts/orchestration/run_stage_closeout.py"
SPEC = importlib.util.spec_from_file_location("stage_closeout", MODULE_PATH)
assert SPEC and SPEC.loader
STAGE_CLOSEOUT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = STAGE_CLOSEOUT
SPEC.loader.exec_module(STAGE_CLOSEOUT)

SIZING_MODULE_PATH = REPOSITORY_ROOT / "scripts/orchestration/lint_stage_sizing.py"
SIZING_SPEC = importlib.util.spec_from_file_location(
    "stage_sizing", SIZING_MODULE_PATH
)
assert SIZING_SPEC and SIZING_SPEC.loader
STAGE_SIZING = importlib.util.module_from_spec(SIZING_SPEC)
sys.modules[SIZING_SPEC.name] = STAGE_SIZING
SIZING_SPEC.loader.exec_module(STAGE_SIZING)

ARTIFACT_MODULE_PATH = REPOSITORY_ROOT / "scripts/orchestration/validate_artifact.py"
ARTIFACT_SPEC = importlib.util.spec_from_file_location(
    "artifact_validator", ARTIFACT_MODULE_PATH
)
assert ARTIFACT_SPEC and ARTIFACT_SPEC.loader
ARTIFACT_VALIDATOR = importlib.util.module_from_spec(ARTIFACT_SPEC)
sys.modules[ARTIFACT_SPEC.name] = ARTIFACT_VALIDATOR
ARTIFACT_SPEC.loader.exec_module(ARTIFACT_VALIDATOR)


class ChangedLineDebtHitsTest(unittest.TestCase):
    def test_ignores_untracked_binary_content_but_scans_text(self):
        text_marker = "TO" + "DO"
        binary_marker = b"FI" + b"XME"

        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            subprocess.run(
                ["git", "init", "--quiet"], cwd=repository, check=True
            )
            (repository / "note.txt").write_text(
                f"{text_marker}: tracked product debt\n", encoding="utf-8"
            )
            (repository / "asset.ttf").write_bytes(
                b"\x00font-data\x00" + binary_marker + b"\x00"
            )

            hits = STAGE_CLOSEOUT.changed_line_debt_hits(repository)

        self.assertEqual(
            hits, [f"note.txt:1: {text_marker}: tracked product debt"]
        )


class JestResultCountsTest(unittest.TestCase):
    """The receipt has to attest the suite that actually carries the work.

    A repository whose acceptance is a Jest run followed by a handful of
    unittest cases recorded only the unittest tail: Jest's own totals matched no
    pattern, and the last-N window then dropped everything else. The receipt
    said `Ran 6 tests` for a run of several hundred.
    """

    def test_keeps_jest_totals_beside_a_later_unittest_tail(self):
        output = "\n".join(
            [
                "PASS tests/example.test.cjs",
                "Test Suites: 75 passed, 75 total",
                "Tests:       1 skipped, 725 passed, 726 total",
                "Snapshots:   0 total",
                "Ran 6 tests in 0.123s",
                "OK",
            ]
        )

        self.assertEqual(
            STAGE_CLOSEOUT.collect_result_counts(output),
            [
                "Test Suites: 75 passed, 75 total",
                "Tests:       1 skipped, 725 passed, 726 total",
                "Ran 6 tests in 0.123s",
                "OK",
            ],
        )

    def test_ignores_prose_that_merely_starts_with_the_same_word(self):
        self.assertEqual(
            STAGE_CLOSEOUT.collect_result_counts("Tests: see the runbook"), []
        )


class LegacyStageSizingTest(unittest.TestCase):
    def test_grandfathered_stage_keeps_its_creation_profile(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            stage = repository / ".codex/stages/stage-old"
            stage.mkdir(parents=True)
            (repository / ".codex/orchestrator.toml").write_text(
                "[baseline]\n"
                'profile = "balanced-v2.20"\n'
                "[stage_sizing]\n"
                'legacy_active_stage_id = "stage-old"\n',
                encoding="utf-8",
            )
            (stage / "stage-manifest.json").write_text(
                '{"profile_at_creation":"balanced-v2.19"}\n',
                encoding="utf-8",
            )

            errors = STAGE_SIZING.lint_stage(repository, "stage-old")

        self.assertEqual(errors, [])


class LegacyArtifactMetadataTest(unittest.TestCase):
    def test_v3_artifact_keeps_reading_historical_verification_tier(self):
        values = {
            "schema_version": "orchestration-artifact/v3",
            "task_id": "stream-old",
            "stage_id": "stage-old",
            "repo": "fixture",
            "branch": "fixture",
            "base_branch": "main",
            "base_commit": "abc123",
            "worktree": "shared",
            "status": "accepted",
            "delivery_method": "merge",
            "accepted_by_orchestrator": "yes",
            "cleanup_status": "cleaned",
            "cleanup_notes": "No owned resources remain.",
            "risk_level": "low",
            "verification": ["passed"],
            "changed_files": ["fixture.txt"],
            "explicit_defers": ["none"],
            "orchestration_level": "slice_acceptance",
            "verification_tier": "delta",
        }
        body = "# Summary\nDone.\n# Verification\nPassed.\n# Risks / Follow-ups\nNone.\n"

        errors = ARTIFACT_VALIDATOR.validate_common_fields(
            pathlib.Path("artifact.md"), values, body
        )

        self.assertEqual(errors, [])


class ResultCountsTest(unittest.TestCase):
    def test_records_both_halves_of_a_composite_test_command(self):
        """`pnpm test` runs Jest and then unittest in one command.

        The receipt used to carry only the Python tail, so a reader saw
        "Ran 6 tests" for a run of hundreds and had no attested number for the
        Jest half at all.
        """

        output = "\n".join(
            [
                "PASS tests/example.test.cjs",
                "",
                "Test Suites: 72 passed, 72 total",
                "Tests:       605 passed, 605 total",
                "Snapshots:   0 total",
                "Time:        27.2 s",
                "Ran 6 tests in 0.133s",
                "",
                "OK",
            ]
        )

        self.assertEqual(
            STAGE_CLOSEOUT.collect_result_counts(output),
            [
                "Test Suites: 72 passed, 72 total",
                "Tests:       605 passed, 605 total",
                "Ran 6 tests in 0.133s",
                "OK",
            ],
        )

    def test_records_a_failing_jest_run(self):
        output = "Tests:       2 failed, 603 passed, 605 total\nFAILED (failures=1)"

        self.assertEqual(
            STAGE_CLOSEOUT.collect_result_counts(output),
            [
                "Tests:       2 failed, 603 passed, 605 total",
                "FAILED (failures=1)",
            ],
        )

    def test_records_literal_node_22_non_tty_tap_totals(self):
        output = "\n".join(
            [
                "TAP version 13",
                "1..95",
                "# tests 95",
                "# suites 0",
                "# pass 92",
                "# fail 0",
                "# cancelled 0",
                "# skipped 3",
                "# todo 0",
                "# duration_ms 1927.542",
            ]
        )

        self.assertEqual(
            STAGE_CLOSEOUT.collect_result_counts(output),
            [
                "# tests 95",
                "# pass 92",
                "# fail 0",
                "# skipped 3",
                "# todo 0",
            ],
        )

    def test_limit_keeps_both_ends_of_a_composite_pnpm_test(self):
        output = "\n".join(
            [
                "Test Suites: 75 passed, 75 total",
                "Tests:       1 skipped, 725 passed, 726 total",
                *(f"{number} passed (shard {number})" for number in range(1, 13)),
                "# tests 95",
                "# pass 92",
                "# fail 0",
                "# skipped 3",
                "# todo 0",
                "Ran 8 tests in 0.123s",
                "OK",
            ]
        )

        counts = STAGE_CLOSEOUT.collect_result_counts(output)

        self.assertLessEqual(len(counts), STAGE_CLOSEOUT.RESULT_COUNT_REPORT_LIMIT)
        self.assertIn("Test Suites: 75 passed, 75 total", counts)
        self.assertIn("Tests:       1 skipped, 725 passed, 726 total", counts)
        self.assertIn("# tests 95", counts)
        self.assertIn("Ran 8 tests in 0.123s", counts)


class EnvironmentGateTest(unittest.TestCase):
    def test_records_exact_tap_skip_name_and_environment_reason(self):
        output = "\n".join(
            [
                "ok 17 - persists sources in native PostgreSQL # SKIP SOURCE_REGISTRY_POSTGRES_URL is not configured",
                "# prose says OTHER_URL is not configured",
            ]
        )

        self.assertEqual(
            STAGE_CLOSEOUT.collect_environment_gates(output),
            [
                {
                    "test_name": "persists sources in native PostgreSQL",
                    "environment_variable": "SOURCE_REGISTRY_POSTGRES_URL",
                    "reason": "SOURCE_REGISTRY_POSTGRES_URL is not configured",
                    "status": "skipped",
                }
            ],
        )

    def test_live_tap_result_has_no_environment_gate_marker(self):
        output = "ok 17 - persists sources in native PostgreSQL\n# tests 1\n# pass 1"

        self.assertEqual(STAGE_CLOSEOUT.collect_environment_gates(output), [])


class AlternateAcceptanceReceiptCliTest(unittest.TestCase):
    def _repository(self, root: pathlib.Path) -> pathlib.Path:
        stage = root / ".codex/stages/stage-fixture"
        stage.mkdir(parents=True)
        (root / ".codex/orchestrator.toml").write_text(
            "[verification]\nrelease_commands = []\n", encoding="utf-8"
        )
        (stage / "summary.md").write_text(
            "docs-reviewed: no-change-needed - fixture only\n", encoding="utf-8"
        )
        subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)
        subprocess.run(["git", "config", "user.name", "Fixture"], cwd=root, check=True)
        subprocess.run(
            ["git", "config", "user.email", "fixture@example.invalid"],
            cwd=root,
            check=True,
        )
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(
            ["git", "commit", "--quiet", "-m", "fixture"], cwd=root, check=True
        )
        return stage

    def test_cli_writes_path_safe_alternate_without_reading_or_rewriting_accepted_receipt(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            stage = self._repository(repository)
            accepted = stage / "acceptance-receipt.json"
            accepted_bytes = b"accepted receipt must stay byte-for-byte unchanged\n"
            accepted.write_bytes(accepted_bytes)
            subprocess.run(["git", "add", "."], cwd=repository, check=True)
            subprocess.run(
                ["git", "commit", "--quiet", "-m", "accepted receipt"],
                cwd=repository,
                check=True,
            )
            command = (
                "printf 'ok 1 - native persistence # SKIP SOURCE_REGISTRY_POSTGRES_URL "
                "is not configured\\n# tests 1\\n# pass 0\\n# fail 0\\n# skipped 1\\n'"
            )
            cli = [
                sys.executable,
                str(MODULE_PATH),
                "--stage",
                "stage-fixture",
                "--level",
                "slice_acceptance",
                "--command",
                command,
                "--receipt-suffix",
                "evidence-repair",
            ]

            first = subprocess.run(
                cli, cwd=repository, text=True, capture_output=True, check=False
            )
            alternate = stage / "acceptance-receipt.evidence-repair.json"

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(accepted.read_bytes(), accepted_bytes)
            payload = json.loads(alternate.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["command_results"][0]["environment_gates"][0]["status"],
                "skipped",
            )
            alternate_bytes = alternate.read_bytes()

            second = subprocess.run(
                cli, cwd=repository, text=True, capture_output=True, check=False
            )

            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertIn("acceptance receipt reused:", second.stdout)
            self.assertEqual(alternate.read_bytes(), alternate_bytes)
            self.assertEqual(accepted.read_bytes(), accepted_bytes)

            accepted.write_bytes(b"accepted receipt changed by its owner\n")
            previous_fingerprint = payload["verification_fingerprint"]

            third = subprocess.run(
                cli, cwd=repository, text=True, capture_output=True, check=False
            )
            refreshed = json.loads(alternate.read_text(encoding="utf-8"))

            self.assertEqual(third.returncode, 0, third.stderr)
            self.assertNotIn("acceptance receipt reused:", third.stdout)
            self.assertIn(f"$ {command}", third.stdout)
            self.assertNotEqual(
                refreshed["verification_fingerprint"], previous_fingerprint
            )
            self.assertEqual(
                accepted.read_bytes(), b"accepted receipt changed by its owner\n"
            )

    def test_secure_temp_file_cannot_follow_old_predictable_symlink(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            stage = pathlib.Path(temp_directory)
            accepted = stage / "acceptance-receipt.json"
            accepted_bytes = b"accepted receipt must stay unchanged\n"
            accepted.write_bytes(accepted_bytes)
            alternate = stage / "acceptance-receipt.evidence-repair.json"
            old_temporary = stage / f".{alternate.name}.{os.getpid()}.tmp"
            old_temporary.symlink_to(accepted)

            STAGE_CLOSEOUT._save_acceptance_receipt(
                alternate, {"result": "passed", "idempotency_key": "fixture"}
            )

            self.assertEqual(accepted.read_bytes(), accepted_bytes)
            self.assertEqual(
                json.loads(alternate.read_text(encoding="utf-8"))["result"], "passed"
            )
            self.assertTrue(old_temporary.is_symlink())

    def test_rejects_unsafe_suffixes_and_symlink_stage_escape(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            self._repository(repository)
            for suffix in ("../escape", "/tmp/escape", "nested/name"):
                with self.subTest(suffix=suffix):
                    with self.assertRaises(SystemExit):
                        STAGE_CLOSEOUT.resolve_acceptance_receipt_path(
                            repository, "stage-fixture", suffix
                        )
            selected = (
                repository
                / ".codex/stages/stage-fixture/acceptance-receipt.evidence-repair.json"
            )
            selected.symlink_to(repository / ".codex/orchestrator.toml")
            with self.assertRaises(SystemExit):
                STAGE_CLOSEOUT.resolve_acceptance_receipt_path(
                    repository, "stage-fixture", "evidence-repair"
                )

        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            outside = repository / "outside"
            outside.mkdir()
            stages = repository / ".codex/stages"
            stages.mkdir(parents=True)
            (stages / "stage-fixture").symlink_to(outside, target_is_directory=True)

            with self.assertRaises(SystemExit):
                STAGE_CLOSEOUT.resolve_acceptance_receipt_path(
                    repository, "stage-fixture", "evidence-repair"
                )

        with tempfile.TemporaryDirectory() as temp_directory:
            repository = pathlib.Path(temp_directory)
            outside = repository / "outside"
            (outside / "stages/stage-fixture").mkdir(parents=True)
            (repository / ".codex").symlink_to(outside, target_is_directory=True)

            with self.assertRaises(SystemExit):
                STAGE_CLOSEOUT.resolve_acceptance_receipt_path(
                    repository, "stage-fixture", "evidence-repair"
                )


if __name__ == "__main__":
    unittest.main()


class ProcessVerificationStageDefaultTest(unittest.TestCase):
    """Release acceptance must actually reach the stage readiness check.

    `verification.release_commands` are literal strings with nowhere to
    interpolate a stage id, so every release invoked the script bare and
    `check_stage_ready.py` never ran in the strictest acceptance the project
    has. An omitted `--stage` now means the stage the contract names.
    """

    def test_an_omitted_stage_falls_back_to_the_contract(self) -> None:
        root = pathlib.Path(__file__).resolve().parents[1]
        script = (root / "scripts/orchestration/run_process_verification.sh").read_text()
        self.assertIn("current_stage_id", script)

        import tomllib

        contract = tomllib.loads((root / ".codex/orchestrator.toml").read_text())
        stage_id = contract["workspace"]["current_stage_id"]
        self.assertTrue(stage_id)

        result = subprocess.run(
            ["bash", "scripts/orchestration/run_process_verification.sh"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        # Named, not merely reached: a run that silently picked a different
        # stage would still exit zero.
        self.assertIn(
            f"stage readiness: {stage_id} (from orchestrator.toml)", result.stdout
        )
        self.assertIn(f"stage {stage_id} ready", result.stdout)


class JestSkipNamesTest(unittest.TestCase):
    """A receipt has to say which Jest test did not run, not just how many.

    Native skips already carry the environment variable that caused them. Jest
    reported only a count, which is why two accepted receipts could not be
    reproduced: `1 skipped` names nothing.
    """

    def _module(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location(
            "run_stage_closeout",
            root / "scripts/orchestration/run_stage_closeout.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _write_report(self, directory: pathlib.Path, body: str) -> pathlib.Path:
        report = directory / "coverage" / "junit.xml"
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(body, encoding="utf-8")
        return report

    def test_names_every_skipped_case_and_admits_the_reason_is_unknown(self) -> None:
        module = self._module()
        with tempfile.TemporaryDirectory() as raw:
            root = pathlib.Path(raw)
            self._write_report(
                root,
                """<?xml version="1.0"?>
<testsuites tests="3" failures="0">
  <testsuite name="relay">
    <testcase name="the relay reaches nginx"><skipped/></testcase>
    <testcase name="the relay refuses a third party"/>
    <testcase name="the backup restores"><skipped/></testcase>
  </testsuite>
</testsuites>""",
            )
            skips = module.collect_jest_skips(root, 0)

        self.assertEqual(
            [entry["test_name"] for entry in skips],
            ["the relay reaches nginx", "the backup restores"],
        )
        for entry in skips:
            self.assertEqual(entry["status"], "skipped")
            self.assertEqual(entry["source"], "jest-junit")
            self.assertIn("does not report why", entry["reason"])

    def test_ignores_a_report_the_command_did_not_write(self) -> None:
        module = self._module()
        with tempfile.TemporaryDirectory() as raw:
            root = pathlib.Path(raw)
            report = self._write_report(
                root,
                """<?xml version="1.0"?>
<testsuites><testsuite name="old">
  <testcase name="a test from a previous run"><skipped/></testcase>
</testsuite></testsuites>""",
            )
            stale = report.stat().st_mtime
            # Naming a previous run's skips as this run's would be a fresh way
            # of lying in a receipt, which is the defect this closes.
            self.assertEqual(module.collect_jest_skips(root, stale + 60), [])
            self.assertEqual(len(module.collect_jest_skips(root, stale - 60)), 1)

    def test_survives_a_missing_or_unparsable_report(self) -> None:
        module = self._module()
        with tempfile.TemporaryDirectory() as raw:
            root = pathlib.Path(raw)
            self.assertEqual(module.collect_jest_skips(root, 0), [])
            self._write_report(root, "<testsuites>truncated")
            self.assertEqual(module.collect_jest_skips(root, 0), [])


class BlockingReviewFindingsGuardTest(unittest.TestCase):
    """The guard is declared blocking, so it has to be able to block.

    Every case below is a deliberate mutation of the shape a real stage
    records: a finding nobody corrected, a finding waved through, and an
    inbox nobody wrote. A guard that stays green through those is decoration.
    """

    STAGE = "content-factory-next-probe"
    CONTRACT = {
        "stage_limits": {"p0_p1_block_acceptance": True},
        "completion_inbox": {
            "events_file": "inbox/completions.ndjson",
            "review_state_file": "inbox/review-state.json",
        },
    }

    def _write_state(self, root: pathlib.Path, reviewed: dict) -> None:
        state_path = root / "inbox/review-state.json"
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"reviewed": reviewed}), encoding="utf-8")

    def _check(self, reviewed: dict | None):
        with tempfile.TemporaryDirectory() as raw:
            root = pathlib.Path(raw)
            if reviewed is not None:
                self._write_state(root, reviewed)
            return STAGE_CLOSEOUT.check_blocking_review_findings(
                root, self.CONTRACT, self.STAGE
            )

    def _finding(self, severity: str) -> dict:
        return {
            "stage_id": self.STAGE,
            "severity": severity,
            "decision": "needs_rework_same_stream",
            "verify": "passed",
            "resolves_review": [],
        }

    def _correction(self, resolves: list[str]) -> dict:
        return {
            "stage_id": self.STAGE,
            "severity": "",
            "decision": "accepted",
            "verify": "passed",
            "artifact_path": ".codex/stages/probe/artifacts/probe.md",
            "resolves_review": resolves,
        }

    def test_a_corrected_p1_passes_and_the_receipt_says_what_it_read(self):
        reviewed = {
            "finding-1": self._finding("P1"),
            "fix-1": self._correction(["finding-1"]),
        }
        with tempfile.TemporaryDirectory() as raw:
            root = pathlib.Path(raw)
            self._write_state(root, reviewed)
            with unittest.mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                STAGE_CLOSEOUT.check_blocking_review_findings(
                    root, self.CONTRACT, self.STAGE
                )
        printed = out.getvalue()
        self.assertIn("blocking review findings OK", printed)
        # A bare OK cannot be told apart from a green produced by no data.
        self.assertIn("2 reviewed entries", printed)
        self.assertIn("review-state.json", printed)

    def test_an_uncorrected_p1_blocks_acceptance(self):
        with self.assertRaises(SystemExit) as raised:
            self._check({"finding-1": self._finding("P1")})
        self.assertEqual(raised.exception.code, 1)

    def test_an_uncorrected_p0_blocks_acceptance(self):
        with self.assertRaises(SystemExit) as raised:
            self._check({"finding-1": self._finding("P0")})
        self.assertEqual(raised.exception.code, 1)

    def test_a_p1_cannot_be_accepted_without_a_linked_correction(self):
        accepted_directly = self._correction([])
        accepted_directly["severity"] = "P1"
        with self.assertRaises(SystemExit) as raised:
            self._check({"finding-1": accepted_directly})
        self.assertEqual(raised.exception.code, 1)

    def test_a_correction_for_another_stage_does_not_clear_this_one(self):
        stray = self._correction(["finding-1"])
        stray["stage_id"] = "content-factory-next-elsewhere"
        with self.assertRaises(SystemExit) as raised:
            self._check({"finding-1": self._finding("P1"), "fix-1": stray})
        self.assertEqual(raised.exception.code, 1)

    def test_a_p2_finding_does_not_block(self):
        self.assertIsNone(self._check({"finding-1": self._finding("P2")}))

    def test_a_missing_inbox_refuses_instead_of_reporting_OK(self):
        with self.assertRaises(SystemExit) as raised:
            self._check(None)
        message = str(raised.exception.code)
        self.assertIn("no data source", message)
        self.assertIn("review-state.json", message)

    def test_the_guard_stays_out_of_the_way_when_it_is_not_declared_blocking(self):
        with tempfile.TemporaryDirectory() as raw:
            self.assertIsNone(
                STAGE_CLOSEOUT.check_blocking_review_findings(
                    pathlib.Path(raw),
                    {"stage_limits": {"p0_p1_block_acceptance": False}},
                    self.STAGE,
                )
            )
