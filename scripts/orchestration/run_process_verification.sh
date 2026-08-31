#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

STAGE_ID=""
ARTIFACTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE_ID="${2:-}"
      shift 2
      ;;
    --artifact)
      ARTIFACTS+=("${2:-}")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--stage <stage-id>] [--artifact <path>]..." >&2
      exit 2
      ;;
  esac
done

python3 - <<'PY'
import pathlib
import re
import tomllib

EXPECTED_PROFILE = "balanced-v2.20"
COMPATIBLE_LEGACY_PROFILES = {"balanced-v2.17", "balanced-v2.18", "balanced-v2.19"}
EXPECTED_SOURCE_SKILL = "orchestration-setup"

orchestrator_path = pathlib.Path(".codex/orchestrator.toml")
contract = tomllib.loads(orchestrator_path.read_text())
handoff_file = pathlib.Path(contract.get("handoff_file", ".codex/handoff.md"))
project_index_file = pathlib.Path(contract.get("project_index_file", ".codex/project-index.md"))
artifact_template = pathlib.Path(contract.get("artifact_template", ".codex/stage-artifact-template.md"))

required = [
    pathlib.Path("AGENTS.md"),
    orchestrator_path,
    handoff_file,
    project_index_file,
    artifact_template,
    pathlib.Path(".codex/subagent-task-contract.md"),
    pathlib.Path(".codex/subagent-spawn-template.md"),
    pathlib.Path("scripts/orchestration/run_stage_closeout.py"),
    pathlib.Path("scripts/orchestration/run_bounded_node_tests.py"),
    pathlib.Path("scripts/orchestration/record_stage_telemetry.py"),
    pathlib.Path("scripts/orchestration/cleanup_stage_workspace.py"),
    pathlib.Path("scripts/orchestration/report_child_completion.py"),
    pathlib.Path("scripts/orchestration/review_completion_inbox.py"),
]

workspace = contract.get("workspace", {})
delegation = contract.get("delegation", {})
launcher = "codex_subagents"
if isinstance(delegation, dict) and isinstance(delegation.get("launcher"), str):
    launcher = delegation["launcher"]
elif isinstance(workspace, dict) and workspace.get("launch_mode") == "manual_user_launch":
    launcher = "manual_user_launch"

if launcher not in {"codex_subagents", "manual_user_launch", "none"}:
    raise SystemExit(
        "delegation.launcher must be one of codex_subagents, manual_user_launch, or none"
    )

if launcher == "none":
    delegated_names = {
        "report_child_completion.py",
        "review_completion_inbox.py",
    }
    required = [path for path in required if path.name not in delegated_names]

expected_delegation = {
    "subagents_preauthorized_for_medium_complex": True,
    "root_execution_scope": "simple_quick_only",
    "medium_execution_default": "delegated_worker",
    "complex_execution_default": "delegated_streams",
    "simple_checks_owner": "orchestrator",
    "delegation_gate": "medium_complex_required",
    "delegation_unavailable_action": "block_medium_complex",
    "independence_alone_sufficient": False,
    "parallel_decomposition_matrix": "required_for_complex_candidates",
    "parallel_execution_default": "spawn_eligible_streams",
}
actual_delegation = {key: delegation.get(key) for key in expected_delegation}
if actual_delegation != expected_delegation:
    raise SystemExit(f"delegation execution policy is stale: {actual_delegation!r}")
if "subagents_preauthorized_for_complex" in delegation:
    raise SystemExit(
        "delegation.subagents_preauthorized_for_complex is stale; use medium/complex authorization"
    )
if "requires_explicit_user_spawn_request" in delegation:
    raise SystemExit(
        "delegation.requires_explicit_user_spawn_request is stale; medium/complex delegation is required"
    )

if launcher == "codex_subagents":
    visibility = delegation.get("subagent_visibility")
    if visibility != "separate_spawned_threads":
        raise SystemExit(
            "delegation.subagent_visibility must be 'separate_spawned_threads' for codex_subagents"
        )
    if delegation.get("inline_subagents_allowed") is not False:
        raise SystemExit(
            "delegation.inline_subagents_allowed must be false for codex_subagents"
        )
    if delegation.get("sequential_requires_reason") is not True:
        raise SystemExit(
            "delegation.sequential_requires_reason must be true"
        )
    if delegation.get("max_concurrent_subagents") != 4:
        raise SystemExit("delegation.max_concurrent_subagents must be 4")
    if delegation.get("max_parallel_write_streams") != 3:
        raise SystemExit("delegation.max_parallel_write_streams must be 3")
    if delegation.get("critical_path_priority") is not True:
        raise SystemExit("delegation.critical_path_priority must be true")

if launcher == "manual_user_launch":
    manual_prompt_template = pathlib.Path(
        contract.get("manual_prompt_template", ".codex/manual-agent-prompt-template.md")
    )
    required.append(manual_prompt_template)

model_policy = contract.get("subagent_model_policy")
if launcher == "codex_subagents":
    if not isinstance(model_policy, dict):
        raise SystemExit("Missing [subagent_model_policy] section for codex_subagents")
    required_model_policy = {
        "default_model": "inherit_orchestrator",
        "default_reasoning_effort": "inherit_orchestrator",
        "reasoning_policy": "complexity_based",
        "model_override_requires_current_user_authorization": True,
        "record_model_reasoning_rationale": True,
    }
    for key, expected in required_model_policy.items():
        if model_policy.get(key) != expected:
            raise SystemExit(f"subagent_model_policy.{key} must be {expected!r}")
    triggers = model_policy.get("high_reasoning_triggers")
    if not isinstance(triggers, list) or not triggers:
        raise SystemExit("subagent_model_policy.high_reasoning_triggers must be a non-empty list")

missing = [str(path) for path in required if not path.exists()]
if missing:
    raise SystemExit(f"Missing required orchestration files: {', '.join(missing)}")

baseline = contract.get("baseline")
if not isinstance(baseline, dict):
    raise SystemExit("Missing [baseline] section in .codex/orchestrator.toml")

profile = baseline.get("profile")
source_skill = baseline.get("source_skill")
if not profile or not source_skill:
    raise SystemExit("Baseline metadata must define profile and source_skill")

if profile not in {EXPECTED_PROFILE, *COMPATIBLE_LEGACY_PROFILES} or source_skill != EXPECTED_SOURCE_SKILL:
    raise SystemExit(
        f"Expected baseline {EXPECTED_PROFILE} via {EXPECTED_SOURCE_SKILL}, got {profile} via {source_skill}"
    )

if contract.get("role") != "orchestrator-stage":
    raise SystemExit("orchestrator role must be 'orchestrator-stage'")

stage_limits = contract.get("stage_limits")
if not isinstance(stage_limits, dict):
    raise SystemExit("Missing [stage_limits] section")
if stage_limits.get("epic_scope") != "roadmap_only":
    raise SystemExit("stage_limits.epic_scope must be 'roadmap_only'")
expected_stage_unit = (
    "cohesive_vertical_slice" if profile == EXPECTED_PROFILE else "accepted_integration_slice"
)
if stage_limits.get("stage_unit") != expected_stage_unit:
    raise SystemExit(f"stage_limits.stage_unit must be {expected_stage_unit!r}")
if stage_limits.get("automatic_advance_after_acceptance") is not True:
    raise SystemExit("stage_limits.automatic_advance_after_acceptance must be true")
if stage_limits.get("replan_on_material_boundary") is not True:
    raise SystemExit("stage_limits.replan_on_material_boundary must be true")
if stage_limits.get("cost_anomaly_action") != "replan_not_stop":
    raise SystemExit("stage_limits.cost_anomaly_action must be 'replan_not_stop'")
if stage_limits.get("hard_stop_on_time_or_token_budget") is not False:
    raise SystemExit("stage_limits.hard_stop_on_time_or_token_budget must be false")
if stage_limits.get("continuation_lineage") != "selected_beads_goal":
    raise SystemExit("stage_limits.continuation_lineage must be 'selected_beads_goal'")
max_correction_loops = stage_limits.get("max_correction_loops")
if isinstance(max_correction_loops, bool) or not isinstance(max_correction_loops, int) or max_correction_loops < 0:
    raise SystemExit("stage_limits.max_correction_loops must be a non-negative non-bool integer")
if stage_limits.get("p0_p1_block_acceptance") is not True:
    raise SystemExit("stage_limits.p0_p1_block_acceptance must be true")

if profile == EXPECTED_PROFILE:
    v220_required = [
        pathlib.Path(".codex/stage-manifest-template.json"),
        pathlib.Path(".codex/scope-preservation-ledger-template.json"),
        pathlib.Path(".codex/scope-criterion-snapshot-template.json"),
        pathlib.Path("scripts/orchestration/lint_stage_sizing.py"),
    ]
    missing_v220 = [str(path) for path in v220_required if not path.exists()]
    if missing_v220:
        raise SystemExit(f"Missing required v2.20 sizing files: {', '.join(missing_v220)}")
    stage_sizing = contract.get("stage_sizing")
    if not isinstance(stage_sizing, dict):
        raise SystemExit("v2.20 requires [stage_sizing]")
    expected_sizing = {
        "mode": "cohesive_vertical_slice",
        "manifest_schema": "orchestration-stage/v1",
        "ledger_schema": "scope-preservation-ledger/v1",
        "scope_anchor_schema": "scope-criterion-snapshot/v1",
        "one_active_implementation_stage": True,
        "parallel_streams_inside_stage": True,
        "scope_preservation_ledger_required_on_replan": True,
        "accepted_history_immutable": True,
        "migration_scope": "future_work_only",
    }
    actual_sizing = {key: stage_sizing.get(key) for key in expected_sizing}
    if actual_sizing != expected_sizing:
        raise SystemExit(f"stage_sizing contract is stale: {actual_sizing!r}")
    expected_merge_axes = [
        "acceptance_owner",
        "subsystem",
        "risk_model",
        "test_environment",
        "rollback_boundary",
        "acceptance_proof",
    ]
    if stage_sizing.get("merge_adjacent_when_shared") != expected_merge_axes:
        raise SystemExit("stage_sizing.merge_adjacent_when_shared is stale")
    expected_split_reasons = [
        "unresolved_public_ownership_or_public_contract",
        "hard_dependency",
        "independent_rollback_or_migration_boundary",
        "distinct_security_or_compliance_risk",
        "external_authorization",
    ]
    if stage_sizing.get("allowed_split_reasons") != expected_split_reasons:
        raise SystemExit("stage_sizing.allowed_split_reasons is stale")

knowledge_graph = contract.get("knowledge_graph")
if not isinstance(knowledge_graph, dict):
    raise SystemExit("Missing [knowledge_graph] section")
if knowledge_graph.get("query_first") is not True:
    raise SystemExit("knowledge_graph.query_first must be true")
if knowledge_graph.get("freshness_check_required") is not True:
    raise SystemExit("knowledge_graph.freshness_check_required must be true")
if knowledge_graph.get("refresh_policy") != "accepted_relevant_integration_or_release_boundary":
    raise SystemExit(
        "knowledge_graph.refresh_policy must be 'accepted_relevant_integration_or_release_boundary'"
    )

verification_policy = contract.get("verification_policy")
if not isinstance(verification_policy, dict):
    raise SystemExit("Missing [verification_policy] section")
if profile == EXPECTED_PROFILE:
    if verification_policy.get("mode") != "explicit":
        raise SystemExit("v2.20 requires verification_policy.mode = 'explicit'")
    levels = contract.get("orchestration_levels")
    if not isinstance(levels, dict) or levels.get("default") != "slice_acceptance":
        raise SystemExit("v2.20 requires orchestration_levels.default = 'slice_acceptance'")
    if verification_policy.get("default_level") != "slice_acceptance":
        raise SystemExit("v2.20 requires verification_policy.default_level = 'slice_acceptance'")
    removed_selectors = (
        "default_tier",
        "level_groups",
        "tier_groups",
        "risk_tag_groups",
        "surface_groups",
        "e2e_triggers",
    )
    present = [key for key in removed_selectors if key in verification_policy]
    if present:
        raise SystemExit(
            "v2.20 explicit verification forbids selector fields: " + ", ".join(present)
        )
else:
    if verification_policy.get("mode") != "risk_adaptive":
        raise SystemExit("legacy verification_policy.mode must be 'risk_adaptive'")
    if verification_policy.get("default_tier") != "integration":
        raise SystemExit("legacy verification_policy.default_tier must be 'integration'")
    required_policy_tables = ("tier_groups", "risk_tag_groups", "surface_groups")
    for key in required_policy_tables:
        if not isinstance(verification_policy.get(key), dict):
            raise SystemExit(f"verification_policy.{key} must be a table")

completion_inbox = contract.get("completion_inbox")
if launcher != "none":
    if not isinstance(completion_inbox, dict):
        raise SystemExit("Missing [completion_inbox] section in .codex/orchestrator.toml")
    for key in ("scope", "events_file", "review_state_file", "report_entrypoint", "review_entrypoint"):
        if not completion_inbox.get(key):
            raise SystemExit(f"completion_inbox.{key} is required")

for blocked in (pathlib.Path("tasks.json"), pathlib.Path(".codex/tasks.json")):
    if blocked.exists():
        raise SystemExit(f"Duplicate task ledger is not allowed: {blocked}")

handoff_text = handoff_file.read_text()
handoff_lines = len(handoff_text.splitlines())
handoff = contract.get("handoff", {})
current_state_max_lines = handoff.get("current_state_max_lines", 200)
hard_limit_lines = handoff.get("hard_limit_lines", 500)
if type(hard_limit_lines) is not int or not 1 <= hard_limit_lines <= 500:
    raise SystemExit("handoff.hard_limit_lines must be a non-bool integer from 1 to 500")
if type(current_state_max_lines) is not int or not 1 <= current_state_max_lines <= hard_limit_lines:
    raise SystemExit(
        "handoff.current_state_max_lines must be a non-bool integer from 1 through "
        f"the configured hard ceiling {hard_limit_lines}"
    )
if handoff_lines > current_state_max_lines:
    raise SystemExit(
        f"{handoff_file} has {handoff_lines} lines, exceeds configured current-state "
        f"limit {current_state_max_lines}; compact it or explicitly raise "
        "handoff.current_state_max_lines up to 500"
    )

agents = contract.get("agents", {})
agents_max_lines = None
if isinstance(agents, dict):
    agents_max_lines = agents.get("root_max_lines") or agents.get("hard_limit_lines")
if isinstance(agents_max_lines, int):
    agents_path = pathlib.Path("AGENTS.md")
    agents_lines = len(agents_path.read_text().splitlines())
    if agents_lines > agents_max_lines:
        raise SystemExit(
            f"{agents_path} has {agents_lines} lines, exceeds configured limit {agents_max_lines}"
        )

required_handoff_tokens = [
    "## Next recommended",
    "Next stage id:",
    "Recommended action:",
    "## Starter prompt for next orchestrator",
    "Use $orchestrator-stage",
    "## Explicit defers",
]
missing_handoff_tokens = [token for token in required_handoff_tokens if token not in handoff_text]
if missing_handoff_tokens:
    raise SystemExit(
        f"{handoff_file} is missing required next-stage handoff fields: {', '.join(missing_handoff_tokens)}"
    )

explicit_defers_match = re.search(
    r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
    handoff_text,
    re.MULTILINE | re.DOTALL,
)
if not explicit_defers_match:
    raise SystemExit(f"{handoff_file} is missing the Explicit defers section")

explicit_defers_body = explicit_defers_match.group("body").strip()
if not explicit_defers_body:
    raise SystemExit(f"{handoff_file} has an empty Explicit defers section")

project_index_text = project_index_file.read_text()
project_index = contract.get("project_index", {})
project_index_max_lines = 150
required_project_index_sections = [
    "## Runtime Shape",
    "## Primary Entrypoints",
    "## Core Subsystems",
    "## Integrations And Sources Of Truth",
    "## Verification",
    "## Conventions And Boundaries",
]
if isinstance(project_index, dict):
    if isinstance(project_index.get("max_lines"), int):
        project_index_max_lines = project_index["max_lines"]
    if isinstance(project_index.get("required_sections"), list):
        required_project_index_sections = [
            str(section)
            for section in project_index["required_sections"]
            if isinstance(section, str)
        ]

project_index_lines = len(project_index_text.splitlines())
if project_index_lines > project_index_max_lines:
    raise SystemExit(
        f"{project_index_file} has {project_index_lines} lines, exceeds configured limit {project_index_max_lines}"
    )

missing_project_index_sections = [
    section for section in required_project_index_sections if section not in project_index_text
]
if missing_project_index_sections:
    raise SystemExit(
        f"{project_index_file} is missing required sections: {', '.join(missing_project_index_sections)}"
    )

for forbidden in ("## Current truth", "## Next recommended", "## Explicit defers"):
    if forbidden in project_index_text:
        raise SystemExit(
            f"{project_index_file} must stay navigation-only and not duplicate handoff section {forbidden!r}"
        )

print(f"orchestration contract OK ({profile} via {source_skill})")
PY

git diff --check
echo "git diff --check OK"

echo "git status --short"
git status --short || true

if [[ ${#ARTIFACTS[@]} -gt 0 ]]; then
  python3 scripts/orchestration/validate_artifact.py "${ARTIFACTS[@]}"
fi

# Release acceptance runs this script through `verification.release_commands`,
# which are literal strings with no place to interpolate a stage id. Every
# release therefore called it bare, and `check_stage_ready.py` never ran inside
# the one acceptance that is supposed to be the strictest. The contract already
# names the stage under way, so an omitted `--stage` now means "the current
# one" instead of "skip the check".
if [[ -z "$STAGE_ID" ]]; then
  STAGE_ID=$(python3 - <<'PY'
import pathlib
import tomllib

contract = tomllib.loads(pathlib.Path(".codex/orchestrator.toml").read_text())
print(contract.get("workspace", {}).get("current_stage_id", ""))
PY
)
  if [[ -n "$STAGE_ID" ]]; then
    echo "stage readiness: $STAGE_ID (from orchestrator.toml)"
  fi
fi

if [[ -n "$STAGE_ID" ]]; then
  python3 scripts/orchestration/check_stage_ready.py "$STAGE_ID"
fi

echo "process verification OK"
