# План реализации эпика оставшихся задач

**Цель:** закрыть все локально выполнимые задачи `content-factory-next-ia0`,
оставив owner-blocked записи и три родительских эпика открытыми.

**Подход:** один интеграционный этап, три тематические ветки и четыре
делегированных потока. Дизайн идёт строго в заданном порядке в одной ветке;
простые тестовые дефекты предшествуют рискованной части технического долга в
той же ветке. Инфраструктура изолирована из-за security и migration риска.

**Не цели:** merge или push в `main`, PR, deploy, production/SSH/DB access,
credentials, paid calls, real-user messaging, переделка платформенных знаков,
закрытие `71m`, `c6k`, `ry5`, owner-blocked задач или `71m.7`.

**Спецификация:** `.codex/stages/content-factory-next-ia0/spec.md`.

## Карта критериев

- Все реализуемые задачи приняты -> потоки 1–4 и итоговая приёмка.
- Дубликаты закрыты точными ссылками -> корневой пакет закрытия после остановки агентов.
- Owner-blocked, `71m.7` и родительские эпики открыты -> корневой аудит статуса.
- Тематические ветки не слиты в `main` -> граница доставки.
- Один полный acceptance -> итоговая локальная ветка приёмки.
- Design ledgers/guards/visual proof -> поток 1 и итоговая приёмка.

## Поток 1: согласованность интерфейса

**Задачи:** `uck nhq g1d 5fn rgf`, затем `55n gur 34r`, затем `3gn 8ix`.

**Файлы:** `DESIGN.md`, `apps/frontend/src/**` кроме error-relay/sentry файлов,
`apps/frontend/public/icons/platforms/**`,
`libraries/react-shared-libraries/src/form/**`,
`libraries/react-shared-libraries/src/platform/**`,
`libraries/react-shared-libraries/src/translation/locales/**`, `docs/design/**`,
`tests/design*.cjs`, `tests/design-typography-allowlist.json`,
`tests/design-geometry-allowlist.json`, `tests/raw-control*`,
`tests/desert-lab-screen-review.test.cjs`, `tests/foundation.test.cjs`.

**Граница:** UI/design system; откат всей ветки; визуальные и механические guards.

**Интерфейсы:** сохраняет существующие маршруты и данные; производит единые
tokens/primitives/states и официальные vector asset fallbacks.

**Проверка:** `tdd-required` — новые guards и миграции контролов меняют
наблюдаемое поведение и доступность.

- [x] Снять долг типографики, высот, цветов и радиусов строго в первой группе;
      guard на радиусы и словесные псевдонимы доказать красным возвратом дефекта.
- [x] Перевести оставшиеся PlatformBadge call sites, проверить официальные SVG,
      затем довести поверхности раздела 6 во второй группе.
- [x] Мигрировать legacy checkbox и raw inputs в третьей группе; ledgers только уменьшать.
- [x] Запустить точечные design/foundation/contrast/typography/raw-control тесты,
      проверить обе темы и 1440/1024/768/390, сохранить скриншоты и self-review.

## Поток 2: переносимость и гонки тестов

**Задачи:** `ue2 c7l`.

**Файлы:** `tests/postgres-backup.wrapper.execution.test.cjs`,
`tests/branding.test.cjs`, `tests/external-services.purge.test.cjs` и узкие
вспомогательные test utilities при необходимости.

**Граница:** test-only portability/concurrency; первый коммит технической ветки.

**Проверка:** `tdd-required` — воспроизвести capability mismatch и параллельную гонку.

- [x] Добавить capability-based skip только зависимого chmod-сценария, не ослабляя wrapper.
- [x] Унести branding fixture из дерева и доказать отсутствие ENOENT при параллельном Jest.
- [x] Запустить только два затронутых набора и зафиксировать self-review.

## Поток 3: данные, события и долговечный retry

**Задачи:** `e7t sek ry5.2.1`; зависит от потока 2 и продолжает ту же ветку.

**Файлы:** `apps/backend/src/**` в узких Errors/auth/billing seams,
`apps/orchestrator/src/**` только новыми versioned contracts,
`libraries/nestjs-libraries/src/database/prisma/errors/**`,
`libraries/nestjs-libraries/src/newsletter/**`,
`libraries/nestjs-libraries/src/services/stripe.service.ts`,
`libraries/nestjs-libraries/src/temporal/**`, Prisma schema/migrations,
`scripts/operations/**`, `docs/operations/**` и соответствующие focused tests.
`apps/frontend/src/components/billing/**` не входит: при необходимости поток останавливается.

**Граница:** privacy/data/idempotency/retry; отдельные owner-run data steps,
никаких локальных или боевых применений схемы.

**Проверка:** `tdd-required` — data minimization, retention, idempotency и Temporal retries.

- [x] Через `docs-resolve` подтвердить pinned Temporal/Mastra/Prisma поведение,
      нужное выбранным контрактам.
- [x] Ограничить новые `Errors`, добавить dry-run/apply cleanup и retention без потери нужной семантики.
- [x] Записывать ровно одно `cancel_subscription` после авторитетного успеха.
- [x] Добавить durable consent retry новым versioned contract без адресов в логах.
- [x] Прогнать focused privacy/product-event/newsletter/Temporal/migration-guard проверки и self-review.

## Поток 4: инфраструктурные security-границы

**Задачи:** `ry5.2.2 ry5.10`.

**Файлы:** `deploy/production/**`, `var/docker/**`, `scripts/operations/**`,
`docs/operations/**`, Prisma migration/bootstrap scripts,
`libraries/nestjs-libraries/src/agent/**`, `libraries/helpers/src/errors/**`,
узкие frontend/backend error relay entrypoints и соответствующие tests.

**Граница:** database least privilege и privacy-safe ingress; независимая ветка
с owner-run rollout/rollback только в документации.

**Проверка:** `tdd-required` — privilege matrix, migration SQL, payload/log
minimization, abuse limits и collector outage isolation.

- [x] Через `docs-resolve` подтвердить pinned `@mastra/pg` connection/init поведение.
- [x] Разделить product runtime, Mastra DDL и Listmonk CONNECT; поставить читаемые
      preflight/migration/rollback шаги без секретов и без `db push`.
- [x] Реализовать bounded first-party browser error relay с access-log exclusion,
      rate limits и реальным SDK/relay proof без персонального или модельного контента.
- [x] Запустить focused role/migration/backup/error privacy/relay checks и self-review.

## Корневая интеграция и приёмка

- [x] Проверить артефакты и diffs всех потоков, вернуть сгруппированные исправления тем же владельцам.
- [x] Проверить дерево для `0pf`, `ma1`, `uip`; подготовить закрытие дубликатами без реализации.
- [x] Создать локальную ветку приёмки, объединить тематические ветки только туда,
      разрешить конфликты без изменения scope; `main` не трогать.
- [x] Выполнить ровно один полный acceptance с `TMPDIR=/tmp` и Node 22.23.2:
      `pnpm test`; `pnpm run build`; `node scripts/branding/brand-scan.cjs`;
      `pnpm run docs:check`; `bash scripts/orchestration/run_process_verification.sh`;
      `git diff --check`; чистый `git status`.
- [x] Провести один combined risk-selected review, обновить docs/project-index/handoff
      и локальный Graphify на принятой integration boundary.
- [x] Остановить всех агентов; одним пакетом закрыть реализованные задачи,
      дубликаты и эпик, выполнить `bd dolt push`, затем `bd show` каждого id.
