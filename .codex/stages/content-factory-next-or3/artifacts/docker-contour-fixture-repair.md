---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:docker-contour-fixture-repair
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: content-factory-next-or3 root Docker contour acceptance
public_facade: tests/post.content-context.test.cjs native content-context acceptance fixture
bounded_acceptance: deterministic unit fixture freshness with stale and tombstoned fail-closed coverage preserved
non_goals:
  - product validation or repository source changes
  - shared Docker runner changes or full Docker contour execution
  - assertion weakening or database-backed acceptance
evidence:
  - none
task_id: content-factory-next-or3.docker-contour-fixture-repair
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: deterministic native content-context contour fixture
milestone_status: accepted
agent_type: debugger
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: focused time-dependent test failure with an established local fixture pattern
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - tests/post.content-context.test.cjs
  - .codex/stages/content-factory-next-or3/artifacts/docker-contour-fixture-repair.md
success_criteria:
  - exact Node 22.23.2 RED exposes five unit failures caused by expired fixture dates
  - the smallest fixture-only repair restores all eleven unit subtests
  - stale and tombstoned scenarios still fail closed with CONTENT_CONTEXT_INVALIDATED
  - only the two named PostgreSQL checks may skip without their explicit environment gate
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-or3/stage-manifest.json
selected_skills:
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: docker-contour-fixture-repair
depends_on_streams:
  - none
parallel_decision: isolated delegated repair while root owns full contour acceptance
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no container, server, temporary directory, child branch, worktree, credential, or external resource was created
risk_level: low
risk_tags:
  - state-transition
affected_surfaces:
  - none
invariants:
  - test-matrix
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: fixture portability repair changes no product behavior or durable operator contract
verification:
  - 'RED: Node 22.23.2 node --test tests/post.content-context.test.cjs returned 13 total, 6 passed, 5 failed and 2 named PostgreSQL skips; all five failures originated as CONTENT_CONTEXT_INVALIDATED'
  - 'FOCUSED RED: the single normal draft test failed 1 of 1 with CONTENT_CONTEXT_INVALIDATED while fixture expiry was 5,372,601 ms behind the real clock'
  - 'GREEN: Node 22.23.2 node --test tests/post.content-context.test.cjs returned 13 total, 11 passed, 0 failed and only 2 named PostgreSQL environment-gated skips'
  - 'STALE GREEN: the focused foreign missing or tombstoned table passed 1 of 1 and includes sourceStale expecting CONTENT_CONTEXT_INVALIDATED'
  - 'STALE MUTATION: replacing the sourceStale past timestamp with future made the focused table fail 1 of 1 with Missing expected rejection; restoring past returned it to 1 of 1 passed'
  - 'WHITESPACE: scoped git diff --check passed'
  - 'ARTIFACT: scripts/orchestration/validate_artifact.py accepted this orchestration-artifact/v3 record'
changed_files:
  - tests/post.content-context.test.cjs
  - .codex/stages/content-factory-next-or3/artifacts/docker-contour-fixture-repair.md
explicit_defers:
  - root owns the required full Docker contour rerun and stage acceptance
---

# Summary

Подтверждён временной дефект только в тестовом fixture. В момент RED реальное
время было `2026-08-21T11:29:32.601Z`, а `expiresAt` и все fresh-сроки были
жёстко заданы как `2026-08-21T10:00:00.000Z`. Production validator корректно
берёт `new Date()` и отклоняет истёкший snapshot до выполнения проверяемых
сценариев.

Fixture теперь повторяет уже используемый ниже в этом файле шаблон: `now`,
`future = now + 86_400_000` и отдельный `past = now - 86_400_000`. Только поля
freshness/expiry переведены на эти значения. Stale-ветка использует `past`;
tombstone, blocked, tampered и остальные мутации и все assertions сохранены.
Production source и общий Docker runner не менялись.

# Verification

Точный RED на Node 22.23.2 дал 5 ожидаемых unit-падений, 6 проходов и 2
PostgreSQL skip из-за отсутствующего `POST_CONTENT_CONTEXT_POSTGRES_URL`.
После repair тот же запуск дал 11 проходов, 0 падений и те же 2 разрешённых
skip. Отдельный focused запуск stale/tombstoned таблицы прошёл 1/1.

Обратная мутация доказала чувствительность защиты: временная замена `past` на
`future` только в `sourceStale` дала `Missing expected rejection`; после
восстановления ветка снова прошла. Полный Docker contour намеренно не запускался.

# Delivery / Cleanup

Поток возвращён root для общей Docker-приёмки. Git commit, push и cleanup не
требуются; локальные или внешние runtime-ресурсы не создавались.

# Risks / Follow-ups / Explicit Defers

Остаточный риск ограничен общим Docker-контуром, который принадлежит root.
Продуктовая проверка freshness не ослаблена, поэтому поведение stale и
tombstoned контекста сохраняется fail-closed.
