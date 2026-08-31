#!/usr/bin/env python3
"""Validate cohesive current-profile stage manifests, scope ledgers, and active-stage state."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tomllib
from typing import Any


MANIFEST_SCHEMA = "orchestration-stage/v1"
LEDGER_SCHEMA = "scope-preservation-ledger/v1"
ANCHOR_SCHEMA = "scope-criterion-snapshot/v1"
ARTIFACT_SCHEMA = "orchestration-artifact/v3"
PROFILE = "balanced-v2.20"
LIFECYCLE_STATUSES = {
    "planned",
    "in_progress",
    "replan_required",
    "internal_ready",
    "accepted",
    "blocked",
}
ALLOWED_SPLIT_REASONS = {
    "unresolved_public_ownership_or_public_contract",
    "hard_dependency",
    "independent_rollback_or_migration_boundary",
    "distinct_security_or_compliance_risk",
    "external_authorization",
}
SHARED_REASON = "shared_acceptance_boundary"
ALLOWED_REASONS = ALLOWED_SPLIT_REASONS | {SHARED_REASON}
MICRO_ONLY_WORK_AREAS = {
    "helper",
    "query_variant",
    "dto",
    "adapter",
    "persistence_or_adapter",
    "decision",
    "proof_binding",
    "proof",
    "docs",
    "docs_update",
    "docs_and_graph_review",
    "graph_review",
    "graph_refresh",
    "settled_decision",
    "test_only",
    "review_finding",
}
MUST_RUN_REASONS = {
    "prior_failed",
    "missing_evidence",
    "invalid_evidence",
    "environment_changed",
    "provenance_changed",
    "source_changed",
}
TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@:/-]*$")
SCAN_CAP = 500


def _canonical_digest(criteria: list[dict[str, str]]) -> str:
    payload = [
        {
            "criterion_id": item["criterion_id"],
            "text_digest": item["text_digest"],
        }
        for item in sorted(criteria, key=lambda item: item["criterion_id"])
    ]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def _safe_repo_file(repo: pathlib.Path, raw: object, label: str) -> tuple[pathlib.Path | None, list[str]]:
    if not isinstance(raw, str) or not raw.strip() or raw in {"none", "n/a"}:
        return None, [f"{label} must be a non-empty repo-relative path"]
    relative = pathlib.Path(raw)
    if relative.is_absolute() or ".." in relative.parts:
        return None, [f"{label} escapes repository: {raw!r}"]
    root = repo.resolve()
    candidate = repo / relative
    for component in (candidate, *candidate.parents):
        if component == root.parent:
            break
        if component.is_symlink():
            return None, [f"{label} may not use symlinks: {raw!r}"]
        if component == root:
            break
    try:
        resolved = candidate.resolve()
    except OSError:
        return None, [f"{label} cannot be resolved: {raw!r}"]
    if resolved != root and root not in resolved.parents:
        return None, [f"{label} escapes repository: {raw!r}"]
    if not candidate.is_file():
        return None, [f"{label} file is missing: {raw!r}"]
    return candidate, []


def _read_json(path: pathlib.Path, label: str) -> tuple[dict[str, Any] | None, list[str]]:
    if path.is_symlink() or not path.is_file():
        return None, [f"{label} file is missing or is a symlink: {path}"]
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return None, [f"{label} is not valid JSON: {path}: {exc}"]
    if not isinstance(value, dict):
        return None, [f"{label} root must be an object: {path}"]
    return value, []


def _token(value: object, label: str) -> list[str]:
    if not isinstance(value, str) or not value.strip() or not TOKEN.fullmatch(value):
        return [f"{label} must be a non-empty stable token"]
    return []


def _token_list(value: object, label: str) -> list[str]:
    if not isinstance(value, list) or not value:
        return [f"{label} must be a non-empty list"]
    if any(not isinstance(item, str) or not item.strip() or not TOKEN.fullmatch(item) for item in value):
        return [f"{label} must contain only non-empty stable tokens"]
    if len(set(value)) != len(value):
        return [f"{label} must not contain duplicates"]
    return []


def _validate_snapshot(document: dict[str, Any], label: str) -> tuple[list[dict[str, str]], list[str]]:
    errors: list[str] = []
    snapshot = document.get("scope_snapshot")
    if not isinstance(snapshot, dict):
        return [], [f"{label}: scope_snapshot must be an object"]
    errors.extend(_token(snapshot.get("source_kind"), f"{label}: scope_snapshot.source_kind"))
    errors.extend(_token(snapshot.get("source_id"), f"{label}: scope_snapshot.source_id"))
    if snapshot.get("source_kind") != "beads":
        errors.append(f"{label}: scope_snapshot.source_kind must be 'beads'")
    if snapshot.get("source_id") != document.get("goal_id"):
        errors.append(f"{label}: scope_snapshot.source_id must equal goal_id")
    raw_criteria = snapshot.get("criteria")
    if not isinstance(raw_criteria, list) or not raw_criteria:
        return [], errors + [f"{label}: scope_snapshot.criteria must be a non-empty list"]
    criteria: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_criteria):
        item_label = f"{label}: scope_snapshot.criteria[{index}]"
        if not isinstance(raw, dict):
            errors.append(f"{item_label} must be an object")
            continue
        criterion_id = raw.get("criterion_id")
        text = raw.get("text")
        text_digest = raw.get("text_digest")
        errors.extend(_token(criterion_id, f"{item_label}.criterion_id"))
        if not isinstance(text, str) or not text.strip():
            errors.append(f"{item_label}.text must be non-empty")
        if not isinstance(text_digest, str) or text_digest != hashlib.sha256(
            text.encode("utf-8") if isinstance(text, str) else b""
        ).hexdigest():
            errors.append(f"{item_label}.text_digest does not match text")
        if isinstance(criterion_id, str):
            if criterion_id in seen:
                errors.append(f"{label}: duplicate criterion_id {criterion_id!r}")
            seen.add(criterion_id)
        if isinstance(criterion_id, str) and isinstance(text_digest, str):
            criteria.append({"criterion_id": criterion_id, "text_digest": text_digest})
    source_digest = snapshot.get("source_digest")
    if criteria and source_digest != _canonical_digest(criteria):
        errors.append(f"{label}: scope_snapshot.source_digest does not match exact criterion set")
    return criteria, errors


def _scope_anchor_path(goal_id: str) -> str:
    return f".codex/goals/{goal_id}/scope-criterion-snapshot.json"


def _creation_blob(repo: pathlib.Path, relative: str) -> bytes | None:
    """Return the first reachable Git blob for an anchor, or None if unanchored."""
    history = subprocess.run(
        ["git", "log", "--reverse", "--diff-filter=A", "--format=%H", "--", relative],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )
    commits = [line.strip() for line in history.stdout.splitlines() if line.strip()]
    if history.returncode != 0 or not commits:
        return None
    created = subprocess.run(
        ["git", "show", f"{commits[0]}:{relative}"],
        cwd=repo,
        capture_output=True,
        check=False,
    )
    return created.stdout if created.returncode == 0 else None


def _validate_scope_anchor(
    repo: pathlib.Path,
    manifest: dict[str, Any],
    embedded: list[dict[str, str]],
    label: str,
    *,
    require_immutable: bool,
) -> tuple[list[dict[str, str]], str | None, list[str]]:
    errors: list[str] = []
    goal_id = manifest.get("goal_id")
    if not isinstance(goal_id, str):
        return [], None, [f"{label}: scope anchor requires a valid goal_id"]
    expected_relative = _scope_anchor_path(goal_id)
    raw_relative = manifest.get("scope_anchor")
    if raw_relative != expected_relative:
        errors.append(
            f"{label}: scope anchor must be the stable goal-level path {expected_relative!r}"
        )
    path, path_errors = _safe_repo_file(repo, raw_relative, f"{label}: scope anchor")
    errors.extend(path_errors)
    if path is None:
        return [], None, errors
    anchor, read_errors = _read_json(path, "scope anchor")
    errors.extend(read_errors)
    if anchor is None:
        return [], None, errors
    if anchor.get("schema_version") != ANCHOR_SCHEMA:
        errors.append(f"{label}: scope anchor schema must be {ANCHOR_SCHEMA}")
    if anchor.get("goal_id") != goal_id:
        errors.append(f"{label}: scope anchor goal_id mismatch")
    anchor_document = {
        "goal_id": goal_id,
        "scope_snapshot": {
            "source_kind": anchor.get("source_kind"),
            "source_id": anchor.get("source_id"),
            "source_digest": anchor.get("source_digest"),
            "criteria": anchor.get("criteria"),
        },
    }
    anchored, anchor_errors = _validate_snapshot(anchor_document, f"{label}: scope anchor")
    errors.extend(anchor_errors)
    anchor_digest = anchor.get("source_digest")
    if manifest.get("scope_anchor_digest") != anchor_digest:
        errors.append(f"{label}: scope anchor digest does not match manifest binding")
    embedded_set = {(item["criterion_id"], item["text_digest"]) for item in embedded}
    anchored_set = {(item["criterion_id"], item["text_digest"]) for item in anchored}
    if embedded_set != anchored_set:
        errors.append(
            f"{label}: embedded scope snapshot does not match the stable scope anchor exact criterion set"
        )
    snapshot = manifest.get("scope_snapshot")
    if isinstance(snapshot, dict) and snapshot.get("source_digest") != anchor_digest:
        errors.append(f"{label}: embedded scope snapshot digest does not match scope anchor")
    if require_immutable:
        relative = path.relative_to(repo).as_posix()
        created = _creation_blob(repo, relative)
        if created is None:
            errors.append(
                f"{label}: scope anchor lacks immutable Git creation provenance required for replan/material split"
            )
        elif path.read_bytes() != created:
            errors.append(
                f"{label}: scope anchor differs from its immutable Git creation blob"
            )
    return anchored, anchor_digest if isinstance(anchor_digest, str) else None, errors


def _validate_ledger(
    repo: pathlib.Path,
    manifest: dict[str, Any],
    snapshot: list[dict[str, str]],
    snapshot_digest: str | None,
    stage_ids: set[str],
    label: str,
) -> list[str]:
    path, errors = _safe_repo_file(repo, manifest.get("scope_ledger"), f"{label}: scope_ledger")
    if path is None:
        return errors
    ledger, read_errors = _read_json(path, "scope ledger")
    if ledger is None:
        return errors + read_errors
    if ledger.get("schema_version") != LEDGER_SCHEMA:
        errors.append(f"{label}: scope ledger schema must be {LEDGER_SCHEMA}")
    if ledger.get("goal_id") != manifest.get("goal_id"):
        errors.append(f"{label}: scope ledger goal_id mismatch")
    if ledger.get("source_snapshot_digest") != snapshot_digest:
        errors.append(f"{label}: scope ledger snapshot digest mismatch")
    entries = ledger.get("criteria")
    if not isinstance(entries, list):
        return errors + [f"{label}: scope ledger criteria must be a list"]
    expected = {(item["criterion_id"], item["text_digest"]) for item in snapshot}
    actual: set[tuple[str, str]] = set()
    reason = manifest.get("stage_boundary_reason")
    boundary_id = manifest.get("acceptance_boundary_id")
    material_evidence_found = False
    for index, entry in enumerate(entries):
        item_label = f"{label}: scope ledger criteria[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{item_label} must be an object")
            continue
        criterion_id = entry.get("criterion_id")
        text_digest = entry.get("criterion_text_digest")
        if isinstance(criterion_id, str) and isinstance(text_digest, str):
            pair = (criterion_id, text_digest)
            if pair in actual:
                errors.append(f"{item_label} duplicates criterion {criterion_id!r}")
            actual.add(pair)
        disposition = entry.get("disposition")
        target = entry.get("target")
        if disposition not in {"stage", "dependency", "gate"}:
            errors.append(f"{item_label}.disposition must be stage, dependency, or gate")
        errors.extend(_token(target, f"{item_label}.target"))
        if disposition == "stage" and target not in stage_ids:
            errors.append(f"{item_label}.target stage does not exist: {target!r}")
        if disposition == "gate" and entry.get("gate_kind") not in ALLOWED_SPLIT_REASONS:
            errors.append(f"{item_label}.gate_kind must be an allowed material boundary")
        if disposition in {"dependency", "gate"}:
            if entry.get("boundary_reason") not in ALLOWED_SPLIT_REASONS:
                errors.append(f"{item_label}.boundary_reason must be an allowed material boundary")
            errors.extend(_token(entry.get("boundary_id"), f"{item_label}.boundary_id"))
        if reason in ALLOWED_SPLIT_REASONS:
            required_disposition = "dependency" if reason == "hard_dependency" else "gate"
            gate_matches = disposition != "gate" or entry.get("gate_kind") == reason
            if (
                disposition == required_disposition
                and entry.get("boundary_reason") == reason
                and entry.get("boundary_id") == boundary_id
                and gate_matches
                and target != manifest.get("stage_id")
            ):
                evidence_path, evidence_errors = _safe_repo_file(
                    repo, entry.get("evidence_path"), f"{item_label}.evidence_path"
                )
                errors.extend(evidence_errors)
                expected_digest = entry.get("evidence_digest")
                if evidence_path is not None:
                    evidence_bytes = evidence_path.read_bytes()
                    actual_digest = hashlib.sha256(evidence_bytes).hexdigest()
                    if not evidence_bytes.strip():
                        errors.append(f"{item_label}.evidence_path must contain material boundary evidence")
                    elif expected_digest != actual_digest:
                        errors.append(f"{item_label}.evidence_digest does not match evidence bytes")
                    else:
                        material_evidence_found = True
    if actual != expected:
        errors.append(f"{label}: scope ledger must map the exact criterion set from the source snapshot")
    if reason in ALLOWED_SPLIT_REASONS and not material_evidence_found:
        work_areas = manifest.get("work_areas")
        diagnostic = (
            "suspicious_micro_stage: "
            if isinstance(work_areas, list) and work_areas and set(work_areas) <= MICRO_ONLY_WORK_AREAS
            else ""
        )
        errors.append(
            f"{label}: {diagnostic}material boundary evidence must match split reason {reason!r}, "
            f"acceptance boundary {boundary_id!r}, and a non-self ledger disposition"
        )
    return errors


def _validate_manifest(document: dict[str, Any], label: str) -> tuple[list[dict[str, str]], list[str]]:
    errors: list[str] = []
    if document.get("schema_version") != MANIFEST_SCHEMA:
        errors.append(f"{label}: schema_version must be {MANIFEST_SCHEMA}")
    for field in ("stage_id", "goal_id", "acceptance_boundary_id", "acceptance_owner"):
        errors.extend(_token(document.get(field), f"{label}: {field}"))
    if document.get("profile_at_creation") != PROFILE:
        errors.append(f"{label}: profile_at_creation must be {PROFILE}")
    if document.get("status") not in LIFECYCLE_STATUSES:
        errors.append(f"{label}: invalid lifecycle status")
    sequence = document.get("sequence")
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        errors.append(f"{label}: sequence must be a positive integer")
    reason = document.get("stage_boundary_reason")
    if reason not in ALLOWED_REASONS:
        errors.append(f"{label}: invalid stage_boundary_reason {reason!r}")
    expected_shape = "cohesive_vertical_slice" if reason == SHARED_REASON else "material_boundary_override"
    if document.get("stage_shape") != expected_shape:
        errors.append(f"{label}: stage_shape must be {expected_shape!r} for reason {reason!r}")
    boundary = document.get("boundary")
    if not isinstance(boundary, dict):
        errors.append(f"{label}: boundary must be an object")
    else:
        for field in ("subsystems", "risk_models", "test_environments", "acceptance_proofs"):
            errors.extend(_token_list(boundary.get(field), f"{label}: boundary.{field}"))
        errors.extend(_token(boundary.get("rollback_boundary"), f"{label}: boundary.rollback_boundary"))
    work_areas = document.get("work_areas")
    errors.extend(_token_list(work_areas, f"{label}: work_areas"))
    if (
        reason == SHARED_REASON
        and isinstance(work_areas, list)
        and work_areas
        and set(work_areas) <= MICRO_ONLY_WORK_AREAS
    ):
        errors.append(
            f"{label}: suspicious_micro_stage: a helper/query/DTO/adapter/proof/docs/graph/decision/test/finding alone is not a stage"
        )
    snapshot, snapshot_errors = _validate_snapshot(document, label)
    errors.extend(snapshot_errors)
    return snapshot, errors


def _artifact_frontmatter(path: pathlib.Path) -> tuple[dict[str, str] | None, list[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return None, [f"cannot read stream artifact {path}: {exc}"]
    if not text.startswith("---\n"):
        return None, [f"stream artifact lacks YAML frontmatter: {path}"]
    end = text.find("\n---\n", 4)
    if end < 0:
        return None, [f"stream artifact frontmatter is unterminated: {path}"]
    values: dict[str, str] = {}
    for raw_line in text[4:end].splitlines():
        if not raw_line or raw_line.startswith(" ") or ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        if value.strip():
            values[key.strip()] = value.strip().strip("`\"'")
    return values, []


def _validate_stream_aggregation(
    repo: pathlib.Path, manifest: dict[str, Any], label: str
) -> list[str]:
    errors: list[str] = []
    stage_id = manifest.get("stage_id")
    raw_entries = manifest.get("stream_artifacts")
    if not isinstance(raw_entries, list):
        return [f"{label}: stream_artifacts must be a list (empty is valid for local stages)"]
    listed_paths: set[str] = set()
    listed_tasks: set[str] = set()
    acceptance_owner = manifest.get("acceptance_owner")
    for index, entry in enumerate(raw_entries):
        item_label = f"{label}: stream_artifacts[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{item_label} must be an object")
            continue
        for field in ("task_id", "stream_owner"):
            errors.extend(_token(entry.get(field), f"{item_label}.{field}"))
        if entry.get("stream_owner") == acceptance_owner:
            errors.append(f"{item_label}.stream_owner must not substitute for acceptance_owner")
        raw_path = entry.get("artifact_path")
        artifact_path, path_errors = _safe_repo_file(repo, raw_path, f"{item_label}.artifact_path")
        errors.extend(path_errors)
        if not isinstance(raw_path, str):
            continue
        expected_parent = f".codex/stages/{stage_id}/artifacts/"
        if not raw_path.startswith(expected_parent) or pathlib.PurePosixPath(raw_path).parent.as_posix() != expected_parent.rstrip("/"):
            errors.append(f"{item_label}.artifact_path must be a direct file under {expected_parent}")
        if raw_path in listed_paths:
            errors.append(f"{item_label}.artifact_path is duplicated")
        listed_paths.add(raw_path)
        task_id = entry.get("task_id")
        if isinstance(task_id, str):
            if task_id in listed_tasks:
                errors.append(f"{item_label}.task_id is duplicated")
            listed_tasks.add(task_id)
        if artifact_path is None:
            continue
        values, artifact_errors = _artifact_frontmatter(artifact_path)
        errors.extend(artifact_errors)
        if values is None:
            continue
        expected_values = {
            "schema_version": ARTIFACT_SCHEMA,
            "task_id": entry.get("task_id"),
            "stage_id": stage_id,
            "stage_manifest": f".codex/stages/{stage_id}/stage-manifest.json",
            "stream_owner": entry.get("stream_owner"),
        }
        for field, expected in expected_values.items():
            if values.get(field) != expected:
                errors.append(
                    f"{item_label}: artifact {field} mismatch; expected {expected!r}, found {values.get(field)!r}"
                )

    artifacts_dir = repo / ".codex" / "stages" / str(stage_id) / "artifacts"
    if artifacts_dir.is_symlink():
        errors.append(f"{label}: artifacts directory may not be a symlink")
        return errors
    actual_paths: set[str] = set()
    if artifacts_dir.is_dir():
        for path in sorted(artifacts_dir.glob("*.md")):
            relative = path.relative_to(repo).as_posix()
            values, artifact_errors = _artifact_frontmatter(path)
            errors.extend(artifact_errors)
            if values is None:
                continue
            schema = values.get("schema_version")
            if schema in {"orchestration-artifact/v1", "orchestration-artifact/v2"}:
                errors.append(
                    f"{label}: newly reported delegated {schema} artifact is not allowed in a v2.20 stage: {relative}"
                )
            if schema == ARTIFACT_SCHEMA:
                actual_paths.add(relative)
                if relative not in listed_paths:
                    errors.append(f"{label}: unlisted v3 stream artifact: {relative}")
    for missing in sorted(listed_paths - actual_paths):
        errors.append(f"{label}: listed v3 stream artifact is missing or invalid: {missing}")
    return errors


def _manifest_documents(repo: pathlib.Path) -> tuple[list[tuple[pathlib.Path, dict[str, Any]]], list[str]]:
    root = repo / ".codex" / "stages"
    if root.is_symlink() or not root.is_dir():
        return [], []
    documents: list[tuple[pathlib.Path, dict[str, Any]]] = []
    errors: list[str] = []
    for path in sorted(root.glob("*/stage-manifest.json"))[:SCAN_CAP]:
        document, read_errors = _read_json(path, "stage manifest")
        errors.extend(read_errors)
        if document is not None:
            documents.append((path, document))
    return documents, errors


def validate_goal(repo: pathlib.Path, goal_id: str) -> list[str]:
    repo = pathlib.Path(repo)
    documents, errors = _manifest_documents(repo)
    selected = [(path, doc) for path, doc in documents if doc.get("goal_id") == goal_id]
    if not selected:
        return errors + [f"stage manifest missing for goal {goal_id!r}"]
    stage_ids = {str(doc.get("stage_id")) for _, doc in selected if isinstance(doc.get("stage_id"), str)}
    snapshots: dict[str, list[dict[str, str]]] = {}
    snapshot_digests: dict[str, str | None] = {}
    for path, document in selected:
        label = str(path.relative_to(repo))
        embedded, manifest_errors = _validate_manifest(document, label)
        errors.extend(manifest_errors)
        reason = document.get("stage_boundary_reason")
        require_immutable = (
            document.get("status") == "replan_required"
            or reason in ALLOWED_SPLIT_REASONS
        )
        snapshot, snapshot_digest, anchor_errors = _validate_scope_anchor(
            repo,
            document,
            embedded,
            label,
            require_immutable=require_immutable,
        )
        errors.extend(anchor_errors)
        errors.extend(_validate_stream_aggregation(repo, document, label))
        if isinstance(document.get("stage_id"), str):
            snapshots[document["stage_id"]] = snapshot
            snapshot_digests[document["stage_id"]] = snapshot_digest
        expected_parent = document.get("stage_id")
        if path.parent.name != expected_parent:
            errors.append(f"{label}: stage_id must match parent directory")

    active = [doc.get("stage_id") for _, doc in selected if doc.get("status") == "in_progress"]
    if len(active) > 1:
        errors.append(
            f"one_active_implementation_stage violated for goal {goal_id!r}: {active}"
        )

    future_statuses = {"planned", "in_progress", "replan_required", "internal_ready"}
    ordered = sorted(
        [item for item in selected if item[1].get("status") in future_statuses],
        key=lambda item: (item[1].get("sequence", 0), str(item[0])),
    )
    seen_boundaries: set[str] = set()
    for _, document in ordered:
        boundary_id = document.get("acceptance_boundary_id")
        if isinstance(boundary_id, str):
            if boundary_id in seen_boundaries:
                errors.append(
                    f"acceptance_boundary_id {boundary_id!r} appears in multiple stages; merge adjacent work into one stage"
                )
            seen_boundaries.add(boundary_id)
    for index, (path, document) in enumerate(ordered):
        label = str(path.relative_to(repo))
        reason = document.get("stage_boundary_reason")
        needs_ledger = document.get("status") == "replan_required" or reason in ALLOWED_SPLIT_REASONS
        if index > 0 and reason == SHARED_REASON:
            errors.append(
                f"{label}: suspicious_micro_stage: an adjacent stage needs an allowed material split reason or must be merged"
            )
        if needs_ledger:
            stage_id = str(document.get("stage_id"))
            errors.extend(
                _validate_ledger(
                    repo,
                    document,
                    snapshots.get(stage_id, []),
                    snapshot_digests.get(stage_id),
                    stage_ids,
                    label,
                )
            )
        elif document.get("scope_ledger") not in {"none", "n/a"}:
            errors.append(f"{label}: ordinary cohesive stage must use scope_ledger 'none'")
    return errors


def repeated_verification_diagnostic(
    *,
    level: str,
    prior_result: str | None,
    prior_reusable: bool,
    decision: str,
    must_run_reason: str | None,
) -> str | None:
    """Flag only an ignored still-reusable pass; mandatory retries always run."""
    if must_run_reason in MUST_RUN_REASONS:
        return None
    if (
        level in {"integration", "release"}
        and prior_result == "passed"
        and prior_reusable
        and decision == "run"
    ):
        return "repeated_full_verification_without_material_source_change"
    return None


def _profile(repo: pathlib.Path) -> tuple[dict[str, Any], str | None]:
    path = repo / ".codex" / "orchestrator.toml"
    if not path.is_file():
        return {}, None
    contract = tomllib.loads(path.read_text(encoding="utf-8"))
    baseline = contract.get("baseline")
    return contract, baseline.get("profile") if isinstance(baseline, dict) else None


def lint_stage(repo: pathlib.Path, stage_id: str) -> list[str]:
    repo = pathlib.Path(repo)
    contract, profile = _profile(repo)
    if profile != PROFILE:
        return []
    sizing = contract.get("stage_sizing")
    legacy = sizing.get("legacy_active_stage_id") if isinstance(sizing, dict) else None
    if legacy == stage_id:
        # Migration is future-only: the single named pre-upgrade stage keeps
        # the profile and validation contract recorded when it was created.
        return []
    manifest_path = repo / ".codex" / "stages" / stage_id / "stage-manifest.json"
    if not manifest_path.is_file():
        return [
            f"new {PROFILE} stage {stage_id!r} requires .codex/stages/{stage_id}/stage-manifest.json; "
            "only stage_sizing.legacy_active_stage_id may finish under the pre-upgrade contract"
        ]
    document, errors = _read_json(manifest_path, "stage manifest")
    if document is None:
        return errors
    goal_id = document.get("goal_id")
    if not isinstance(goal_id, str):
        return errors + ["stage manifest goal_id must be a stable token"]
    errors.extend(validate_goal(repo, goal_id))
    if (
        isinstance(legacy, str)
        and legacy.strip()
        and legacy != stage_id
        and document.get("status") == "in_progress"
    ):
        errors.append(
            f"grandfathered legacy stage {legacy!r} occupies the one active slot; "
            f"new stage {stage_id!r} cannot be in_progress until it exits"
        )
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--stage")
    group.add_argument("--goal")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    repo = pathlib.Path.cwd()
    errors = lint_stage(repo, args.stage) if args.stage else validate_goal(repo, args.goal)
    if args.json:
        print(json.dumps({"ok": not errors, "errors": errors}, indent=2))
    else:
        for error in errors:
            print(error, file=sys.stderr)
        if not errors:
            print("stage sizing OK")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
