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
  - перевод самих экранов администратора (они по-английски и это отдельная задача)
  - маршруты (stand) и (public)
evidence:
  - page-title-language-suite
task_id: content-factory-next-fn33.94
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: механическая правка по одному образцу в двенадцати маршрутах
repo: content-factory-next
branch: worktree-agent-aa746f278ef2c6425
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa746f278ef2c6425
write_zone:
  - apps/frontend/src/app/(app)/(site)/admin/**
  - apps/frontend/src/app/(app)/auth/**
  - apps/frontend/src/app/(app)/oauth/authorize/layout.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/page-title-language.test.cjs
success_criteria:
  - все двенадцать маршрутов auth/**, admin/**, oauth/** берут заголовок у pageTitle
  - тест называет три префикса поимённо и падает, если хоть один вернётся к статическому title
  - каждый ключ существует в ru и написан по-русски
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
docs_review_notes: поведение заголовка вкладки уже описано в тесте помощника
verification:
  - pnpm exec jest tests/page-title-language.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/app/(app)/(site)/admin/errors/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/product-events/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/stats/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/users/page.tsx
  - apps/frontend/src/app/(app)/auth/activate/[code]/page.tsx
  - apps/frontend/src/app/(app)/auth/activate/page.tsx
  - apps/frontend/src/app/(app)/auth/forgot/[token]/page.tsx
  - apps/frontend/src/app/(app)/auth/forgot/page.tsx
  - apps/frontend/src/app/(app)/auth/login/page.tsx
  - apps/frontend/src/app/(app)/auth/page.tsx
  - apps/frontend/src/app/(app)/auth/pending/page.tsx
  - apps/frontend/src/app/(app)/oauth/authorize/layout.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/page-title-language.test.cjs
explicit_defers:
  - none
---

# Summary

Двенадцать маршрутов `auth/**`, `admin/**` и `oauth/**` берут заголовок вкладки у того же помощника `pageTitle`, что и остальные шестнадцать: статический `export const metadata` вычисляется один раз, без запроса, и языка знать не может.

Новых ключей два — `admin_errors` и `authorize_application`. Остальные десять заголовков взяты у существующих ключей, и каждый совпадает с тем, что написано на самом экране: `accounts` («Аккаунты»), `statistics`, `product_events_title`, `sign_in`, `sign_up`, `forgot_password`, `activate_your_account`, `registration_received`. Это и есть просьба задачи `fn33.117`, применённая заранее ко всем: имя раздела одно и то же в меню, в заголовке и на вкладке.

Экраны администратора при этом остаются английскими внутри — переводить их эта задача не просила, и это записано, а не забыто.

# Scope / Routing

Зона записи и критерии — в заголовке. Документация: внешних источников не требовалось; версия `@copilotkit/react-ui` читалась из `node_modules` этого дерева, остальное — код репозитория. Навыки, агенты и кандидаты каталога не выбирались.

# Verification

Команды и результат перечислены в поле `verification`. Полный `pnpm test` не запускался: волна это запрещает.

# Delivery / Cleanup

Коммит на ветке потока `worktree-agent-aa746f278ef2c6425`. Ветка остаётся до слияния корнем; `bd close` корень делает одной партией.

# Risks / Follow-ups / Explicit Defers

- none
