---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: n/a
bounded_acceptance: tests/section-heading-language.test.cjs
non_goals:
  - изменение `LanguageFromProfile` и порядка применения языка
  - серверная отрисовка заголовка
evidence:
  - section-heading-language-suite
task_id: content-factory-next-fn33.114
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: ошибка в списке зависимостей, видимая только на перерисовке
repo: content-factory-next
branch: worktree-agent-aa746f278ef2c6425
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa746f278ef2c6425
write_zone:
  - apps/frontend/src/components/layout/title.tsx
  - tests/section-heading-language.test.cjs
success_criteria:
  - заголовок раздела меняется вместе с языком без перезагрузки
  - тест красный без правки и зелёный с ней
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-L2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: причина и разбор записаны в самом файле
verification:
  - pnpm exec jest tests/section-heading-language.test.cjs: passed (красный без правки: 3 из 3)
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/layout/title.tsx
  - tests/section-heading-language.test.cjs
explicit_defers:
  - none
---

# Summary

Причина оказалась не в серверной отрисовке, а в памяти узла. `Title` считал имя раздела через `useMemo`, у которого в зависимостях стоял только адрес. `useMenuItem` берёт имена у `useT`, а тот в браузере возвращает `t` из `useTranslation` — react-i18next по умолчанию (`bindI18n: 'languageChanged'`) перерисовывает подписчика при смене языка. Перерисовка и происходила: меню и подписи становились русскими. Заголовок же возвращал запомненную строку, потому что адрес не менялся.

Мемоизации больше нет: поиск одного пункта в списке из десятка дешевле правильного списка зависимостей, а неправильный список — это и был дефект. Обратный случай (переключение на английский) чинится тем же.

Тест воспроизводит договор `react-i18next` — подписчик, которого будит смена языка, — и проверяет заголовок при неизменном адресе.

# Scope / Routing

Зона записи и критерии — в заголовке. Документация: внешних источников не требовалось; версия `@copilotkit/react-ui` читалась из `node_modules` этого дерева, остальное — код репозитория. Навыки, агенты и кандидаты каталога не выбирались.

# Verification

Команды и результат перечислены в поле `verification`. Полный `pnpm test` не запускался: волна это запрещает.

# Delivery / Cleanup

Коммит на ветке потока `worktree-agent-aa746f278ef2c6425`. Ветка остаётся до слияния корнем; `bd close` корень делает одной партией.

# Risks / Follow-ups / Explicit Defers

- none
