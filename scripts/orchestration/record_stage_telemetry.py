#!/usr/bin/env python3
"""Record explicit, nullable stage telemetry without estimating missing values."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import math
import os
import pathlib
import re
import sys
from datetime import datetime, timezone
from typing import Any


SCHEMA_VERSION = "stage-telemetry/v3"
SCHEMA_VERSION_V1 = "stage-telemetry/v1"
SCHEMA_VERSION_V2 = "stage-telemetry/v2"
SUPPORTED_SCHEMA_VERSIONS = {
    SCHEMA_VERSION_V1,
    SCHEMA_VERSION_V2,
    SCHEMA_VERSION,
}
STAGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
VERIFICATION_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$")
STATUSES = {"planned", "in_progress", "blocked", "accepted", "closed"}
COVERAGE_KEYS = {"worker_wall", "queue", "verification", "review", "integration", "rebase"}
COVERAGE_VALUES = {"complete", "partial", "unavailable"}
TOP_LEVEL_KEYS_V1 = {"schema_version", "stage_id", "updated_at", "status", "metrics", "verification", "coverage"}
TOP_LEVEL_KEYS_V2 = TOP_LEVEL_KEYS_V1 | {"delegation"}
V3_FIELDS = {
    "orchestration_level",
    "source_digest",
    "verification_fingerprint",
    "verification_decision",
    "reuse_count",
    "stage_count_window",
    "product_commit_count",
    "orchestration_commit_count",
    "proof_commit_count",
    "repeated_verification_count",
    "bookkeeping_write_count",
    "anomalies",
    "replan_status",
}
TOP_LEVEL_KEYS_V3 = TOP_LEVEL_KEYS_V2 | V3_FIELDS
ORCHESTRATION_LEVELS = {
    "inner_loop",
    "slice_acceptance",
    "integration",
    "release",
}
LEGACY_LEVEL_ALIASES = {"inner": "inner_loop", "delta": "slice_acceptance"}
VERIFICATION_DECISIONS = {"run", "reuse", "not_run"}
ANOMALY_CODES = {
    "orchestration_commits_exceed_product",
    "unchanged_verification_repeated",
    "stage_count_spike",
    "suspicious_micro_stage",
    "repeated_full_verification_without_material_source_change",
}
SIZING_DIAGNOSTIC_CODES = {
    "suspicious_micro_stage",
    "repeated_full_verification_without_material_source_change",
}
MUST_RUN_REASONS = {
    "prior_failed",
    "missing_evidence",
    "invalid_evidence",
    "environment_changed",
    "provenance_changed",
    "source_changed",
}
REPLAN_STATUSES = {"none", "replan_required"}
METRICS_KEYS = {
    "worker_wall_seconds",
    "queue_seconds",
    "review_rounds",
    "findings",
    "integration_seconds",
    "rebase_seconds",
}
FINDING_KEYS = {"p0", "p1"}
DELEGATION_KEYS = {
    "decision",
    "subagent_count",
    "reasons",
    "agent_wall_seconds",
    "coordination_seconds",
}
DELEGATION_DECISIONS = {"local", "worker", "parallel"}
DELEGATION_REASONS = {
    "parallel_latency",
    "context_isolation",
    "specialist_capability",
    "write_isolation",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def default_document(stage_id: str) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "stage_id": stage_id,
        "updated_at": utc_now(),
        "status": "in_progress",
        "metrics": {
            "worker_wall_seconds": None,
            "queue_seconds": None,
            "review_rounds": None,
            "findings": {"p0": None, "p1": None},
            "integration_seconds": None,
            "rebase_seconds": None,
        },
        "verification": {},
        "coverage": {key: "unavailable" for key in sorted(COVERAGE_KEYS)},
        "delegation": default_delegation(),
        "orchestration_level": None,
        "source_digest": None,
        "verification_fingerprint": None,
        "verification_decision": None,
        "reuse_count": None,
        "stage_count_window": None,
        "product_commit_count": None,
        "orchestration_commit_count": None,
        "proof_commit_count": None,
        "repeated_verification_count": None,
        "bookkeeping_write_count": None,
        "anomalies": [],
        "replan_status": None,
    }


def default_delegation() -> dict[str, Any]:
    return {
        "decision": None,
        "subagent_count": None,
        "reasons": [],
        "agent_wall_seconds": None,
        "coordination_seconds": None,
    }


def require_exact_keys(value: object, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise SystemExit(f"{label} does not match the {SCHEMA_VERSION} schema")
    return value


def require_duration(value: object, label: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise SystemExit(f"{label} must be a non-negative finite number or null")


def require_count(value: object, label: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SystemExit(f"{label} must be a non-negative integer or null")


def validate_document(document: object, stage_id: str) -> dict[str, Any]:
    if not isinstance(document, dict):
        raise SystemExit("telemetry must be an object")
    schema_version = document.get("schema_version")
    if schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        raise SystemExit(f"unsupported telemetry schema: {schema_version!r}")
    if schema_version == SCHEMA_VERSION_V1:
        expected_keys = TOP_LEVEL_KEYS_V1
    elif schema_version == SCHEMA_VERSION_V2:
        expected_keys = TOP_LEVEL_KEYS_V2
    else:
        expected_keys = TOP_LEVEL_KEYS_V3
    payload = require_exact_keys(document, expected_keys, "telemetry")
    if payload["stage_id"] != stage_id:
        raise SystemExit("telemetry stage_id does not match the stage directory")
    if not isinstance(payload["updated_at"], str) or not payload["updated_at"].endswith("Z"):
        raise SystemExit("telemetry updated_at must be an RFC3339 UTC timestamp")
    if payload["status"] not in STATUSES:
        raise SystemExit("telemetry status is not supported")
    metrics = require_exact_keys(payload["metrics"], METRICS_KEYS, "metrics")
    for key in ("worker_wall_seconds", "queue_seconds", "integration_seconds", "rebase_seconds"):
        require_duration(metrics[key], f"metrics.{key}")
    require_count(metrics["review_rounds"], "metrics.review_rounds")
    findings = require_exact_keys(metrics["findings"], FINDING_KEYS, "metrics.findings")
    require_count(findings["p0"], "metrics.findings.p0")
    require_count(findings["p1"], "metrics.findings.p1")
    if not isinstance(payload["verification"], dict):
        raise SystemExit("verification must be an object")
    for name, seconds in payload["verification"].items():
        if not isinstance(name, str) or not VERIFICATION_NAME_PATTERN.fullmatch(name):
            raise SystemExit("verification names must be short printable identifiers")
        require_duration(seconds, f"verification.{name}")
    coverage = require_exact_keys(payload["coverage"], COVERAGE_KEYS, "coverage")
    if any(value not in COVERAGE_VALUES for value in coverage.values()):
        raise SystemExit("coverage values must be complete, partial, or unavailable")
    if schema_version in {SCHEMA_VERSION_V2, SCHEMA_VERSION}:
        delegation = require_exact_keys(payload["delegation"], DELEGATION_KEYS, "delegation")
        decision = delegation["decision"]
        if decision is not None and (
            not isinstance(decision, str) or decision not in DELEGATION_DECISIONS
        ):
            raise SystemExit("delegation.decision must be local, worker, parallel, or null")
        require_count(delegation["subagent_count"], "delegation.subagent_count")
        reasons = delegation["reasons"]
        if not isinstance(reasons, list) or any(
            not isinstance(reason, str) or reason not in DELEGATION_REASONS for reason in reasons
        ):
            raise SystemExit("delegation.reasons contains an unsupported reason")
        if len(reasons) != len(set(reasons)):
            raise SystemExit("delegation.reasons must not contain duplicates")
        require_duration(delegation["agent_wall_seconds"], "delegation.agent_wall_seconds")
        require_duration(delegation["coordination_seconds"], "delegation.coordination_seconds")
    if schema_version == SCHEMA_VERSION:
        level = payload["orchestration_level"]
        if level is not None:
            if not isinstance(level, str):
                raise SystemExit("orchestration_level must be a string or null")
            level = LEGACY_LEVEL_ALIASES.get(level, level)
            if level not in ORCHESTRATION_LEVELS:
                raise SystemExit("orchestration_level is not supported")
        for key in ("source_digest", "verification_fingerprint"):
            value = payload[key]
            if value is not None and (not isinstance(value, str) or not value):
                raise SystemExit(f"{key} must be a non-empty string or null")
        decision = payload["verification_decision"]
        if decision is not None and decision not in VERIFICATION_DECISIONS:
            raise SystemExit("verification_decision is not supported")
        for key in (
            "reuse_count",
            "stage_count_window",
            "product_commit_count",
            "orchestration_commit_count",
            "proof_commit_count",
            "repeated_verification_count",
            "bookkeeping_write_count",
        ):
            require_count(payload[key], key)
        anomalies = payload["anomalies"]
        if not isinstance(anomalies, list) or any(
            not isinstance(item, str) or item not in ANOMALY_CODES
            for item in anomalies
        ):
            raise SystemExit("anomalies contains an unsupported cost signal")
        if len(anomalies) != len(set(anomalies)):
            raise SystemExit("anomalies must not contain duplicates")
        replan_status = payload["replan_status"]
        if replan_status is not None and replan_status not in REPLAN_STATUSES:
            raise SystemExit("replan_status is not supported")
    return payload


def upgrade_to_v2(document: dict[str, Any]) -> dict[str, Any]:
    if document["schema_version"] in {SCHEMA_VERSION_V2, SCHEMA_VERSION}:
        return document
    upgraded = dict(document)
    upgraded["schema_version"] = SCHEMA_VERSION_V2
    upgraded["delegation"] = default_delegation()
    return upgraded


def upgrade_to_v3(document: dict[str, Any]) -> dict[str, Any]:
    if document["schema_version"] == SCHEMA_VERSION:
        return document
    upgraded = dict(upgrade_to_v2(document))
    upgraded["schema_version"] = SCHEMA_VERSION
    for key, value in default_document(str(document["stage_id"])).items():
        if key in V3_FIELDS:
            upgraded[key] = value
    return upgraded


def detect_cost_anomalies(
    metrics: dict[str, object], *, suppress_repeated_verification: bool = False
) -> list[str]:
    """Return observed anomaly codes without treating unknown counts as zero."""
    anomalies: list[str] = []
    product = metrics.get("product_commit_count")
    orchestration = metrics.get("orchestration_commit_count")
    proof = metrics.get("proof_commit_count")
    if all(isinstance(value, int) and not isinstance(value, bool) for value in (product, orchestration, proof)):
        if int(orchestration) + int(proof) > int(product):
            anomalies.append("orchestration_commits_exceed_product")
    repeated = metrics.get("repeated_verification_count")
    if (
        not suppress_repeated_verification
        and isinstance(repeated, int)
        and not isinstance(repeated, bool)
        and repeated > 0
    ):
        anomalies.append("unchanged_verification_repeated")
    stages = metrics.get("stage_count_window")
    if (
        isinstance(stages, int)
        and not isinstance(stages, bool)
        and isinstance(product, int)
        and not isinstance(product, bool)
        and stages > max(3, product)
    ):
        anomalies.append("stage_count_spike")
    return anomalies


def parse_assignment(raw: str, label: str) -> tuple[str, str]:
    key, separator, value = raw.partition("=")
    if not separator or not key or not value:
        raise SystemExit(f"{label} must be NAME=VALUE")
    return key, value


def parse_verification(raw: str) -> tuple[str, float]:
    name, raw_seconds = parse_assignment(raw, "--verification")
    if not VERIFICATION_NAME_PATTERN.fullmatch(name):
        raise SystemExit("verification name is not supported")
    try:
        seconds = float(raw_seconds)
    except ValueError as exc:
        raise SystemExit("verification duration must be a number") from exc
    require_duration(seconds, f"verification.{name}")
    return name, seconds


def parse_coverage(raw: str) -> tuple[str, str]:
    name, status = parse_assignment(raw, "--coverage")
    if name not in COVERAGE_KEYS:
        raise SystemExit(f"unsupported coverage key: {name}")
    if status not in COVERAGE_VALUES:
        raise SystemExit(f"unsupported coverage value: {status}")
    return name, status


@contextmanager
def telemetry_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def load_document(path: pathlib.Path, stage_id: str) -> dict[str, Any]:
    if not path.exists():
        return default_document(stage_id)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read telemetry sidecar {path}: {exc}") from exc
    return validate_document(raw, stage_id)


def save_document(path: pathlib.Path, document: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(document, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--status", choices=sorted(STATUSES))
    parser.add_argument("--worker-wall-seconds", type=float)
    parser.add_argument("--queue-seconds", type=float)
    parser.add_argument("--review-rounds", type=int)
    parser.add_argument("--p0-findings", type=int)
    parser.add_argument("--p1-findings", type=int)
    parser.add_argument("--integration-seconds", type=float)
    parser.add_argument("--rebase-seconds", type=float)
    parser.add_argument("--verification", action="append", default=[])
    parser.add_argument("--coverage", action="append", default=[])
    parser.add_argument("--delegation-decision", choices=sorted(DELEGATION_DECISIONS))
    parser.add_argument("--subagent-count", type=int)
    parser.add_argument("--delegation-reason", action="append", default=[])
    parser.add_argument("--agent-wall-seconds", type=float)
    parser.add_argument("--coordination-seconds", type=float)
    parser.add_argument("--orchestration-level")
    parser.add_argument("--source-digest")
    parser.add_argument("--verification-fingerprint")
    parser.add_argument(
        "--verification-decision", choices=sorted(VERIFICATION_DECISIONS)
    )
    parser.add_argument("--reuse-count", type=int)
    parser.add_argument("--stage-count-window", type=int)
    parser.add_argument("--product-commit-count", type=int)
    parser.add_argument("--orchestration-commit-count", type=int)
    parser.add_argument("--proof-commit-count", type=int)
    parser.add_argument("--repeated-verification-count", type=int)
    parser.add_argument("--bookkeeping-write-count", type=int)
    parser.add_argument(
        "--sizing-diagnostic", action="append", default=[], choices=sorted(SIZING_DIAGNOSTIC_CODES)
    )
    parser.add_argument("--prior-result", choices=("passed", "failed", "missing", "invalid"))
    parser.add_argument("--prior-reusable", action="store_true")
    parser.add_argument("--must-run-reason", choices=sorted(MUST_RUN_REASONS))
    args = parser.parse_args(argv[1:])

    if not STAGE_ID_PATTERN.fullmatch(args.stage):
        raise SystemExit("stage id is not a supported telemetry directory name")
    duration_updates = {
        "worker_wall_seconds": args.worker_wall_seconds,
        "queue_seconds": args.queue_seconds,
        "integration_seconds": args.integration_seconds,
        "rebase_seconds": args.rebase_seconds,
    }
    for key, value in duration_updates.items():
        if value is not None:
            require_duration(value, f"--{key.replace('_', '-')}")
    count_updates = {
        "review_rounds": args.review_rounds,
        "p0": args.p0_findings,
        "p1": args.p1_findings,
    }
    for key, value in count_updates.items():
        if value is not None:
            require_count(value, f"--{key.replace('_', '-')}")
    verification_updates = [parse_verification(raw) for raw in args.verification]
    coverage_updates = [parse_coverage(raw) for raw in args.coverage]
    for value, label in (
        (args.agent_wall_seconds, "--agent-wall-seconds"),
        (args.coordination_seconds, "--coordination-seconds"),
    ):
        if value is not None:
            require_duration(value, label)
    if args.subagent_count is not None:
        require_count(args.subagent_count, "--subagent-count")
    if any(reason not in DELEGATION_REASONS for reason in args.delegation_reason):
        raise SystemExit("--delegation-reason contains an unsupported reason")
    if len(args.delegation_reason) != len(set(args.delegation_reason)):
        raise SystemExit("--delegation-reason must not contain duplicates")
    if args.orchestration_level is not None:
        normalized_level = LEGACY_LEVEL_ALIASES.get(
            args.orchestration_level, args.orchestration_level
        )
        if normalized_level not in ORCHESTRATION_LEVELS:
            raise SystemExit("--orchestration-level is not supported")
    else:
        normalized_level = None
    v3_updates = {
        "orchestration_level": normalized_level,
        "source_digest": args.source_digest,
        "verification_fingerprint": args.verification_fingerprint,
        "verification_decision": args.verification_decision,
        "reuse_count": args.reuse_count,
        "stage_count_window": args.stage_count_window,
        "product_commit_count": args.product_commit_count,
        "orchestration_commit_count": args.orchestration_commit_count,
        "proof_commit_count": args.proof_commit_count,
        "repeated_verification_count": args.repeated_verification_count,
        "bookkeeping_write_count": args.bookkeeping_write_count,
    }
    repeated_code = "repeated_full_verification_without_material_source_change"
    if repeated_code in args.sizing_diagnostic:
        if args.must_run_reason is not None:
            raise SystemExit(
                "repeated full verification diagnostic is invalid for a legal must-run retry"
            )
        if not (
            args.prior_result == "passed"
            and args.prior_reusable
            and args.verification_decision == "run"
        ):
            raise SystemExit(
                "repeated full verification diagnostic requires a prior passing exact-reusable identity and run decision"
            )
    if len(args.sizing_diagnostic) != len(set(args.sizing_diagnostic)):
        raise SystemExit("--sizing-diagnostic must not contain duplicates")
    for key, value in v3_updates.items():
        if key.endswith("_count") or key in {"reuse_count", "stage_count_window"}:
            if value is not None:
                require_count(value, f"--{key.replace('_', '-')}")
    v3_requested = any(value is not None for value in v3_updates.values()) or bool(
        args.sizing_diagnostic
    )
    delegation_requested = any(
        value is not None
        for value in (
            args.delegation_decision,
            args.subagent_count,
            args.agent_wall_seconds,
            args.coordination_seconds,
        )
    ) or bool(args.delegation_reason)

    sidecar = pathlib.Path.cwd() / ".codex" / "stages" / args.stage / "telemetry.json"
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    with telemetry_lock(sidecar):
        document = load_document(sidecar, args.stage)
        if v3_requested:
            document = upgrade_to_v3(document)
        elif delegation_requested:
            document = upgrade_to_v2(document)
        if args.status:
            document["status"] = args.status
        metrics = document["metrics"]
        for key, value in duration_updates.items():
            if value is not None:
                metrics[key] = value
        if args.review_rounds is not None:
            metrics["review_rounds"] = args.review_rounds
        for key in ("p0", "p1"):
            if count_updates[key] is not None:
                metrics["findings"][key] = count_updates[key]
        for name, seconds in verification_updates:
            document["verification"][name] = seconds
        for name, status in coverage_updates:
            document["coverage"][name] = status
        if document["schema_version"] in {SCHEMA_VERSION_V2, SCHEMA_VERSION}:
            delegation = document["delegation"]
            if args.delegation_decision is not None:
                delegation["decision"] = args.delegation_decision
            if args.subagent_count is not None:
                delegation["subagent_count"] = args.subagent_count
            if args.delegation_reason:
                delegation["reasons"] = args.delegation_reason
            if args.agent_wall_seconds is not None:
                delegation["agent_wall_seconds"] = args.agent_wall_seconds
            if args.coordination_seconds is not None:
                delegation["coordination_seconds"] = args.coordination_seconds
        if document["schema_version"] == SCHEMA_VERSION:
            for key, value in v3_updates.items():
                if value is not None:
                    document[key] = value
            preserved_sizing = [
                item
                for item in document.get("anomalies", [])
                if item in SIZING_DIAGNOSTIC_CODES
                and not (
                    args.must_run_reason is not None
                    and item
                    == "repeated_full_verification_without_material_source_change"
                )
            ]
            document["anomalies"] = list(
                dict.fromkeys(
                    [
                        *detect_cost_anomalies(
                            document,
                            suppress_repeated_verification=args.must_run_reason is not None,
                        ),
                        *preserved_sizing,
                        *args.sizing_diagnostic,
                    ]
                )
            )
            document["replan_status"] = (
                "replan_required" if document["anomalies"] else "none"
            )
        document["updated_at"] = utc_now()
        save_document(sidecar, validate_document(document, args.stage))

    print(f"stage telemetry recorded: {sidecar}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
