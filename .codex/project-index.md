# Content Factory Project Index

## Current Programme

- Beads owns current scope/status; `.codex/handoff.md` owns the operational snapshot.
- Remaining-work epic: `content-factory-next-0qgn`; [spec](../docs/product/remaining-work-2026-10-01-spec.md), [plan](../docs/superpowers/plans/2026-10-01-content-factory-remaining-work.md); existing scopes below are preserved under it.
- Agent/MCP: `content-factory-next-kcxz`, `docs/product/agent-harness-spec.md`, ADR-0012; evidence and releases under `.codex/stages/content-factory-next-kcxz/`.
- First-client onboarding/acceptance: `content-factory-next-2q28`, `.codex/stages/content-factory-next-2q28/`; preserve the existing client-page response field names.
- Content/voice/search contracts: `docs/product/content-section-map.md`, `brand-voice-from-samples-spec.md`, `docs/product/avatar-grounded-style-contract.md`; search scopes `ec48`, `75xn`, `m0iy`. Reader completion: `web.research.service.ts`/`tests/web.research.summary-language.test.cjs`; V2 TONE quotation and TONE/TOPICS599–600 prose policy, including grounded closed quotes: `brand-voice/proposal-quotation-guard.ts`, outside paid retry/history reads.
- Operations/SaaS navigation: `docs/operations/postgres-backup.md`, `production-deploy.md`, `saas-readiness.md`; current gates remain in Beads, not this index.
- Historical programme `vme` was retired 31.08.2026. `cft` completed the public-tree move the same day; accepted `vme.1/.2/.3`, `9e9`, `0c8` and `or3` retain their stage receipts.

## Documentation

- `docs/README.md` — главный индекс документации и рекомендуемый вход в проект.
- `docs/{product,architecture,development,operations,adr,maintenance}/` — продукт, система, разработка, эксплуатация, решения и правила актуальности.
- `PRODUCT.md` — аудитория, назначение, позиционирование и стратегические design principles.
- `docs/product/cloud-saas-growth-spec.md` и ADR-0010 — Cloud-first managed SaaS-модель, гибридный AI, публичная воронка и явные коммерческие, юридические и production-gates при сохранении AGPL Source.
- `docs/product/content-intelligence-brand-profile-spec.md`,
  `content-source-registry-spec.md` и `content-memory-spec.md` — принятые
  контракты профиля, разрешённых источников, фактов, доказательств и единого
  контекста.
- Волны прогонов: `docs/product/second-walk-wave-2026-09-08-spec.md` (08.09, эпик `tu3k.14`, макеты `docs/design/desert-lab/pipeline/`) и `third-walk-wave-2026-09-10-spec.md` (10.09, эпик `tu3k.15`, эпик ресерча `m0iy`); заказы `docs/prompts/astra-*-walk-wave-*.md`, материалы `.codex/stages/content-factory-next-tu3k.15/evidence/walk-2026-09-10/`.
- `docs/product/sixth-walk-wave-2026-09-14-spec.md` — волна шестого захода 14.09.2026 (эпик `4zul`: ресерч и вопросы по правилу «решаем за человека»; уточняет §4 и §6 третьей волны), заказ `docs/prompts/astra-sixth-walk-wave-2026-09-14.md`, материалы `.codex/stages/content-factory-next-4zul/evidence/walk-2026-09-14/`.
- `DESIGN.md` — канонические визуальные tokens, компоненты и guardrails.
- `docs/design/content-factory-interface-specification.md` — полная область пользовательского ребрендинга и UI-приёмка.
- `docs/prompts/opus-5-content-factory-brand-redesign.md` — исторический handoff, по которому UI-эпик уже выполнен; повторно не запускать.
- `docs/research/README.md` — соглашение об именовании отчётов и указатель: что в каждом и к какому выводу он пришёл. Два отчёта о поисковом бэкенде
  противоречат друг другу намеренно (второе мнение); владелец выбрал Tavily
  основным, контракт — `docs/prompts/search-provider-port-spec.md` и
  `content-factory-next-yqh`. `writer-voice-style-transfer-2026-08-22.md` —
  основание эпика `content-factory-next-36r`.
- `docs/product/seventh-walk-wave-2026-09-16-spec.md` — seventh walk wave `xmfb`: fact selection/review, foreign-post position, search language, research depth/direction, sorting and per-engine keys; execution order in `docs/prompts/astra-seventh-walk-wave-2026-09-16.md`.

## Runtime Shape

- pnpm monorepo on Postiz `v2.22.1`; Node `22.23.2`, pnpm `10.6.1`, Next.js/React, NestJS, Prisma/PostgreSQL, Redis and Temporal.
- Stable branch: `main`; review branches use isolated worktrees. Единственный remote: `origin`.
- Donor `/home/me/code/content-factory` is read-only unless separately assigned.

## Primary Entrypoints

- `AGENTS.md` — product, licensing, safety, and development contract.
- `docs/README.md` — stable documentation navigation.
- `CLAUDE.md` — compact Claude-compatible entrypoint that defers to `AGENTS.md` and records its separate CLI prerequisite.
- `package.json`, `pnpm-workspace.yaml` and `tsconfig.base.json` — workspace commands, product-owned package names and the `@contentfactory/*` import namespace.
- `apps/frontend/` — Next.js product interface, composer, calendar, analytics, media, settings, and the private same-origin Fabric.js media editor.
- `apps/frontend/src/app/(public)/`, `apps/frontend/src/components/public-saas/`
  и `apps/frontend/src/proxy.ts` — публичные SaaS-страницы и allowlist; тот же
  proxy ограничивает `/interface-review` безопасным development/test host.
- `apps/backend/src/api/routes/{brand-profile,content-source,content-context}.controller.ts`
  и `libraries/nestjs-libraries/src/content-intelligence/` — tenant-safe API и
  доменные границы профиля, источников, фактов и снимков контекста.
- `libraries/nestjs-libraries/src/content-intelligence/pieces/` (сервис, репозиторий, `core-write.ts`), `apps/backend/src/api/routes/content-piece.controller.ts`, `apps/frontend/src/components/content-intelligence/pieces/` — заготовка и адаптации (волна `tu3k.9`): контракт в разделе «Заготовка и адаптации» `voice-wiring.contract.ts`, фикстура `pieces.fixture.ts`, решения — `docs/product/content-section-map.md` §11, схема — `docs/operations/piece-adaptation-schema-apply.sql`. Optional `pieces/adaptation-editor.tsx`/`adaptation-emoji-picker.tsx` imports run on explicit client edit/popup actions; stored SSR reading, NATIVE emoji/no CDN and explicit import retry are preserved; the measured body popup stays within the viewport. Runtime memory acceptance stays in Beads71m.8.
- `pieces/adaptation-review.ts`, `adaptation-review.contract.ts` и `openai/ai.roles.ts` внутри `libraries/nestjs-libraries/src/` — явная платная проверка адаптации (`review`), один вызов и атомарное принятие в DRAFT; UI `apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx`; visible current-variant instructions and question processing: `docs/product/adaptation-feedback-processing-spec.md` (0qgn.14/.15).
- Sixth walk (`4zul`): `docs/product/sixth-walk-wave-2026-09-14-spec.md`; opinion-only questions in `intake/intake.prompts.v3.ts` and `pieces/core-questions.ts`; explicit search in `intake/intake.service.ts`; core enrichment in `pieces/piece-research.contract.ts`, `PieceService.researchCore/acceptCoreResearch` and `pieces/adaptation-review.tsx` reusing `intake.research.tsx`. Active review uses `pieces/review-semantic.v3.ts`; answer rewriting uses `pieces/core-write-prompt.v3.ts`; local/global search scope is in `openai/web.research.service.ts`. All library paths start at `libraries/nestjs-libraries/src/content-intelligence/` except `openai/`; UI paths start at `apps/frontend/src/components/content-intelligence/`.
- Ресерч R1–R5: `libraries/nestjs-libraries/src/content-intelligence/research/` содержит policy/fetch/Wikipedia/Wikidata и квоту, `libraries/nestjs-libraries/src/openai/web.research.service.ts` — общий порт Tavily/Exa; `openai/reader-source-review.ts` — bounded reader relevance/fact-date evidence review before cards/summary and fixed safe failure enums with bounded date/entity grounding reasons; `openai/reader-subject-review.ts` and `reader-subject-anchors.ts` select literal query spans through versioned Q IDs before the unchanged source/date/entity validators (`docs/product/reader-subject-anchors-spec.md`, retained v6); `openai/reader-proof-review.ts` is the current source-bound v7 producer with local claim/date references and numeric exact-query spans (`docs/product/reader-proof-binding-spec.md`). Provider excerpt cleanup preserves dotted dates and decimal prefixes; контракты: `docs/product/search-summary-contract.md`, `docs/product/keyless-community-discovery-contract.md` (отдельный бесплатный topic-путь). Вход и усиление заготовки используют явный выбор опор. R6/R7 ждут замера пользы.
- Общие индикатор и строка фильтров — `apps/frontend/src/components/ui/progress.tsx` и `filters-row.tsx`; каталог компонентов — `docs/design/component-inventory.md`; защита от повторной геометрии — `tests/component-geometry.guard.test.cjs`.
- `apps/backend/src/api/routes/ndjson-stream.ts` — общий транспорт входа, адаптации и разбора аватара: без сжатия, первая строка и heartbeat. Контракты расширены отдельными `intake-v2.contract.ts` и `voice-intake-v2.contract.ts`.
- `apps/frontend/src/components/layout/top.menu.tsx` — навигация A; четыре вкладки заготовок в `content-section.screen.tsx`.
- `apps/frontend/src/components/channels/` — список карточками/таблицей и страница канала с четырьмя панелями; общие поля письма в `content-intelligence/intake/writing-profile.fields.tsx`; чтение последних постов — `GET /integrations/:id/posts`.
- `scripts/evidence/liveness-report.cjs` — локальный read-only замер дословного переноса слов автора, без модели; явно различает отсутствие адаптаций и нулевой перенос.
- `apps/frontend/src/components/content-intelligence/` — Settings-поверхности
  профиля, источников и provenance; local-only review routes покрывают полные
  состояния без API, модели и внешней сети.
- `apps/orchestrator/src/workflows/autopost-draft-v2.workflow.ts` — новая
  draft-only AutoPost-версия с закреплённым профилем и точным provenance;
  upstream AutoPost V1 не менялся.
- `apps/backend/src/api/routes/public-growth-events.controller.ts` и
  `libraries/nestjs-libraries/src/database/prisma/public-growth/` — закрытый
  privacy-safe контракт суточных агрегатов конверсии без PII и постоянного
  visitor id.
- `libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts` и Prisma
  `organizations/organization.repository.ts` — совместимые `workspaceName`/`company`,
  ADMIN создателя и стартовые метки по умолчанию. Выбор `starterTemplate` снят
  решением `pdbe`; `scripts/evidence/run-public-funnel-database-proof.cjs` проверяет
  LOCAL/OAuth и изоляцию двух организаций на временных PostgreSQL и Redis. Public-event burst pins only caller-tracker time; the existing native wrapper forces a minute transition with real HMAC/storage/global Date.
- `admin.controller.ts` и Prisma `public-growth/` — super-admin totals/ratios;
  оба `scripts/evidence/*public-funnel*` воспроизводят browser и DB proof.
- `apps/orchestrator/` — Temporal workflows and activities; existing contracts are immutable.
- `libraries/nestjs-libraries/` — shared server services, repositories, Prisma schema, providers, and domain logic.
- `libraries/nestjs-libraries/src/openai/ai.usage.service.ts` — tenant-safe AI
  admission; `admitted` старше 24 часов возвращает allowance, agent списывается один раз.
- `telegram.updates.service.ts` и Prisma `TelegramSupportRelayOutbox` — единый
  `getUpdates` consumer и payload-free at-least-once очередь обращений владельцу.
- `tests/cloud-saas-contract.test.cjs` и legal review runbook — матрица 3 × 16,
  абзацный каркас и явная граница человеческой проверки переводов.
- `libraries/nestjs-libraries/src/throttler/` — per-caller потолки четырёх
  неаутентифицированных auth POST, краткоживущий tracker без сырого адреса и
  `registration-limiter.ts` — owner-safe слот регистрации после DTO-проверки;
  shared Redis owner slot/abuse guard: `docs/product/registration-distributed-budget.md`;
  ingress and deployment limits: `docs/operations/configuration.md`.
- `scripts/operations/cleanup-saas-retention.cjs` — owner-run dry-run/apply
  удаление raw growth/AI-строк старше 90 дней; apply требует
  `CF_CONFIRM_SAAS_RETENTION` и совпадающего `CF_SAAS_RETENTION_TARGET`.
  Расписания в репозитории нет; порядок — `docs/operations/saas-readiness.md`.
- `libraries/react-shared-libraries/` — shared UI and translations.
- `libraries/helpers/` — shared browser/server helpers.
- `deploy/production/docker-compose.yaml` and `docker-compose.dev.yaml` — deployed and development runtime shapes.
- `PRODUCT.md`, `DESIGN.md`, and ADR-0006 — durable product and brand contract.
- `docs/product/migration-map.md` — current migration map and licensing gate.
- `docs/operations/postgres-backup.md` и `scripts/operations/postgres-backup*.sh` — repository-owned backup/restore для product, Mastra и Temporal PostgreSQL; установка wrapper/timer на production остаётся отдельным действием владельца.
- `deploy/production/bootstrap-app-db.sh`, `deploy/production/migrate-mastra-storage.sh` и `scripts/operations/check-postgres-role-isolation.sh` — owner-run переход на отдельные non-owner runtime-роли product/Mastra и отдельную Mastra DB; fail-closed `pg_shdepend`-проверка всех владельцев текущей БД, membership в обоих направлениях, `PUBLIC` ACL, exact DML/sequence grants и cross-database `CONNECT` выполняется до переключения URL.
- `scripts/operations/validate-prisma-migration-sql.cjs` — барьер применения схемы на production: сверяет отобранный оператором SQL с выводом `prisma migrate diff`, пропускает только добавляющие операции по явно названным таблицам и никогда не трогает `mastra_*`. К базе не подключается, едет в образ, покрыт `tests/prisma-schema-apply-guard.execution.test.cjs` и `tests/prisma-schema-apply-guard.migrate-diff.test.cjs`. Порядок применения — `docs/operations/production-deploy.md`, раздел «Применение Prisma-схемы»; `prisma db push` на боевой базе запрещён.
- `docs/operations/runtime-readiness.md` — real existing DB/Redis/Temporal checks; liveness stays separate.
- `var/docker/runtime-memory-gauge.cjs` — bounded diagnostic preload for the three PM2 roles; numeric main-isolate/CJS snapshots only, no inspector/GC/cap change. Limits and restart behavior: `docs/operations/production-deploy.md`. `tests/runtime-memory-gauge.execution.test.cjs` holds real-FD lifecycle, event readiness, bounded fixture metadata and unsafe-value fail-closed cases.
- `scripts/operations/collector-partitions-create-only.py` and `docs/operations/collector-partitions-create-only.md` — bounded shared-collector create-only refresh, never retention or task retry.
- `docs/operations/error-collection.md`, server `sentry/initialize.sentry.ts` (public node-core/light, unchanged Nest filter), `libraries/helpers/src/errors/browser.error.relay.server.ts` и exact nginx route — закрытый payload и bounded per-page budgets без IP/UA/cookies/URL; `scripts/ci/run-docker-backed-ci.sh` — required zero-skip Docker/relay/Mastra/restore proof.
- `docs/operations/legacy-errors-retention.md` и `scripts/operations/cleanup-legacy-errors.cjs` — owner-run dry-run/apply очистка legacy `Errors` старше 90 дней без удаления unknown-семантики.
- `docs/operations/newsletter.md` — owner-run setup собственного Listmonk, double opt-in, private admin/API boundary, UUID unsubscribe и включение отдельной Listmonk DB в PostgreSQL backup/restore; pending delivery хранится в `User`, а `apps/backend/src/services/newsletter/` атомарно арендует точный pending-переход и передаёт в новый bounded Temporal workflow только `userId`, timestamp и stable lease id, без адреса в workflow history или логах. Активные аренды не блокируют следующую сотню, истёкшие восстанавливаются.

## Core Subsystems

- Identity and tenancy: users, organizations, teams, agencies, permissions, and sessions.
- Content operations: posts, drafts, editor, media, calendar, approvals, and analytics.
- Provider integrations: one implementation per social platform behind generic interfaces.
- Durable execution: versioned Temporal workflows and activities for scheduled work.
- Data: Prisma schema and repositories over PostgreSQL; Redis for runtime state.
- Content Factory target layer: project profile, sources, memory, content radar, generation, editorial QA, approval gates, and budget/autonomy controls.

## Integrations And Sources Of Truth

- Runtime product state lives in Postgres through Prisma; Mastra uses its separate database, Redis holds coordination state, and Temporal owns durable execution.
- Git owns code, schemas, migrations, configuration examples, durable decisions, and public-safe export fixtures.
- Beads owns task and status history; `.codex/handoff.md` owns only current operational state.
- История Postiz сохранена в Git; remote `upstream` удалён по решению владельца.
- AGPL-3.0 governs the fork and the chosen Content Factory product model. Preserve notices and provide the exact corresponding source before external network use or distribution; see `docs/adr/0005-release-content-factory-next-under-agpl.md`.
- Existing Content Factory Git artifacts remain donor evidence until an explicit migration maps them into product records and exports.

## Verification

- Runtime selection: `nvm use` then `node --version` and `pnpm --version`.
- Dependency baseline: `pnpm install --frozen-lockfile`.
- Build: `pnpm run build`; tests: `pnpm test`; repository checks: `git diff --check` and `scripts/orchestration/run_process_verification.sh`.
- Orchestration regression checks: `python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py`.
- Run focused checks for affected packages during development; use the full set only at integration or release boundaries.

## Conventions And Boundaries

- Use pnpm only and keep the checked lockfile authoritative.
- Backend changes follow DTO -> Controller -> Service/Manager -> Repository and use Prisma rather than raw SQL.
- Frontend changes reuse the current components, SWR hooks, `useFetch`, translations, and visual tokens.
- Brand/UI changes follow `PRODUCT.md`, `DESIGN.md`, ADR-0006, and the interface specification. Replace user-facing Postiz identity while preserving required provenance and compatibility-sensitive legacy identifiers.
- Never edit an already-used Temporal workflow/activity contract; create a versioned successor.
- Keep platform-specific behavior in provider implementations.
- Donor code integration requires ownership/provenance verification and AGPL compatibility; the product licence decision is ADR-0005.
- No credentials, private materials, real provider calls, live publishing, paid model calls, deployment, or user messaging without explicit authority.
- Keep current-state and target-state separate according to `docs/adr/0002-separate-current-and-target-state.md`.
- Update documentation and the local Graphify index when architecture or durable workflow changes.
- Review/regeneration: `docs/product/review-v2.md`; current `pieces/review.v3.ts`, `review.v3.contract.ts`, `review-semantic.v4.ts` preserve signed v2 results. Shared Disclosure: `apps/frontend/src/components/ui/disclosure.tsx`.
