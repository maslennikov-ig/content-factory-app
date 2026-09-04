---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: участник или редактор, упершийся в администраторскую дверь
public_facade: общее модальное окно отказа по роли (ответ 403)
bounded_acceptance: заголовок, текст и кнопка окна отказа читаются на языке интерфейса
non_goals:
  - перевод серверных сообщений на бэкенде
  - отказы по тарифу (402) и по объёму
evidence:
  - none
task_id: content-factory-next-fn33.64
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: отказ по роли говорит на языке человека
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: medium
model_reasoning_rationale: перевод плюс защита от расхождения двух файлов
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - apps/frontend/src/components/layout/layout.context.tsx
  - шестнадцать локалей
  - tests
success_criteria:
  - заголовок и кнопка берутся из локалей
  - две фразы фильтра читаются по своим ключам
  - незнакомый отказ показывается как пришёл
  - страж держит фильтр и экран вместе
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - таблица «серверная фраза -> ключ локали» как способ перевести ответ API на экране
parallel_group: fn33-wave-04-09-2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: ветка оставлена корню на слияние
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: текст отказа не является новой дверью, матрица ролей не меняется
verification:
  - pnpm exec jest tests/role-refusal-localized.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
changed_files:
  - apps/frontend/src/components/layout/layout.context.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/role-refusal-localized.test.cjs
explicit_defers:
  - none
---

# Summary

Окно отказа по роли было английским целиком: заголовок «Not allowed», серверное
предложение и кнопка «Close» посреди русского интерфейса. Заголовок и кнопка
теперь из локалей (`role_refusal_title`, уже существовавший `close`), а две
фразы, которые пишет `SubscriptionExceptionFilter`, читаются по своим ключам
`role_refusal_admin_only` и `role_refusal_generic`. Незнакомый отказ
по-прежнему показывается тем текстом, что прислал сервер.

# Scope / Routing

Перевод сделан на экране, а не на бэкенде: у фильтра нет языка браузера и
i18next, и его предложение — это ещё и ответ API. Плата за такое решение —
связь по английской фразе; её держит новый страж, который читает и фильтр, и
экран, так что переформулировка на сервере не вернёт окно к английскому молча.
Файл `subscription.exception.ts` не менялся (вне зоны записи).

# Verification

Красный до исправления: оба структурных теста в
`tests/role-refusal-localized.test.cjs`. Ключи проверены во всех шестнадцати
локалях, переводы человеческие, дополнений в allowlist не потребовалось.

# Delivery / Cleanup

Возвращено корню как ветка worktree.

# Risks / Follow-ups / Explicit Defers

Если появится третий отказ по роли, его надо добавить в обе таблицы — страж
об этом скажет только для двух известных фраз, новую он не знает.
