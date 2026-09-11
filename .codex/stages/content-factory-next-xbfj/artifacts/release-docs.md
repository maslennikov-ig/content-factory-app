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
  - 'Runbook and handoff inspected for release aaaf00afe664 with rollback cc513632d93d, Tavily/OpenRouter wording, m0iy.8 defer, transfer terminology and the 200-character related query.'
  - 'The documented Mastra fingerprint command uses a read-only canonical metadata query and sha256sum; it does not invoke prisma db push or mutate the host.'
changed_files:
  - docs/operations/production-deploy.md
  - .codex/handoff.md
  - .codex/orchestrator.toml
  - .codex/stages/content-factory-next-tu3k.15/evidence/release-2026-09-10.json
  - .codex/stages/content-factory-next-xbfj/artifacts/release-docs.md
  - .codex/stages/content-factory-next-xbfj/evidence/release-2026-09-11.json
explicit_defers:
  - Live keyless WebResearchService wiring remains in content-factory-next-m0iy.8.
  - Durable quota accounting remains in content-factory-next-m0iy.9 under or3.9.
  - Exa still requires the owner's key and benefit measurement.
---
# Summary

The handoff now names `content-factory-next-xbfj` as the active review-tail,
records `aaaf00afe664` as the release and `cc513632d93d` as its rollback, and
states that Tavily is the default with OpenRouter as the only reserve. It
records the Exa-key requirement, the offline-only keyless research modules and
the `content-factory-next-m0iy.8` live-wiring defer. Same-channel draft
movement is described as a transfer, with `[перенос | копия]` left for the
owner's final choice.

The runbook adds the intermediate 10.09 rollback record, the same provider and
keyless wording, the released 11.09 review-tail record, and a read-only Mastra
schema fingerprint command. Historical release evidence records that issue
#670 is closed while Beads local closure remains authoritative.

# Verification

The edited JSON parses, and `git diff --check` is clean for the current files.
The root release-level documentation and process checks remain part of the
single final acceptance run.

# Release addendum

The review tail was released as `aaaf00afe664` after the owner authorized the
production step. The raw PostgreSQL 17 `pg_dump` output originally listed for a
fingerprint includes a random `\\restrict` token, so the runbook now hashes a
sorted canonical metadata query instead. The resulting dedicated Mastra digest
is `310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7` with 29
tables; no schema apply was performed.

# Risks / Follow-ups

The live keyless research wiring remains deferred to `content-factory-next-m0iy.8`,
and durable quota accounting remains tied to `content-factory-next-m0iy.9` and
`or3.9`. Exa still needs the owner's key. The release and rollback were retained
by the scoped host-retention script; no other host assets were touched.
