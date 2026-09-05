---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-c-allowance
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: content-factory-next-fn33.28
public_facade: GET /settings/ai/allowance + AllowanceHint
bounded_acceptance: jest tests/ai-allowance.*, design/locale/roles/tenant guards, tsc backend+frontend
non_goals:
  - учёт расхода, лимиты и админский экран настроек AI не менялись
  - окно поста (apps/frontend/src/components/new-launch/**) не тронуто — поток B
evidence:
  - none
task_id: content-factory-next-fn33.28.3
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-compose-2026-09-04
milestone: окно поста — единый стиль и человеческие подписи
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: разведка платных дверей плюс изменение бэкенда и интерфейса разом
repo: content-factory-next
branch: worktree-agent-ac4c3fdfa80eb4959
base_branch: wave/compose-2026-09-04
base_commit: a1a606c20798c1ac02e00f859beacf90f2f238fe
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ac4c3fdfa80eb4959
write_zone:
  - apps/backend/src/api/routes/settings.controller.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts (только чтение остатка)
  - apps/frontend/src/components/ui/allowance-hint.tsx
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - apps/frontend/src/components/brand-voice/voice-samples.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-wizard.container.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/product/roles-matrix.md
  - jest-ai-allowance-read, jest-ai-allowance-door, jest-ai-allowance-hint, tests/locale-untranslated-allowlist.json
success_criteria:
  - остаток квоты виден у платной кнопки в разделе «Контент» и в разборе голоса
  - режим «ключ пространства» показан словами, а не выдуманным числом
  - исчерпано сказано теми же словами, что отказ сервера 429
  - дверь чтения открыта любому участнику и не отдаёт ни ключа, ни имён
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - authorization
  - tenancy
  - ui
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — новый раздел про дверь остатка без политики
verification:
  - "pnpm exec jest jest-ai-allowance-read jest-ai-allowance-door jest-ai-allowance-hint": passed
  - "pnpm exec jest jest-design-guard jest-design-contrast jest-foundation jest-locale-key-set jest-locale-translated jest-roles-matrix-guard jest-tenant-isolation-guard jest-ai-usage-consumer-guard jest-ai-usage-execution jest-ai-provider-component": passed
  - "pnpm exec jest jest-brand-voice-wizard jest-content-search-screen-guard jest-brand-voice-profile-screens jest-design-typography": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/backend/src/api/routes/settings.controller.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - apps/frontend/src/components/ui/allowance-hint.tsx
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - apps/frontend/src/components/brand-voice/voice-samples.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-wizard.container.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/product/roles-matrix.md
  - jest-ai-allowance-read
  - jest-ai-allowance-door
  - jest-ai-allowance-hint
  - tests/locale-untranslated-allowlist.json
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.28.3.md
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
explicit_defers:
  - "подсказка не поставлена у помощника (copilot chat), генератора поста, картинок и переписывания предложения голосом: их кнопки живут в apps/frontend/src/components/new-launch/**, autopost/**, plugs/**, settings/** и agents/** — вне зоны записи этого потока"
---

# Summary

У платного действия теперь видно, сколько осталось. Дверь чтения —
`GET /settings/ai/allowance`, без политики, поэтому её читает любой участник;
она отдаёт только `{ mode, used, limit, remaining, resetsAt }`. Считает она тем
же предикатом, что и допуск операции, поэтому показанное число — то самое, с
которым столкнётся следующее нажатие.

Компонент `AllowanceHint` — одна строка `cf-caption`: «Осталось N из M до
<дата>», «Ключ пространства: лимита нет», исчерпано (теми же словами, что отказ
429 и экран настроек), плюс состояния ожидания и недоступности. Он никогда не
блокирует кнопку.

Поставлен в двух местах: «Найти подтверждение» в разделе «Контент» и «Разобрать»
в мастере голоса (через слот `allowanceHint`, чтобы экран остался без сети и
сцены обзора не сломались).

# Scope / Routing

Зона записи и критерии — в заголовке. Внешняя документация не понадобилась:
все изменения опираются на код репозитория (Prisma-счётчик, Nest-контроллер,
существующий SWR/useFetch и токены дизайн-системы).

Отклонения от плана бида:
1. Дверь не `GET /ai-usage/allowance`, а `GET /settings/ai/allowance`. Новый
   контроллер потребовал бы правки `apps/backend/src/api/api.module.ts` вне
   зоны записи; `SettingsController` уже зарегистрирован, а `AiUsageService`
   виден через глобальный `DatabaseModule`.
2. В таблицу «Двери» матрицы ролей строка не добавлена: страж
   `tests/roles-matrix.guard.test.cjs` разбирает только двери с
   `@CheckPolicies` и падает на строке, за которой нет такой двери. Дверь
   описана прозой в новом разделе «Остаток квоты читает любой участник».
3. Раздел «Контент» лежит в `apps/frontend/src/components/content-intelligence/`,
   каталога `content/` в репозитории нет.

# Verification

Команды и результат — в поле `verification`. Красный до зелёного: с временно
убранной реализацией три новых набора дали 9 упавших тестов из 10, после
возврата — 17 зелёных из 17.

# Delivery / Cleanup

Возвращено корню на слияние; ветка потока не отправлялась в remote.

# Risks / Follow-ups / Explicit Defers

- Два счёта расхода в продукте расходятся: админский экран (`ai.provider.service.ts`)
  считает все записи периода, допуск и эта дверь пропускают «повисшие» допуски
  старше суток. Разница видна как разное «использовано» на экране настроек и в
  подсказке. Файл `ai.provider.service.ts` вне зоны записи — не трогал.
- Карта платных дверей и их кнопок — в отчёте потока; часть кнопок осталась без
  подсказки по границам зоны (см. `explicit_defers`).
