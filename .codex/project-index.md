# Content Factory Project Index

## Current Programme

- Эпик Beads `content-factory-next-vme` держит всю оставшуюся работу: семь стадий по порядку — `vme.1` учёт AI и публичные гарантии, `vme.2` интерфейсный долг, `vme.3` эксплуатационная готовность, `9e9` контентный интеллект, `0c8` редактор изображений, `or3` публичная воронка, `cft` переезд в публичный репозиторий (последняя по решению владельца 17.08.2026). Его описание перечисляет девять решений владельца, которые ни одна стадия не поглощает; тот же список повторён в разделе отложенного в `.codex/handoff.md`.
- Стадии `content-factory-next-vme.1`, `.2` и `.3` приняты локально на
  release-уровне; receipts и артефакты лежат в соответствующих каталогах
  `.codex/stages/`. Стадия `content-factory-next-9e9` также принята: после
  research-first контракта профиль/голос, реестр источников, память и единый
  контекст подключены к четырём путям создания. Стадия `0c8` также принята:
  приватный Fabric.js-редактор сохраняет новую media-копию без vendor calls.
  Стадия `or3` принята: публичный продукт и безопасный demo ведут в
  email-first регистрацию, выбранный шаблон реально применяется через LOCAL и
  OAuth, а конверсия хранится только в шести закрытых агрегатах. Следующая
  программная граница — `content-factory-next-cft`; она ещё не начата.

## Documentation

- `docs/README.md` — главный индекс документации и рекомендуемый вход в проект.
- `docs/{product,architecture,development,operations,adr,maintenance}/` — продукт, система, разработка, эксплуатация, решения и правила актуальности.
- `PRODUCT.md` — аудитория, назначение, позиционирование и стратегические design principles.
- `docs/product/cloud-saas-growth-spec.md` и ADR-0010 — Cloud-first managed
  SaaS-модель, гибридный AI, публичная воронка и явные коммерческие,
  юридические и production-gates при сохранении AGPL Source.
- `docs/product/content-intelligence-brand-profile-spec.md`,
  `content-source-registry-spec.md` и `content-memory-spec.md` — принятые
  контракты профиля, разрешённых источников, фактов, доказательств и единого
  контекста.
- `docs/product/second-walk-wave-2026-09-08-spec.md` — волна второго прогона 08.09.2026 (эпик `tu3k.14`), макеты `docs/design/desert-lab/pipeline/`, заказ `docs/prompts/astra-second-walk-wave-2026-09-08.md`.
- `docs/product/third-walk-wave-2026-09-10-spec.md` — волна третьего прогона 10.09.2026 (эпик `tu3k.15`, эпик ресерча `m0iy`), заказ `docs/prompts/astra-third-walk-wave-2026-09-10.md`, материалы `.codex/stages/content-factory-next-tu3k.15/evidence/walk-2026-09-10/`.
- `DESIGN.md` — канонические визуальные tokens, компоненты и guardrails.
- `docs/design/content-factory-interface-specification.md` — полная область пользовательского ребрендинга и UI-приёмка.
- `docs/prompts/opus-5-content-factory-brand-redesign.md` — исторический handoff, по которому UI-эпик уже выполнен; повторно не запускать.
- `docs/research/README.md` — соглашение об именовании отчётов и указатель: что в каждом и к какому выводу он пришёл. Два отчёта о поисковом бэкенде
  противоречат друг другу намеренно (второе мнение); владелец выбрал Tavily
  основным, контракт — `docs/prompts/search-provider-port-spec.md` и
  `content-factory-next-yqh`. `writer-voice-style-transfer-2026-08-22.md` —
  основание эпика `content-factory-next-36r`.

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
- `libraries/nestjs-libraries/src/content-intelligence/pieces/` (сервис, репозиторий, `core-write.ts`), `apps/backend/src/api/routes/content-piece.controller.ts`, `apps/frontend/src/components/content-intelligence/pieces/` — заготовка и адаптации (волна `tu3k.9`): контракт в разделе «Заготовка и адаптации» `voice-wiring.contract.ts`, фикстура `pieces.fixture.ts`, решения — `docs/product/content-section-map.md` §11, схема — `docs/operations/piece-adaptation-schema-apply.sql`.
- `pieces/adaptation-review.ts`, `adaptation-review.contract.ts` и `openai/ai.roles.ts` внутри `libraries/nestjs-libraries/src/` — явная платная проверка адаптации (`review`), один вызов и атомарное принятие в DRAFT; UI `apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx`.
- Волна третьего захода: `docs/product/third-walk-wave-2026-09-10-spec.md`; вопросы до сути — `libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v2.ts`, `intake-content.ts`; опоры с выбором — `pieces/piece-facts.v2.ts`; карточка канала — `channels/channel-writing-profile.v2.contract.ts`. Обычный генератор читает её по `integrationId` в `agent/agent.graph.service.ts`.
- Ресерч R1–R5: `libraries/nestjs-libraries/src/content-intelligence/research/` содержит policy/fetch/Wikipedia/Wikidata и квоту, `libraries/nestjs-libraries/src/openai/web.research.service.ts` — общий порт Tavily/Exa; вход и усиление заготовки используют явный выбор опор. R6/R7 ждут замера пользы.
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
- `registration-intent.ts`, `starter-template-chooser.tsx` и auth
  `starter-template.ts` — allowlisted LOCAL/OAuth шаблон и single-use intent.
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
  неаутентифицированных auth POST и краткоживущий tracker без сырого адреса;
  контракт с ingress (`deploy/production/Caddyfile.snippet`, `var/docker/nginx.conf`)
  и известные ограничения описаны в `docs/operations/configuration.md`.
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
- `docs/operations/error-collection.md`, `libraries/helpers/src/errors/browser.error.relay.server.ts` и exact nginx route — закрытый payload и bounded per-page budgets без IP/UA/cookies/URL; `scripts/ci/run-docker-backed-ci.sh` — required zero-skip Docker/relay/Mastra/restore proof.
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

- Runtime product state will live in Postgres through Prisma once a migration slice is accepted.
- Git owns code, schemas, migrations, configuration examples, durable decisions, and public-safe export fixtures.
- Beads owns task and status history; `.codex/handoff.md` owns only current operational state.
- История Postiz сохранена в Git; remote `upstream` удалён по решению владельца.
- AGPL-3.0 governs the fork and the chosen Content Factory product model. Preserve notices and provide the exact corresponding source before external network use or distribution; see `docs/adr/0005-release-content-factory-next-under-agpl.md`.
- Existing Content Factory Git artifacts remain donor evidence until an explicit migration maps them into product records and exports.

## Verification

- Runtime selection: `nvm use` then `node --version` and `pnpm --version`.
- Dependency baseline: `pnpm install --frozen-lockfile`.
- Build: `pnpm run build`.
- Tests: `pnpm test`.
- Repository checks: `git diff --check` and `scripts/orchestration/run_process_verification.sh`.
- Orchestration regression checks: `python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py`.
- Run focused checks for affected packages during development; use the full set only at integration or release boundaries.

## Conventions And Boundaries

- Use pnpm only and keep the checked lockfile authoritative.
- Backend changes follow DTO -> Controller -> Service/Manager -> Repository and use Prisma rather than raw SQL.
- Frontend changes reuse the current components, SWR hooks, `useFetch`, translations, and visual tokens.
- Brand/UI changes follow `PRODUCT.md`, `DESIGN.md`, ADR-0006, and the interface specification. Replace user-facing Postiz identity while preserving required provenance and compatibility-sensitive legacy identifiers.
- Never edit an already-used Temporal workflow/activity contract; create a versioned successor.
- Keep platform-specific behavior in provider implementations.
- No Content Factory implementation code is imported before the product licensing model is decided.
- No credentials, private materials, real provider calls, live publishing, paid model calls, deployment, or user messaging without explicit authority.
- Keep current-state and target-state separate according to `docs/adr/0002-separate-current-and-target-state.md`.
- Update documentation and the local Graphify index when architecture or durable workflow changes.
- Проверка/перегенерация V2 — `docs/product/review-v2.md`, `pieces/review.v2.ts`, `review.v2.contract.ts` и `review-semantic.v2.ts` в content-intelligence; прежний V1 сохранён. Общий Disclosure — `apps/frontend/src/components/ui/disclosure.tsx`.
