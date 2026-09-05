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
  - brand-voice/** исключена из зоны записи потока
  - бэкенд не трогается
evidence:
  - none
task_id: content-factory-next-fn33.90.11
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
  - не выполнено: правка требует чужого файла и бэкенда
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
  - content-factory-next-fn33.90.11 — нужны voice-copy.ts и voice.service.ts
---

# Summary

Не сделано: строка живёт в двух местах, и оба вне зоны записи потока.

`apps/frontend/src/components/brand-voice/voice-copy.ts:691` —
`avatarsRestrictedTitle: 'Аватары заводит владелец'`, и
`libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts:2904`
— тот же текст в поле `notice` ответа `GET /content-intelligence/voice/avatars`.
Поправить надо оба: иначе экран и ответ сервера скажут разное.

Предложенный текст, тот же, что уже стоит на пустом состоянии вкладки: «Раздел
открыт на чтение: изменить голос может редактор или администратор».

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
