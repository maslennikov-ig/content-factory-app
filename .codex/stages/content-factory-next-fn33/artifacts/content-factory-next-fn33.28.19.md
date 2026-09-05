---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-A2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integrator
public_facade: n/a
bounded_acceptance: focused-jest-and-tsc-for-brand-voice-learning
non_goals:
  - temporal-workers
  - vector-databases
  - separate-settings-screen
  - automatic-rewriting-of-human-text
evidence:
  - brand-voice-learning-jest
  - brand-voice-suite-green
  - roles-matrix-red-then-green
  - prune-red-then-green
  - tsc-backend-frontend
  - prisma-validate
task_id: content-factory-next-fn33.28.19
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-owner-decisions-2026-09-05
milestone: avatar-learns-from-edits
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: multi-file product slice across backend, schema, interface and docs
repo: content-factory-next
branch: worktree-agent-a3395ad3a78a41795
base_branch: wave/owner-decisions-2026-09-05
base_commit: 686d7f4b
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a3395ad3a78a41795
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/**
  - apps/backend/src/api/routes/brand-voice.controller.ts
  - apps/frontend/src/components/brand-voice/**
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - docs/operations/brand-voice-learned-rules-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/brand-voice-from-samples-spec.md
  - docs/product/roles-matrix.md
  - tests/*.cjs
success_criteria:
  - substantive edits are captured and cosmetic ones are not
  - one model call per batch, never per edit
  - stored pairs and learned rules both bounded
  - avatar screen shows what was learned and can undo a rule
  - every new door has a row in the roles matrix and a tenant filter
selected_docs:
  - docs/product/brand-voice-from-samples-spec.md
  - docs/product/content-intelligence-brand-profile-spec.md
  - docs/design/component-authoring-rules.md
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
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no temporary artefacts left in the tree
risk_level: high
risk_tags:
  - migration
  - tenancy
  - data
  - ui
  - api
affected_surfaces:
  - database
  - backend
  - api
  - ui
invariants:
  - tenancy
  - idempotency
  - test-matrix
docs_impact: migration
docs_reviewed: updated
docs_review_notes: spec section 10 "Обучение на правках", production-deploy schema section, roles matrix count 18 -> 20
verification:
  - pnpm exec jest tests/brand-voice tests/content-intelligence: passed
  - pnpm exec jest tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated tests/raw-control.guard: passed
  - pnpm exec jest tests/roles-matrix.guard tests/tenant-isolation.guard tests/ai-role-routing.guard tests/backend-no-dynamic-alias-import.guard: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec prisma validate: passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-learning.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-edit.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-profile.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-assist.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - apps/backend/src/api/routes/brand-voice.controller.ts
  - apps/frontend/src/components/brand-voice/voice-learning.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-profile.container.tsx
  - apps/frontend/src/components/brand-voice/voice-profile.adapter.ts
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - docs/operations/brand-voice-learned-rules-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/brand-voice-from-samples-spec.md
  - docs/product/roles-matrix.md
  - tests/brand-voice.learning.test.cjs
  - tests/brand-voice.edits.test.cjs
  - tests/brand-voice.routes.test.cjs
  - tests/brand-voice.profile-tab.test.cjs
  - tests/brand-voice.sample-files.test.cjs
explicit_defers:
  - learned rules do not reach the generation prompt yet; libraries/nestjs-libraries/src/agent/voice-directives.ts and brand-profile.context.service.ts are outside this write zone
  - VoiceRibbonContainer and POST /content-intelligence/voice/text-check/repair are production-dead but not removed; removal is its own cleanup bead
---

# Summary

Аватар учится на том, что человек в его черновиках переписал. Пары «было/стало» уже
собирались для порога похожести; добавлены отбор существенных правок, вытеснение по
потолку, один платный разбор на пачку и блок на странице аватара, где видно
накопленное, выученное и кнопка отмены правила.

Схема: **одна новая nullable-колонка `ProjectBrandProfile.learnedRules` (Json)**,
`docs/operations/brand-voice-learned-rules-schema-apply.sql`, на боевой НЕ применена.

# Scope / Routing

Зона записи соблюдена с одним исключением: добавлен `VoiceLearnForgetDto` в
`libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts` — дверь с
телом без DTO обходила бы `ValidationPipe`, а поток DTO → контроллер → сервис требует
контракт репозитория.

Роль вызова ИИ — существующая `extract` (`ai.roles.ts` не тронут): из готовых пар
вытаскивают то, что в них лежит, ничего не пишут. Новая роль потребовала бы строки в
экране настроек ИИ и в шестнадцати локалях без выигрыша.

# Verification

Красный до правки:
- `tests/roles-matrix.guard.test.cjs` — строка `/content-intelligence/voice` с числом 18
  против двадцати дверей в коде.
- `tests/brand-voice.learning.test.cjs` — с выключенным `prune` падает «на аватаре
  остаётся не больше потолка пар».

Зелёный после: 57 наборов `tests/brand-voice` + `tests/content-intelligence` (1065
проверок), стражи дизайна, локалей, ролей, арендаторов, ролей ИИ и динамических
импортов, `tsc` обоих приложений, `prisma validate`.

# Delivery / Cleanup

Возвращено корню одним коммитом на своей ветке. Слияние — за корнем; шаг схемы идёт до
переключения образа.

# Risks / Follow-ups / Explicit Defers

1. **Правила не доезжают до промпта.** Их читает экран, но `agent/voice-directives.ts`
   и `brand-profile.context.service.ts` — чужая зона. Пока это не сделано, «аватар
   учится» означает «накопил и показал», а не «пишет иначе». Записано в spec §10.4.
2. **Правила живут на аватаре, а не в версии голоса** — отклонение от плана задачи.
   Причины: содержимое версии проверяется `brand-profile.validation.ts` (чужая зона), и
   правило обязано пережить пересборку голоса.
3. **Потолок хранения — 200 пар, а не 30.** Тридцать — окно одного разбора. Двести —
   ровно столько, сколько уже читает калибровка порога похожести; резать до тридцати
   значило бы молча отобрать материал у измеренного свойства.
4. **Дверь починки и `VoiceRibbonContainer` не удалены.** По коду мертвы, но за ними
   тянется набор на 620 строк и записи в реестре; отдельная задача.
