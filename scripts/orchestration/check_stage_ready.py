#!/usr/bin/env python3
"""Check whether a stage folder is ready for closure or handoff."""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import tomllib


def exact_identity_required(contract: dict) -> bool:
    baseline = contract.get("baseline")
    stage_state = contract.get("stage_state")
    return (
        isinstance(baseline, dict)
        and baseline.get("profile") in {"balanced-v2.18", "balanced-v2.19", "balanced-v2.20"}
    ) or (
        isinstance(stage_state, dict)
        and stage_state.get("exact_identity_required") is True
    )


def handoff_has_exact_stage(text: str, stage_id: str) -> bool:
    pattern = re.compile(
        rf"^(?:Current|Accepted|Next) stage id:\s*`?{re.escape(stage_id)}`?\s*$",
        re.MULTILINE | re.IGNORECASE,
    )
    return pattern.search(text) is not None


def artifact_stage_id(path: pathlib.Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end < 0:
        return None
    match = re.search(r"^stage_id:\s*([^\s#]+)\s*$", text[4:end], re.MULTILINE)
    return match.group(1).strip("`\"'") if match else None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: check_stage_ready.py <stage-id>", file=sys.stderr)
        return 2

    stage_id = argv[1]
    repo_root = pathlib.Path.cwd()
    stage_dir = repo_root / ".codex" / "stages" / stage_id
    summary_path = stage_dir / "summary.md"
    artifacts_dir = stage_dir / "artifacts"
    handoff_path = repo_root / ".codex" / "handoff.md"
    validator = repo_root / "scripts" / "orchestration" / "validate_artifact.py"
    contract_path = repo_root / ".codex" / "orchestrator.toml"
    contract = (
        tomllib.loads(contract_path.read_text(encoding="utf-8"))
        if contract_path.exists()
        else {}
    )
    exact_identity = exact_identity_required(contract)
    profile = (contract.get("baseline") or {}).get("profile")

    errors: list[str] = []

    if profile == "balanced-v2.20":
        sizing_linter = repo_root / "scripts" / "orchestration" / "lint_stage_sizing.py"
        if not sizing_linter.is_file():
            errors.append(f"missing stage sizing linter: {sizing_linter}")
        else:
            sizing = subprocess.run(
                [sys.executable, str(sizing_linter), "--stage", stage_id],
                cwd=repo_root,
                text=True,
                capture_output=True,
                check=False,
            )
            if sizing.returncode != 0:
                sizing_errors = [
                    line for line in (sizing.stderr or sizing.stdout).splitlines() if line
                ]
                errors.extend(sizing_errors)
                if any("suspicious_micro_stage" in line for line in sizing_errors):
                    recorder = repo_root / "scripts" / "orchestration" / "record_stage_telemetry.py"
                    recorded = subprocess.run(
                        [
                            sys.executable,
                            str(recorder),
                            "--stage",
                            stage_id,
                            "--sizing-diagnostic",
                            "suspicious_micro_stage",
                        ],
                        cwd=repo_root,
                        text=True,
                        capture_output=True,
                        check=False,
                    )
                    if recorded.returncode != 0:
                        errors.append(
                            "failed to record suspicious_micro_stage through canonical telemetry: "
                            + (recorded.stderr or recorded.stdout).strip()
                        )

    if not summary_path.exists():
        errors.append(f"missing stage summary: {summary_path}")

    artifacts = sorted(artifacts_dir.glob("*.md")) if artifacts_dir.exists() else []

    if exact_identity:
        for artifact in artifacts:
            found_stage = artifact_stage_id(artifact)
            if found_stage != stage_id:
                errors.append(
                    f"artifact stage_id mismatch for {artifact}: "
                    f"expected {stage_id!r}, found {found_stage!r}"
                )

    if handoff_path.exists():
        handoff_text = handoff_path.read_text()
        if exact_identity:
            workspace = contract.get("workspace")
            current_stage = (
                workspace.get("current_stage_id") if isinstance(workspace, dict) else None
            )
            if current_stage != stage_id:
                errors.append(
                    f"workspace.current_stage_id must equal {stage_id!r}; found {current_stage!r}"
                )
            if not handoff_has_exact_stage(handoff_text, stage_id):
                errors.append(f"handoff does not declare exact stage id {stage_id}")
        elif stage_id not in handoff_text:
            errors.append(f"handoff does not mention stage id {stage_id}")
        explicit_defers_match = re.search(
            r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
            handoff_text,
            re.MULTILINE | re.DOTALL,
        )
        if not explicit_defers_match:
            errors.append("handoff is missing ## Explicit defers")
        elif not explicit_defers_match.group("body").strip():
            errors.append("handoff has an empty ## Explicit defers section")
    else:
        errors.append(f"missing handoff file: {handoff_path}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    if artifacts:
        subprocess.run([sys.executable, str(validator), *[str(path) for path in artifacts]], check=True)
    print(f"stage {stage_id} ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
