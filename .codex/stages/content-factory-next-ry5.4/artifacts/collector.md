---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ry5.4/stage-manifest.json
stream_owner: errors_collector_worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: operator preparing the self-hosted error collector
public_facade: deploy/error-collector/compose.yaml and docs/operations/error-collection.md
bounded_acceptance: a locally valid isolated GlitchTip 6.2.6 all-in-one stack with private PostgreSQL 18, 30-day event/file retention, placeholders, and no product-compose dependency
non_goals:
  - Starting, pulling, deploying, or connecting to GlitchTip or PostgreSQL.
  - DNS, TLS, SMTP, notifications, backups, DSN creation, or secret wiring.
  - Product compose, SDK, package, Beads, root-stage, server, production, push, merge, or commit changes.
evidence:
  - official-glitchtip-compose-sample
  - official-glitchtip-install-and-retention-documentation
  - focused-red-green-compose-contract
  - local-compose-config-validation
task_id: content-factory-next-ry5.4.collector
epic_id: content-factory-next-ry5.4
stage_id: content-factory-next-ry5.4
session_id: n/a
milestone: isolated self-hosted error collector deployment contract
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: inherited
model_reasoning_rationale: Root assigned one bounded infrastructure and operations stream with versioned settings and a reversible deployment contract.
repo: content-factory-next
branch: work/own-error-collection
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-own-error-collection
write_zone:
  - deploy/error-collector/**
  - docs/operations/error-collection.md
  - docs/operations/configuration.md
  - docs/README.md
  - tests/error-collector.compose.test.cjs
  - .codex/stages/content-factory-next-ry5.4/artifacts/collector.md
success_criteria:
  - Compose resolves locally with exactly GlitchTip 6.2.6 and PostgreSQL 18.
  - PostgreSQL has a durable volume, no published port, and no product database dependency.
  - GlitchTip uses all-in-one without Valkey, logs, uptime, MCP, or DuckDB/cold storage.
  - Events, the PostgreSQL hot window, and files all retain exactly 30 days.
  - Both services have restart and resource ceilings; the collector binds only to host loopback.
  - The env template contains only placeholders and no DSN, actual domain, or secret.
  - The runbook explains validation, isolation, owner authority, and manual verification.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-ry5.4/plan.md
  - .codex/stages/content-factory-next-ry5.4/design-evidence.md
  - https://glitchtip.com/assets/compose.sample.yml
  - https://glitchtip.com/documentation/install/
selected_skills:
  - superpowers:test-driven-development
  - orchestrator-stage contract supplied by root
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: error-collection-sdk-and-deployment
depends_on_streams:
  - none
parallel_decision: parallel with disjoint SDK and collector deployment write zones
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: No container, image pull, database, server, network service, child branch, or external resource was created; only an ignored node_modules link to the repository's existing installation remains for root verification.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - privacy
  - secrets
  - resource-isolation
  - versioned-compose
  - operations
affected_surfaces:
  - observability-compose
  - error-collector-environment-template
  - operations-runbook
invariants:
  - product-startup-independent
  - private-collector-database
  - placeholder-only-secrets
  - no-live-action
  - thirty-day-retention
docs_impact: operations-runbook
docs_reviewed: yes
docs_review_notes: Added the repository-ready collector runbook, linked it from the documentation index, and changed configuration wording from planned collector to the shipped separate stack.
verification:
  - 'Environment correction: the worktree had no node_modules; an ignored link to the repository existing installation let the exact pnpm command execute. Node was 22.23.2 and TMPDIR was /tmp on ext4.'
  - 'RED: TMPDIR=/tmp pnpm exec jest tests/error-collector.compose.test.cjs --runInBand --coverage=false: failed, 1 suite and 6/6 tests, because compose.yaml, env.example, and the runbook did not exist.'
  - 'GREEN: the same exact Jest command passed, 1 suite and 6/6 tests.'
  - 'docker compose --env-file deploy/error-collector/env.example -f deploy/error-collector/compose.yaml config --quiet: passed without pulling or starting anything.'
  - 'pnpm run docs:check: passed, Documentation links OK (67 files checked).'
  - 'Focused Prettier write/check for the new compose, runbook, and contract test: passed.'
  - 'Owned-path whitespace and Git scope checks: passed; product compose, outbound-connections, package files, Beads, and root-stage files were not changed by this stream.'
  - 'Root acceptance: repeated the focused Jest suite (6/6), Compose config validation, artifact validation, and source review; accepted for final integrated security review.'
changed_files:
  - deploy/error-collector/compose.yaml
  - deploy/error-collector/env.example
  - docs/operations/error-collection.md
  - docs/operations/configuration.md
  - docs/README.md
  - tests/error-collector.compose.test.cjs
  - .codex/stages/content-factory-next-ry5.4/artifacts/collector.md
explicit_defers:
  - Live host, DNS/TLS, SMTP/notifications, volume backup/recovery proof, first admin/project/DSN creation, and secret wiring require separate operator decisions and authority before deployment.
---

# Summary

The repository now has a separately deployable error-collector stack. It pins
GlitchTip 6.2.6 in official `all_in_one` mode and PostgreSQL 18. The database
has no host port and lives only on an internal network with its own persistent
volume. GlitchTip binds to `127.0.0.1` for a same-host reverse proxy. Neither
service, network, volume, nor health dependency is added to the application
compose.

The low-memory profile follows the official sample: Valkey is empty so
PostgreSQL backs tasks and cache; logs, uptime, MCP, and DuckDB are off.
GlitchTip has a 512 MB / 1 CPU ceiling and PostgreSQL a 384 MB / 1 CPU ceiling.
Both restart unless stopped. Error retention, its hot PostgreSQL window, the
master retention, and file retention are all exactly 30 days; no cold-storage
setting is present.

The env template contains only reserved `.invalid` identities and
`replace-with-generated-secret` placeholders. It contains no DSN or actual
deployment address. The runbook describes local config-only validation,
bootstrap after separate authority, isolation, privacy expectations, and a
manual failure test without implying that anything is deployed now.

# Reference comparison

The implementation was compared directly with GlitchTip's current official
compose sample and install/configuration documentation on 2026-08-18. The
sample uses `postgres:18`, `/var/lib/postgresql`, `SERVER_ROLE=all_in_one`, and
documents blank `VALKEY_URL` plus the three optional-feature switches for a
256–512 MB deployment. The installation documentation confirms PostgreSQL
14+, all four retention variables, optional Valkey, and explicit MCP/DuckDB
switches. The repository pins the already verified 6.2.6 image rather than the
sample's floating major tag.

# Verification

The focused contract was first run with all deployment files absent: all six
tests failed for the missing stack/runbook. After the minimal implementation,
the exact focused suite passed 6/6 on Node 22.23.2 with `TMPDIR=/tmp`.
Compose's JSON output serializes `mem_limit` as a numeric string in Docker
Compose v5; the test normalizes that documented representation before checking
the positive ceiling. The config-only Docker command, docs link checker,
focused formatting check, and whitespace checks all passed.

No image was pulled, no container was started, and no host, database, DSN,
secret, or production resource was contacted.

# Manual verification

After an operator separately authorizes and performs deployment, verify that
PostgreSQL has no listening host port, GlitchTip listens only on loopback, and
the HTTPS reverse proxy is the sole ingress. Create the first owner and project
before public access. Send one synthetic minimized error from a test
environment and inspect that it contains no request, user, cookie, header,
model text, or breadcrumb fields. Stop GlitchTip and confirm the product
request still succeeds. Test 30-day cleanup only with artificial data.

# Risks / Follow-ups

Compose validation proves supported shape and interpolation, not image startup
or migration behavior. Those require pulling and running containers and were
forbidden here. A real deployment also needs a volume backup/recovery proof,
TLS/domain ownership, first-admin/project setup, secret delivery, and a choice
about SMTP/notifications. The shipped default intentionally sends no email.
These are named operator actions, not hidden dependencies of the product.

# Delivery / cleanup

Root accepted the stream after repeating its focused test, Compose validation,
artifact validation, and source review. Changes remain uncommitted in the shared
task worktree pending integrated review. No product compose, outbound-connections ledger,
package file, Beads state, root handoff/manifest, server, database, external
service, commit, or remote was changed by this stream.
