---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:fact-memory-research
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: content-factory-next-9e9.7
public_facade: content-context-v1-and-fact-memory-contract
bounded_acceptance: fact-evidence-lifecycle-and-four-consumer-context-research
non_goals:
  - production-code
  - live-or-paid-model-calls
  - beads-closeout
evidence:
  - none
task_id: content-factory-next-9e9.fact-memory-research
epic_id: content-factory-next-9e9
stage_id: content-factory-next-9e9
session_id: content-factory-next-9e9
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: llm_architect
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-boundary-context-retrieval-tenancy-provenance-and-ai-fallback-research
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 1534b132
worktree: /tmp/cf-vme2
write_zone:
  - docs/product/content-memory-spec.md
  - .codex/stages/content-factory-next-9e9/artifacts/fact-memory-research.md
success_criteria:
  - immutable-evidence-and-mutable-fact-contract
  - deterministic-bounded-four-consumer-context-builder
  - current-required-fail-closed-without-live-model-calls
  - migration-acceptance-threat-and-eval-plan
selected_docs:
  - repository-product-design-stage-source-profile-auth-ai-and-consumer-contracts
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
  - source-registry-research
  - brand-profile-research
  - root-research-synthesis
parallel_decision: parallel
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted by root; no child process, credential, network fixture, model call, or temporary runtime resource was created.
risk_level: high
risk_tags:
  - tenancy
  - authorization
  - migration
  - state-transition
  - data
  - ai
affected_surfaces:
  - database
  - data
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - provenance
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Added the durable fact-memory and unified context-builder research specification.
verification:
  - focused-code-and-graphify-review: passed
  - pnpm-run-docs-check-84-files-node-22-23-2-pnpm-10-6-1: passed
  - artifact-validator: passed
  - scoped-git-diff-check: passed
changed_files:
  - docs/product/content-memory-spec.md
  - .codex/stages/content-factory-next-9e9/artifacts/fact-memory-research.md
explicit_defers:
  - llm-fact-extraction
  - embeddings-and-vector-search
  - per-user-or-team-acl
  - live-fetch-paid-calls-publish-and-deploy
---

# Summary

Спроектированы mutable lifecycle фактов поверх registry-owned immutable
`SourceSnapshot + SourceEvidence` и один deterministic
`ContentContextBuilderV1` для generator, editor, Copilot/Mastra agent и
AutoPost. Builder работает без сети и модели, ограничивает выбор восемью
facts/evidence, 800 символами excerpt и 12 000 символами всего блока, сохраняет
immutable selection snapshot и запрещает model call для `REQUIRE_CURRENT`, если
нет свежего принятого evidence.

Самая рискованная граница — retrieval-to-prompt: сейчас provider summary,
excerpt и URL смешиваются в свободный `researchText`, а после создания остаётся
только изменяемый `Post.researchSources`. Самое высокорычажное изменение —
единый pre-model eligibility/freshness/conflict gate плюс finalize revalidation
и typed output provenance.

# Scope / Routing

Контракт покрывает data model, freshness/TTL/trust/conflict/supersedes,
reverification, dedupe/search/citations, tombstone/purge, tenant permissions,
private sources, bounded selection, deterministic fallback, four-consumer
seams, additive migration/rollback, acceptance/eval и threat/privacy risks.

Синхронизация с соседними specs выполнена по именам `ContentSource`,
`SourceSnapshot`, `SourceEvidence`, `DraftEvidence`,
`ProjectBrandProfileVersion` и `BrandProfileContextService`. Private source в
MVP означает organization-wide read/use; UI/API не обещают user/team ACL.
Generator остаётся AgentGraph; Mastra singleton разрешает context per request;
AutoPost pin-ит profile version, сохраняет resolved snapshot на Post и меняет
Temporal контракт только через V2 workflow/activity.

# Verification

Проверены текущие `WebResearchService`, `AgentGraphService`, generator/editor,
Copilot tools/request context, AutoPost, `PostsRepository.researchSources`,
Prisma tenancy/permissions и `AiUsageService`. Graphify `0.9.45`: local/code
graph, 11 361 nodes / 21 218 edges; report от `41baba7b` stale относительно
base `1534b132`, поэтому использован только как навигация, а выводы повторно
проверены по текущему коду. Выполнены `check-update` и focused queries по
AgentGraph, WebResearch, PostsRepository и AutoPost; refresh корректно отложен
до принятой integration/release границы.

`pnpm run docs:check` под Node 22.23.2 / pnpm 10.6.1 проверил 84 файла.
Artifact validator и scoped `git diff --check`, включая новый spec через
no-index check, прошли.

# Delivery / Cleanup

Delivery: manual integration, `accepted_by_orchestrator: no`. Коммитов, Beads
мутаций, внешних/live/paid model calls, публикации и deploy не выполнялось.
Cleanup остаётся root-owned после принятия.

# Risks / Follow-ups / Explicit Defers

- **P0 / must-fix / high confidence — неподтверждённые current claims.**
  `AgentGraphService` и AutoPost продолжают после research failure, а agent
  полагается на prompt/tool choice. Fix: общий deterministic
  `REQUIRE_CURRENT -> CONTENT_EVIDENCE_REQUIRED` gate до AI admission; свежий stored
  evidence разрешает продолжение. Success: model spy = 0 во всех четырёх
  outage/stale/conflict scenarios. Tradeoff: часть запросов будет явно
  заблокирована вместо правдоподобного текста.
- **P1 / must-fix / high confidence — provenance/deletion race.**
  `Post.researchSources` не связывает output с exact evidence/profile/context.
  Fix: immutable context snapshot, transactional Post/OutputContext links и
  finalize revalidation. Success: provenance coverage новых grounded drafts
  100%, deleted/stale/foreign leakage 0. Tradeoff: дополнительные таблицы и
  retention/purge job.
- **P1 / must-fix / high confidence — citation laundering и prompt injection.**
  Provider summary сейчас выглядит так же, как excerpt. Fix: summary не evidence,
  untrusted fixed renderer, structured citation ids и server-side validation.
  Success: unknown citations rejected; adversarial excerpts не меняют tool set.
- **P1 / must-fix / high confidence — tenant/private exposure.** Fix:
  organizationId на каждом root/relation, composite lookups, same-org MVP
  visibility и public renderer без INTERNAL_ONLY URL. Success: foreign ids
  выглядят как not-found, exposure incidents = 0. Tradeoff: более узкий ACL
  честно отложен как новая auth-модель.
- **P1 / high-value improvement / high confidence — latency/cost variance.**
  Текущий research допускает до 32 000 символов и размножается по prompt nodes.
  Fix: один 12 000-character envelope, zero-network/zero-AI builder. Цель warm
  p95 <150 ms и меньшая input variance; это требует traffic validation и не
  считается production gain по одному benchmark.

Root synthesis decisions применены: shared relations —
`contentContextSnapshotId`/`brandProfileVersionId`, current-required error —
`CONTENT_EVIDENCE_REQUIRED`, context retention — срок последней draft/Post
ссылки плюс 90 дней, hard-delete citation — `SOURCE_REMOVED` без URL/excerpt.
Blocker исследования нет. LLM extraction, embeddings, per-user/team ACL, live
fetch, paid calls и публикация явно отложены.
