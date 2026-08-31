---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave2-4w5
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: repository maintainers configuring a development clone
public_facade: git remote upstream configuration and operations runbook
bounded_acceptance: upstream retains the Postiz fetch URL, has DISABLED as its push URL, and a reproducible setup runbook passes documentation checks.
non_goals:
  - No fetch, merge, push, force operation, or remote repository mutation.
  - No change to upstream provenance or the origin remote.
  - No production, dependency, or application-code change.
evidence:
  - none
task_id: content-factory-next-4w5
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: upstream remote safety
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-luna
reasoning_effort: medium
model_reasoning_rationale: Local Git configuration and concise reproducible documentation require a bounded implementation with exact verification.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - local repository remote configuration
  - docs/operations/runtime.md
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-4w5.md
success_criteria:
  - git remote get-url upstream returns https://github.com/gitroomhq/postiz-app.git.
  - git remote get-url --push upstream returns DISABLED.
  - The operations runbook explains clone, separate fetch and push URLs, verification, and the prohibition on sending changes upstream.
  - Documentation link validation and git diff validation pass.
selected_docs:
  - AGENTS.md
  - .codex/project-index.md
  - docs/operations/runtime.md
  - docs/operations/outbound-connections.md
selected_skills:
  - none
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: wave-2
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; no temporary files or isolated branch were created, and no external Git action was performed.
risk_level: low
verification_tier: inner_loop
risk_tags:
  - repository-safety
  - provenance
affected_surfaces:
  - repository-configuration
  - operations-docs
invariants:
  - upstream-provenance
  - no-external-write
docs_impact: operations-runbook
docs_reviewed: yes
docs_review_notes: The existing runtime runbook was the narrowest durable location; it now includes exact setup and verification commands without changing provenance.
verification:
  - 'git remote get-url upstream: passed with https://github.com/gitroomhq/postiz-app.git.'
  - 'git remote get-url --push upstream: passed with DISABLED.'
  - 'git remote -v: upstream fetch is https://github.com/gitroomhq/postiz-app.git and upstream push is DISABLED.'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm run docs:check: passed; Documentation links OK (62 files checked).'
  - 'git diff --check: passed.'
changed_files:
  - .git/config (local repository configuration; not versioned)
  - docs/operations/runtime.md
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-4w5.md
explicit_defers:
  - none
---

# Summary

The local `upstream` remote keeps the authoritative Postiz fetch URL
`https://github.com/gitroomhq/postiz-app.git`, while its push URL is exactly
`DISABLED`. This prevents an accidental send to the upstream repository without
removing its provenance or read-only history source.

`docs/operations/runtime.md` now gives a new-machine procedure for cloning the
fork, adding `upstream`, setting a separate disabled push URL, and verifying all
three remote views. It explicitly keeps upstream fetch-only and forbids changing
the push URL back to a repository URL.

# Verification

Root-confirmed remote inspection returned the exact expected values: the fetch
URL is `https://github.com/gitroomhq/postiz-app.git`, the push URL is `DISABLED`,
and `git remote -v` reports the same split configuration.

The repository documentation check passed with 62 files checked. Whitespace
validation also passed. No fetch, merge, push, or other external Git operation
was run.

# Risks / Follow-ups

Git remote configuration is local to each clone and is intentionally not stored
in repository history. The runbook is therefore the durable control for future
workstations; maintainers must apply its `git remote set-url --push upstream
DISABLED` step after cloning. There are no explicit defers.
