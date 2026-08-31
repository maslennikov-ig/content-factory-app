# План реализации бренда и интерфейса Content Factory

> Актуализация namespace от 2026-08-14: технические примеры и ограничения ниже
> используют нынешний `@contentfactory/*`; исходный UI-этап замораживал
> существовавший тогда upstream import alias.

> Для реализации: выполнять через `orchestrator-stage`, по одному дочернему Beads-этапу, не закрывая epic до общей визуальной и функциональной приёмки.

**Цель:** превратить пользовательский интерфейс fork Postiz в самостоятельный Content Factory, сохранив поведение, совместимые внутренние contracts и обязательную upstream-атрибуцию.

**Архитектура:** сначала семантические design tokens и общие primitives, затем auth и app shell как эталон, после этого основные и вторичные поверхности. Старые color aliases остаются временным bridge; новые компоненты используют только семантические имена. Rebrand scan различает пользовательскую поверхность, техническое наследие и юридическую атрибуцию.

**Стек:** Next.js 15, React 19, TypeScript, Tailwind/SCSS, существующие shared React libraries, Playwright для browser smoke, Jest и repository process checks.

**Documentation:** локальный код, `PRODUCT.md`, `DESIGN.md`, ADR-0006 и спецификация являются источниками истины. Для version-sensitive поведения Next/React/Tailwind сначала выполнить `orch-prompts docs-resolve` с lockfile-версией; first-party docs использовать только если локального L1 недостаточно.

## Этап 1. Защитить границу бренда

**Beads:** `content-factory-next-zjm.1`

**Файлы:**

- создать focused brand-scan test рядом с `tests/foundation.test.cjs` или в `tests/branding.test.cjs`;
- добавить явный allowlist для `LICENSE`, notices, migration/upstream docs, historical ADR/stages и legacy contract identifiers;
- инвентаризировать видимые строки и assets в `apps/frontend/src`, `apps/frontend/public`, `apps/extension`, email templates и metadata.

**Шаги:**

1. Сначала написать падающую проверку на известные видимые Postiz-следы: title auth, логотип, `postiz.com` Terms/Privacy и app shell asset.
2. Разделить находки на `must replace`, `must preserve` и `needs manual review`; не делать global replace.
3. Проверить focused test и сохранить команду/результат в stage artifact.

## Этап 2. Создать дизайн-фундамент

**Beads:** `content-factory-next-zjm.1`

**Файлы:**

- `apps/frontend/src/app/colors.scss`;
- `apps/frontend/src/app/global.scss`;
- `apps/frontend/tailwind.config.cjs`;
- `apps/frontend/src/styles/fonts.ts`;
- `libraries/react-shared-libraries/src/form/`;
- новые общие brand/status/panel/navigation primitives в существующей frontend/shared границе.

**Шаги:**

1. Перенести значения из `DESIGN.md` в семантические light/dark CSS variables.
2. Оставить старые `new*`/`customColor*` aliases как bridge только там, где немедленная миграция всех consumers нецелесообразна; новые JSX не использует их.
3. Удалить глобальное отключение outline и создать единый focus ring.
4. Нормализовать button, input, select, textarea, panel, status, tooltip/popover и skeleton states.
5. Добавить code-native wordmark и самостоятельный `CF` SVG mark с accessible behavior; заменить favicon/app assets, не копируя форму Postiz.

## Этап 3. Сделать auth и app shell эталоном

**Beads:** `content-factory-next-zjm.1`

**Файлы:**

- `apps/frontend/src/app/(app)/auth/layout.tsx` и auth pages;
- `apps/frontend/src/components/auth/`;
- `apps/frontend/src/components/new-layout/logo.tsx`;
- `apps/frontend/src/components/new-layout/layout.component.tsx`;
- `apps/frontend/src/components/layout/top.menu.tsx`, `title.tsx`, organization/theme/language/notification controls;
- root metadata/manifest/OG/email/support sources, найденные brand inventory.

**Шаги:**

1. Заменить auth marketing wall на реальный Content Factory workflow preview без testimonials/20,000+ claims.
2. Сохранить email/password, optional Google, activation и password reset contracts; отобразить Google только при готовой конфигурации.
3. Реализовать 248/72px sidebar, mobile drawer, page header и secondary account/admin menu.
4. Проверить role/billing/admin gates, keyboard nav, focus return, overflow и обе темы.
5. Снять эталонные screenshots auth и `/launches` на 1440 и 390px до миграции остальных страниц.

## Этап 4. Перенести основные рабочие поверхности

**Beads:** `content-factory-next-zjm.2`

**Файлы:**

- `apps/frontend/src/components/launches/launches.component.tsx` и `calendar.tsx`;
- `apps/frontend/src/components/new-launch/`;
- media, integrations/plugs, agents и analytics components, найденные через route-to-component trace;
- общие shared primitives только когда есть минимум два реальных consumer.

**Шаги:**

1. Зафиксировать текущее поведение каждого route focused test/smoke до визуального изменения.
2. Мигрировать toolbar, filters, content sections, lists/tables, states и actions на общие primitives.
3. Не унифицировать platform previews: они должны оставаться визуально точными внешней площадке.
4. Проверить typical/empty/loading/error/long-content и desktop/mobile для каждого основного маршрута.

## Этап 5. Перенести вторичные поверхности

**Beads:** `content-factory-next-zjm.3`

**Файлы:**

- routes/components settings, billing, admin, third-party, preview, extension, provider и OAuth;
- notifications, dialogs, support/feedback, onboarding и email templates;
- актуальный `README.md` и product-facing docs.

**Шаги:**

1. Применить тот же component vocabulary, не создавать локальные темы.
2. Отделить destructive/admin actions и убрать неактуальные Postiz links/claims.
3. Сохранить platform logos только как обозначения интеграций.
4. Проверить localizable copy и длинные русские/английские строки.

## Этап 6. Закрыть epic

**Beads:** `content-factory-next-zjm.4`

**Шаги:**

1. Запустить brand scan и вручную проверить allowlist; не удалять AGPL/provenance.
2. Browser smoke: auth, `/launches`, composer, media, integrations, analytics, settings; 1440/1024/768/390px, light/dark, keyboard и reduced motion.
3. Исправить P0/P1 accessibility, overflow, contrast и state defects; реальные defers создать в Beads.
4. Запустить `pnpm run build`, `pnpm test`, `git diff --check` и `scripts/orchestration/run_process_verification.sh`.
5. Обновить docs/handoff, освежить Graphify на принятом HEAD, выполнить review/closeout и только затем закрыть epic.

## Запрещённые сокращения

- Не делать один глобальный search/replace `Postiz -> Content Factory`.
- Не переименовывать `@contentfactory`, DB, Temporal, provider или env contracts внутри UI-этапа.
- Не оставлять старые экраны «на потом» без Beads-задачи и bounded defer.
- Не заявлять прохождение build/tests/browser checks без свежего вывода.
- Не выполнять deploy, push, live OAuth/provider connection, publication или paid model call.
