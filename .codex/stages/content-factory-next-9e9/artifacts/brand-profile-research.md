---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:brand-profile-research
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: content-factory-next-9e9.3
public_facade: brand-profile-api-and-context-v1
bounded_acceptance: research-decisions-data-user-flow-and-four-consumer-contract
non_goals:
  - production-code
  - model-or-live-calls
  - beads-closeout
evidence:
  - none
task_id: content-factory-next-9e9.brand-profile-research
epic_id: content-factory-next-9e9
stage_id: content-factory-next-9e9
session_id: content-factory-next-9e9
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: architect_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-boundary-tenancy-versioning-ai-and-temporal-research
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 1534b132
worktree: /tmp/cf-vme2
write_zone:
  - docs/product/content-intelligence-brand-profile-spec.md
  - .codex/stages/content-factory-next-9e9/artifacts/brand-profile-research.md
success_criteria:
  - org-owned-versioned-brand-profile-contract
  - zero-model-manual-path-and-ai-admission-boundary
  - four-consumer-fallback-provenance-and-acceptance-matrix
selected_docs:
  - repository-product-design-auth-ai-and-consumer-contracts
selected_skills:
  - superpowers-using-superpowers
  - superpowers-brainstorming
  - superpowers-writing-plans
  - graphify-project
  - superpowers-verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: research-first-four-streams
depends_on_streams:
  - root-research-synthesis
parallel_decision: parallel
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted by root; no child branch, process, credential, model call, network fixture, or temporary runtime resource remains.
risk_level: high
risk_tags:
  - tenancy
  - authorization
  - migration
  - state-transition
  - rollback
  - ui
  - api
affected_surfaces:
  - database
  - data
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Added the durable profile and brand-voice research specification.
verification:
  - focused-local-and-graphify-queries: passed
  - pnpm-run-docs-check-84-files: passed
  - artifact-validator: passed
  - scoped-git-diff-check: passed
changed_files:
  - docs/product/content-intelligence-brand-profile-spec.md
  - .codex/stages/content-factory-next-9e9/artifacts/brand-profile-research.md
explicit_defers:
  - none
---

# Summary

Спроектирован один organization-owned, versioned паспорт проекта и голос
бренда. ADMIN/SUPERADMIN создают и активируют версии, участники читают и
применяют published snapshots. Active immutable, редактирование создаёт draft,
AutoPost pin-ит конкретную версию, а no-profile имеет видимый neutral fallback.

Ручной путь полностью zero-model. Будущий AI-assist допускается только как
отдельная операция через существующие `included/workspace_key` admission rules,
без скрытого fallback и автоматической activation.

# Scope / Routing

Анализ охватил permission/tenancy, Prisma ownership, generator, editor, agent,
AutoPost, Temporal и AI admission. Записаны field/version model, user flow,
platform override precedence, audit, migration/rollback, acceptance matrix и
поэтапная implementation map. Source/fact ownership оставлен соседним streams;
точный общий provenance schema принимает root synthesis.

Lazyweb evidence принят от root и добавлен как product evidence, не как
визуальный шаблон: Writer sample analysis, Jasper workspace voice/knowledge и
source registry ownership/status patterns.

# Verification

Проведены focused local reads/queries текущих auth, data, consumers, AI и
Temporal contracts. Graphify: version `0.9.45`, `check-update` и четыре focused
queries; report stale относительно research HEAD, refresh закономерно оставлен
до принятой integration/release границы.

`pnpm run docs:check` проверил 84 файла. Artifact validator и scoped
`git diff --check`, включая новый untracked spec через no-index check, прошли.

# Delivery / Cleanup

Delivery: manual integration, `accepted_by_orchestrator: yes`. Коммитов, Beads
мутаций, внешних/model/live вызовов и cleanup не выполнялось.

# Risks / Follow-ups / Explicit Defers

Материальных owner-choice blockers нет: root принял safe defaults. До кода root
должен синтезировать общий provenance с source/fact specs. Самая рискованная
реализационная граница — новый versioned, draft-only AutoPost workflow/activity;
существующий публикационный workflow не изменяется.

Остаточно проверить на реализации: exact Prisma migration/guard, tenant и
concurrency tests, failure-before-admission, browser RU/EN/light/dark/responsive
matrix, Temporal pause/recovery и stage-level integration acceptance.
