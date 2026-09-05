---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-G
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave «решения владельца 05.09.2026»
public_facade: n/a
bounded_acceptance: n/a — заблокировано зоной записи
non_goals:
  - brand-voice/** и content-facts* исключены из зоны записи потока
evidence:
  - none
task_id: content-factory-next-fn33.90.7
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: роль видна на экране до нажатия, а не после отказа
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: многофайловая правка интерфейса под ролью с тестами
repo: content-factory-next
branch: worktree-agent-a009cdcabe65ea0aa
base_branch: wave/owner-decisions-2026-09-05
base_commit: 9ea83528f5ba3836450951ca18b5e0abb64e003f
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a009cdcabe65ea0aa
write_zone:
  - apps/frontend/src/components/**
  - tests/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/product/roles-matrix.md
  - .codex/stages/content-factory-next-fn33/**
success_criteria:
  - не выполнено: правка требует чужого файла
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-owner-decisions-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: blocked
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - authorization
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: n/a
docs_reviewed: n/a
docs_review_notes: изменений не вносилось
verification:
  - none: правка не начиналась
changed_files:
  - none
explicit_defers:
  - content-factory-next-fn33.90.7 — нужен доступ к apps/frontend/src/components/brand-voice/voice-brief.container.tsx
---

# Summary

Не сделано: обе кнопки живут вне зоны записи потока.

«Проверить бриф» — `voice-brief.container.tsx:153` (`BRIEF_ROUTES.evaluate`),
«Добавить факт» / «Сохранить факт» — там же, строки 265 и 516. Файл лежит в
`apps/frontend/src/components/brand-voice/`, а эта папка исключена из зоны
записи потока stream-G.

Готовое для того, кто возьмёт: `writeRightFromRole(role)` в
`content-write-right.tsx` уже отдаёт `{ allowed: false, refusal: 'role' }`
Пользователю, и вкладке «Бриф» достаточно взять его начальным значением так же,
как это сделано в `content-archive.container.tsx`.

# Scope / Routing

Зона записи: `apps/frontend/src/components/**` кроме `brand-voice/**`,
`copilot/**`, `content-intelligence/content-search*` и
`content-intelligence/content-facts*`; `tests/**`; локали; матрица ролей;
артефакты и манифест. Бэкенд не трогался. Единственный источник права на
клиенте — `isOrganizationEditor` / `isOrganizationAdmin` из
`libraries/nestjs-libraries/src/user/organization.roles.ts`; второго мнения о
том, кто такой редактор, поток не заводил.

# Verification

Команды перечислены в поле `verification` выше. Каждый новый набор до правки
был красным, после — зелёным.

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a009cdcabe65ea0aa`. Слияние и закрытие beads — за корнем.

# Risks / Follow-ups / Explicit Defers

Смотри поле `explicit_defers`.
