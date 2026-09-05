---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integration-wave/walker-p3-2026-09-05
public_facade: n/a
bounded_acceptance: tests/admin-sign-in-method.test.cjs зелёный, LOCAL/TELEGRAM/GOOGLE не доходят до экрана
non_goals:
  - схема Prisma не меняется
  - боевые данные не переименовываются и не мигрируются
evidence:
  - admin-sign-in-method-jest
task_id: content-factory-next-fn33.124
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: зачистка живого прогона владельца
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка нескольких поверхностей с тестами и шестнадцатью локалями
repo: content-factory-next
branch: worktree-agent-a73dec396ef7357d8
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a73dec396ef7357d8
write_zone:
  - apps/frontend/src/components/admin/**
  - apps/frontend/src/components/content-intelligence/**
  - libraries/nestjs-libraries/src/database/prisma/{users,organizations}
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - tests/admin-sign-in-method.test.cjs зелёный, LOCAL/TELEGRAM/GOOGLE не доходят до экрана
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка остаётся на слияние корню
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет, матрица ролей не меняется
verification:
  - pnpm exec jest tests/admin-sign-in-method.test.cjs: passed
  - pnpm exec jest tests/user-identity.settings.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/react-shared-libraries/src/helpers/provider-label.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/admin-sign-in-method.test.cjs
  - tests/user-identity.settings.test.cjs
explicit_defers:
  - none
---

# Summary

«Способ» в списке аккаунтов больше не печатает значение перечисления.

# Scope / Routing

`row.providerName` печатался как есть, и в русской таблице стоял столбец `LOCAL`.
Экран «Способы входа» в профиле давно называл те же значения словами, поэтому его
`providerLabel` и `PROVIDER_NAMES` переехали в общий
`libraries/react-shared-libraries/src/helpers/provider-label.ts`, а оба экрана его читают.
Марки (GitHub, Google, Telegram, Farcaster, Wallet) не переводятся — это имена, а не описания.
`LOCAL` берёт существующий ключ `email_and_password` (уже был в шестнадцати локалях).
Единый вход развёртывания без собственного имени получил новый ключ `sign_in_method_sso`
в шестнадцати локалях, все переведены — записи в allowlist не потребовалось.

Отклонение от зоны записи: тронут `apps/frontend/src/components/settings/sign-in-methods.component.tsx`
(удаление двух локальных определений и импорт общего) и `tests/user-identity.settings.test.cjs`
(его локальный загрузчик искал у `@contentfactory/react/` только `.tsx`, из-за чего весь набор
переставал грузиться, встретив общий помощник без JSX).

# Verification

Все команды под Node 22.23.2 из `.nvmrc`, в своём worktree.

- `pnpm exec jest tests/admin-sign-in-method.test.cjs` — passed
- `pnpm exec jest tests/user-identity.settings.test.cjs` — passed
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs` — passed
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — passed

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a73dec396ef7357d8`; слияние и очистка за корнем.

# Risks / Follow-ups / Explicit Defers

Общий помощник теперь читают два экрана: правка имени марки видна в обоих. Ключ `sign_in_method_sso` показывается только на развёртывании с единым входом без собственного имени — вживую не наблюдался.
