#!/usr/bin/env python3
"""Validate tracked orchestration artifact files."""

from __future__ import annotations

import json
import pathlib
import re
import sys
import tomllib
from typing import TypeAlias

YamlValue: TypeAlias = str | list[str]

REQUIRED_KEYS = {
    "schema_version",
    "task_id",
    "stage_id",
    "repo",
    "branch",
    "base_branch",
    "base_commit",
    "worktree",
    "status",
    "delivery_method",
    "accepted_by_orchestrator",
    "cleanup_status",
    "cleanup_notes",
    "risk_level",
    "verification",
    "changed_files",
    "explicit_defers",
}

REQUIRED_LIST_KEYS = {"verification", "changed_files", "explicit_defers"}
OPTIONAL_LIST_KEYS = {"risk_tags", "affected_surfaces", "invariants", "evidence"}
ALLOWED_SCHEMA_VERSIONS = {
    "orchestration-artifact/v1",
    "orchestration-artifact/v2",
    "orchestration-artifact/v3",
}
ALLOWED_STATUSES = {"returned", "accepted", "merged", "blocked"}
ALLOWED_DELIVERY_METHODS = {"merge", "cherry-pick", "manual integration", "not accepted", "n/a"}
ALLOWED_ACCEPTED_BY_ORCHESTRATOR = {"yes", "no"}
ALLOWED_CLEANUP_STATUSES = {"pending", "cleaned", "blocked", "not_applicable"}
ALLOWED_RISK_LEVELS = {"low", "medium", "high"}
ALLOWED_VERIFICATION_TIERS = {
    "inner",
    "delta",
    "inner_loop",
    "slice_acceptance",
    "integration",
    "release",
    "n/a",
}
ORCHESTRATION_LEVELS = {
    "inner_loop",
    "slice_acceptance",
    "integration",
    "release",
}
LEGACY_LEVEL_ALIASES = {"inner": "inner_loop", "delta": "slice_acceptance"}
ALLOWED_SCOPE_KINDS = {"product_slice", "foundation"}
METADATA_TOKEN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

REQUIRED_HEADINGS = [
    "# Summary",
    "# Verification",
    "# Risks / Follow-ups",
]

SECRET_PATTERNS = [
    re.compile(r"BEGIN [A-Z ]*PRIVATE KEY"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{10,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z\-_]{20,}\b"),
]


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def extract_frontmatter_values(frontmatter: str) -> dict[str, YamlValue]:
    values: dict[str, YamlValue] = {}
    current_key: str | None = None

    for raw_line in frontmatter.splitlines():
        if not raw_line:
            continue

        if raw_line.startswith("  - ") or raw_line.startswith("- "):
            if current_key is not None:
                current_values = values.setdefault(current_key, [])
                if isinstance(current_values, list):
                    current_values.append(raw_line.split("-", 1)[1].strip())
            continue

        if ":" not in raw_line or raw_line.startswith(" "):
            continue

        key, raw_value = raw_line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value:
            values[key] = raw_value
            current_key = None
        else:
            values[key] = []
            current_key = key

    return values


def is_placeholder(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith("<") and stripped.endswith(">")


def list_is_meaningful(value: YamlValue | None) -> bool:
    if not isinstance(value, list):
        return False
    return any(item.strip() and not is_placeholder(item) for item in value)


def list_has_declared_metadata(value: YamlValue | None) -> bool:
    if not isinstance(value, list):
        return False
    return any(
        item.strip() and not is_placeholder(item) and item.strip().lower() not in {"none", "n/a"}
        for item in value
    )


def validate_scalar(
    path: pathlib.Path,
    key: str,
    values: dict[str, YamlValue],
    allowed: set[str] | None = None,
) -> list[str]:
    value = values.get(key)
    if not isinstance(value, str) or not value.strip():
        return [f"{path}: frontmatter key {key!r} must be a non-empty scalar"]
    if is_placeholder(value):
        return [f"{path}: unresolved placeholder value: {key}"]
    if allowed is not None and value not in allowed:
        return [f"{path}: invalid {key!r} value {value!r}; expected one of {sorted(allowed)}"]
    return []


def require_level(path: pathlib.Path, value: YamlValue | None) -> list[str]:
    if not isinstance(value, str) or not value.strip() or is_placeholder(value):
        return [f"{path}: orchestration_level must be a concrete scalar"]
    raw = value.strip().lower()
    normalized = LEGACY_LEVEL_ALIASES.get(raw, raw)
    if normalized not in ORCHESTRATION_LEVELS:
        return [
            f"{path}: unsupported orchestration_level {value!r}; expected one of "
            f"{sorted(ORCHESTRATION_LEVELS | set(LEGACY_LEVEL_ALIASES))}"
        ]
    return []


def require_non_placeholder(
    path: pathlib.Path, values: dict[str, YamlValue], field: str
) -> list[str]:
    value = values.get(field)
    if isinstance(value, str):
        if value.strip() and not is_placeholder(value) and value.strip().lower() != "n/a":
            return []
    elif isinstance(value, list):
        if any(
            item.strip()
            and not is_placeholder(item)
            and item.strip().lower() not in {"n/a", "none"}
            for item in value
        ):
            return []
    return [f"{path}: foundation artifact requires non-placeholder {field}"]


def validate_optional_evidence(
    path: pathlib.Path, values: dict[str, YamlValue]
) -> list[str]:
    evidence = values.get("evidence")
    if evidence is None:
        return []
    if not isinstance(evidence, list):
        return [f"{path}: frontmatter key 'evidence' must be a list when provided"]
    errors: list[str] = []
    for item in evidence:
        stripped = item.strip()
        if not stripped or stripped.lower() in {"none", "n/a"} or is_placeholder(stripped):
            continue
        evidence_path = pathlib.PurePosixPath(stripped)
        if evidence_path.is_absolute() or ".." in evidence_path.parts:
            errors.append(f"{path}: evidence path must be repo-relative: {item!r}")
    return errors


def validate_common_fields(
    path: pathlib.Path, values: dict[str, YamlValue], body: str
) -> list[str]:
    errors: list[str] = []
    missing = sorted(REQUIRED_KEYS - set(values))
    if missing:
        errors.append(f"{path}: missing frontmatter keys: {', '.join(missing)}")

    for key in REQUIRED_KEYS - REQUIRED_LIST_KEYS:
        if key in values:
            errors.extend(validate_scalar(path, key, values))

    if "status" in values:
        errors.extend(validate_scalar(path, "status", values, ALLOWED_STATUSES))
    if "delivery_method" in values:
        errors.extend(validate_scalar(path, "delivery_method", values, ALLOWED_DELIVERY_METHODS))
    if "accepted_by_orchestrator" in values:
        errors.extend(validate_scalar(path, "accepted_by_orchestrator", values, ALLOWED_ACCEPTED_BY_ORCHESTRATOR))
    if "cleanup_status" in values:
        errors.extend(validate_scalar(path, "cleanup_status", values, ALLOWED_CLEANUP_STATUSES))
    if "risk_level" in values:
        errors.extend(validate_scalar(path, "risk_level", values, ALLOWED_RISK_LEVELS))
    if "verification_tier" in values:
        errors.extend(validate_scalar(path, "verification_tier", values, ALLOWED_VERIFICATION_TIERS))

    for key in sorted(REQUIRED_LIST_KEYS):
        if key in values and not list_is_meaningful(values.get(key)):
            errors.append(f"{path}: frontmatter key {key!r} must contain at least one non-placeholder item")

    for key in sorted(OPTIONAL_LIST_KEYS):
        value = values.get(key)
        if value is None:
            continue
        if not isinstance(value, list):
            errors.append(f"{path}: frontmatter key {key!r} must be a list when provided")
            continue
        for item in value:
            if is_placeholder(item) or item in {"none", "n/a"}:
                continue
            if not METADATA_TOKEN.fullmatch(item):
                errors.append(f"{path}: invalid {key!r} token {item!r}")

    if values.get("risk_level") == "high":
        tier = values.get("orchestration_level", values.get("verification_tier"))
        if not isinstance(tier, str) or tier == "n/a" or is_placeholder(tier):
            errors.append(f"{path}: high-risk artifact requires a concrete orchestration_level")
        for key in ("risk_tags", "affected_surfaces", "invariants"):
            if not list_has_declared_metadata(values.get(key)):
                errors.append(f"{path}: high-risk artifact requires declared {key}")

    for heading in REQUIRED_HEADINGS:
        if heading not in body:
            errors.append(f"{path}: missing section heading {heading!r}")

    for pattern in SECRET_PATTERNS:
        if pattern.search(body):
            errors.append(f"{path}: matched blocked secret pattern {pattern.pattern!r}")

    return errors


def validate_document(
    path: pathlib.Path, values: dict[str, YamlValue], body: str
) -> list[str]:
    errors = validate_common_fields(path, values, body)
    schema = values.get("schema_version")
    if schema in {"orchestration-artifact/v2", "orchestration-artifact/v3"}:
        errors.extend(require_level(path, values.get("orchestration_level")))
        scope_kind = values.get("scope_kind")
        if not isinstance(scope_kind, str) or scope_kind not in ALLOWED_SCOPE_KINDS:
            errors.append(
                f"{path}: scope_kind must be one of {sorted(ALLOWED_SCOPE_KINDS)}"
            )
        if scope_kind == "foundation":
            for field in (
                "immediate_consumer",
                "public_facade",
                "bounded_acceptance",
                "non_goals",
            ):
                errors.extend(require_non_placeholder(path, values, field))
        errors.extend(validate_optional_evidence(path, values))
        if schema == "orchestration-artifact/v3":
            for field in ("stage_manifest", "stream_owner"):
                errors.extend(validate_scalar(path, field, values))
            raw_manifest = values.get("stage_manifest")
            if isinstance(raw_manifest, str):
                manifest_path = pathlib.PurePosixPath(raw_manifest)
                if manifest_path.is_absolute() or ".." in manifest_path.parts:
                    errors.append(
                        f"{path}: stage_manifest path must be repo-relative: {raw_manifest!r}"
                    )
                stage_id = values.get("stage_id")
                if isinstance(stage_id, str) and not is_placeholder(stage_id):
                    expected = f".codex/stages/{stage_id}/stage-manifest.json"
                    if raw_manifest != expected:
                        errors.append(
                            f"{path}: stage_manifest must match stage_id exactly: {expected!r}"
                        )
    elif schema != "orchestration-artifact/v1":
        errors.append(f"{path}: unsupported artifact schema: {schema}")
    return errors


def validate_file(path: pathlib.Path) -> list[str]:
    try:
        text = path.read_text()
    except OSError as exc:
        return [f"{path}: cannot read file: {exc}"]
    try:
        frontmatter, body = parse_frontmatter(text)
    except ValueError as exc:
        return [f"{path}: {exc}"]
    values = extract_frontmatter_values(frontmatter)
    errors = validate_document(path, values, body)
    stage_id = values.get("stage_id")
    schema = values.get("schema_version")
    if isinstance(stage_id, str) and not is_placeholder(stage_id):
        repo = pathlib.Path.cwd().resolve()
        manifest_path = repo / ".codex" / "stages" / stage_id / "stage-manifest.json"
        contract_path = repo / ".codex" / "orchestrator.toml"
        profile = None
        if contract_path.is_file() and not contract_path.is_symlink():
            try:
                contract = tomllib.loads(contract_path.read_text(encoding="utf-8"))
                baseline = contract.get("baseline")
                profile = baseline.get("profile") if isinstance(baseline, dict) else None
            except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
                errors.append(f"{path}: cannot read orchestration contract: {exc}")
        if profile == "balanced-v2.20" and manifest_path.is_file():
            if schema != "orchestration-artifact/v3":
                errors.append(
                    f"{path}: newly reported delegated artifacts in a v2.20 stage must use orchestration-artifact/v3"
                )
            else:
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    errors.append(f"{path}: cannot read stage manifest: {exc}")
                else:
                    entries = manifest.get("stream_artifacts") if isinstance(manifest, dict) else None
                    try:
                        resolved = path.resolve(strict=True)
                        relative = resolved.relative_to(repo).as_posix()
                    except (OSError, ValueError):
                        relative = ""
                    matching = [
                        entry
                        for entry in entries
                        if isinstance(entry, dict)
                        and entry.get("artifact_path") == relative
                    ] if isinstance(entries, list) else []
                    if len(matching) != 1:
                        errors.append(f"{path}: v3 artifact is unlisted in owning stage manifest")
                    else:
                        entry = matching[0]
                        for field in ("task_id", "stream_owner"):
                            if entry.get(field) != values.get(field):
                                errors.append(
                                    f"{path}: {field} does not match owning stage manifest aggregation"
                                )
    for pattern in SECRET_PATTERNS:
        if pattern.search(frontmatter):
            errors.append(f"{path}: matched blocked secret pattern {pattern.pattern!r}")
    return errors


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: validate_artifact.py <artifact.md> [artifact.md ...]", file=sys.stderr)
        return 2

    all_errors: list[str] = []
    for raw_path in argv[1:]:
        all_errors.extend(validate_file(pathlib.Path(raw_path)))

    if all_errors:
        for error in all_errors:
            print(error, file=sys.stderr)
        return 1

    print("artifact validation OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
