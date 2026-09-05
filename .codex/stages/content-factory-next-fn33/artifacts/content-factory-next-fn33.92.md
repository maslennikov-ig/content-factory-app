---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Переключатель областей в шапке и форма первого выбора
public_facade: n/a
bounded_acceptance: Русская локаль зовёт рабочее пространство областью везде, где речь о нём.
non_goals:
  - Английская локаль и внутренние идентификаторы (organization остаётся ключом и полем схемы)
evidence:
  - org-selector-wording
task_id: content-factory-next-fn33.92
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: cleanup-wave-2026-09-05
milestone: Русский интерфейс без английских островов, одно слово для одной вещи
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Пять связанных правок интерфейса и локалей в одной зоне записи.
repo: content-factory-next
branch: worktree-agent-a873682584cb78cbd
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a873682584cb78cbd
write_zone:
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
success_criteria:
  - Экранный диктор произносит «Область: <название>»
  - Форма первого выбора подписана «Выберите область»
  - В русской локали не осталось «организации» там, где речь о рабочем пространстве
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-L1
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Правки остаются на ветке потока, временные файлы — в scratchpad.
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Изменены только подписи интерфейса и значения локалей; договорённостей в docs это не трогает.
verification:
  - `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs`: passed
  - `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`: passed
  - `bash scripts/orchestration/run_process_verification.sh`: passed
  - `pnpm exec jest tests/organization.selector.test.cjs tests/settings-tab-address.test.cjs`: passed
changed_files:
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
explicit_defers:
  - none
---

# Summary

Продукт зовёт рабочее пространство областью, а переключатель в шапке произносил
«Организация». Правка только в русской локали: `organization`,
`select_organization`, `label_select_organization`, а также три места, где то же
самое было сказано словом «организация» — `shortlink_preference_admin_only`,
`product_events_activation_body`, `public_saas_tenant_isolation_body`.

Ключи и поля схемы остались `organization`: это внутренние имена, совместимость
с апстримом.

# Scope / Routing

Тронута одна локаль. Компонент `layout/organization.selector.tsx` менять не
понадобилось — он и так читает эти ключи.

# Verification

См. `verification`.

# Delivery / Cleanup

Возвращено корню.

# Risks / Follow-ups / Explicit Defers

`label_select_organization` в коде не используется — исправлен заодно, чтобы
следующий, кто его возьмёт, не занёс обратно старое слово.
