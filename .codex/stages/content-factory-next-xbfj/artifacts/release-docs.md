---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-xbfj/stage-manifest.json
stream_owner: root-release-docs
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-xbfj.3
stage_id: content-factory-next-xbfj
repo: content-factory-next
branch: codex/review-tail-2026-09-11
base_branch: main
base_commit: f20b0f32
worktree: /home/me/code/content-factory-next-review-tail
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Documentation and evidence were updated in the root integration worktree; no host or release resource was touched.
risk_level: medium
risk_tags:
  - release-isolation
  - schema-fingerprint
  - documentation
affected_surfaces:
  - runbook
  - handoff
  - release-evidence
invariants:
  - production-boundary-explicit
  - rollback-cc513632d93d
  - read-only-mastra-proof
verification:
  - 'Release evidence JSON remains valid and records issue #670 closed with Beads local close authoritative.'
  - 'Runbook and handoff inspected for rollback 4fdac6f1435a, Tavily/OpenRouter wording, m0iy.8 defer, transfer terminology and the 200-character related query.'
  - 'The documented Mastra fingerprint command uses a read-only pg_dump and sha256sum; it does not invoke prisma db push or mutate the host.'
changed_files:
  - docs/operations/production-deploy.md
  - .codex/handoff.md
  - .codex/orchestrator.toml
  - .codex/stages/content-factory-next-tu3k.15/evidence/release-2026-09-10.json
  - .codex/stages/content-factory-next-xbfj/artifacts/release-docs.md
explicit_defers:
  - No release image, public tree, remote push, host switch or production database action is part of this local review-tail artifact.
  - The owner must choose the production action after local acceptance.
---
# Summary

The handoff now names `content-factory-next-xbfj` as the active review-tail,
keeps `cc513632d93d` and `4fdac6f1435a` as the release and rollback boundary,
and states that Tavily is the default with OpenRouter as the only reserve. It
records the Exa-key requirement, the offline-only keyless research modules and
the `content-factory-next-m0iy.8` live-wiring defer. Same-channel draft
movement is described as a transfer, with `[перенос | копия]` left for the
owner's final choice.

The runbook adds the intermediate 10.09 rollback record, the same provider and
keyless wording, a read-only Mastra schema fingerprint command, and the review
tail's local-only boundary. Historical release evidence now records that issue
#670 is closed while Beads local closure remains authoritative.

# Verification

The edited JSON parses, and `git diff --check` is clean for the current files.
The root release-level documentation and process checks remain part of the
single final acceptance run.

# Risks / Follow-ups

Documentation describes facts already present in the repository and does not
authorize a release. If the owner chooses a production action, the normal
runbook gates and a fresh receipt for the resulting commit are required.
