---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: n/a
bounded_acceptance: tests/page-title-language.test.cjs
non_goals:
  - переименование ключа `content`, у которого своя жизнь в подписи поля
evidence:
  - page-title-language-suite
task_id: content-factory-next-fn33.117
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: одна строка, но она про имя раздела в трёх местах
repo: content-factory-next
branch: worktree-agent-aa746f278ef2c6425
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa746f278ef2c6425
write_zone:
  - apps/frontend/src/app/(app)/(site)/content/page.tsx
  - tests/page-title-language.test.cjs
success_criteria:
  - вкладка, меню и заголовок раздела «Контент» говорят одно слово
  - тест связывает ключ вкладки с ключом строки меню, а не с текстом
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
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: смена ключа перевода, поведение прежнее
verification:
  - pnpm exec jest tests/page-title-language.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/app/(app)/(site)/content/page.tsx
  - tests/page-title-language.test.cjs
explicit_defers:
  - none
---

# Summary

Вкладка браузера у `/content` брала ключ `content` — «Содержание». Это подпись поля в подписях (`signatures.component.tsx`), у неё своё слово и свои места. Имя раздела живёт в `content_section` — «Контент», — и именно его показывают меню слева и заголовок над содержимым. Вкладка теперь спрашивает тот же ключ.

Ключ `content` не тронут: его текст верен там, где он стоит.

# Scope / Routing

Зона записи и критерии — в заголовке. Документация: внешних источников не требовалось; версия `@copilotkit/react-ui` читалась из `node_modules` этого дерева, остальное — код репозитория. Навыки, агенты и кандидаты каталога не выбирались.

# Verification

Команды и результат перечислены в поле `verification`. Полный `pnpm test` не запускался: волна это запрещает.

# Delivery / Cleanup

Коммит на ветке потока `worktree-agent-aa746f278ef2c6425`. Ветка остаётся до слияния корнем; `bd close` корень делает одной партией.

# Risks / Follow-ups / Explicit Defers

- none
