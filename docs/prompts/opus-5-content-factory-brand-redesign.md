# Target

> Namespace note (2026-08-14): this historical prompt now names the current
> `@contentfactory/*` import contract; the completed design stage itself did not
> own the later namespace migration.

Target: Opus 5 в coding-agent среде с shell, Git, Beads, Graphify и браузерной автоматизацией.

# Audience

Audience: владелец Content Factory и следующий агент, который должен получить проверяемый, готовый к продолжению репозиторий. Ты — ведущий product/frontend engineer в /home/me/code/content-factory-next.

# Goal

Полностью реализуй Beads epic content-factory-next-zjm и дочерние задачи .1-.4. Преврати пользовательский интерфейс fork Postiz в самостоятельный Content Factory: сохрани функциональную основу, но замени пользовательский бренд и визуальную систему на редакционный рабочий стиль прежнего /home/me/code/content-factory.

# Success Criteria

- Auth, app shell, основные, вторичные, административные и публичные поверхности везде показывают Content Factory.
- Реализация следует PRODUCT.md, DESIGN.md, ADR-0006 и полной UI-спецификации.
- Light/dark, desktop/mobile, keyboard, focus, reduced motion и все основные states работают согласованно.
- Calendar, composer, media, integrations, agents, analytics, settings и auth сохраняют поведение.
- Brand scan не находит пользовательских Postiz/Gitroom следов вне явного allowlist.
- Свежие build, tests, browser smoke, diff/process checks проходят.

# Context

До изменений полностью прочитай AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/project-index.md, graphify-out/GRAPH_REPORT.md, PRODUCT.md, DESIGN.md, docs/adr/0006-content-factory-brand-and-design-language.md, docs/design/content-factory-interface-specification.md и docs/superpowers/plans/2026-08-11-content-factory-brand-redesign.md. Прочитай epic и children через bd; Beads — единственный источник статуса.

Сначала запроси Graphify по auth, shell, tokens/theme, route-to-component paths и branding consumers. Donor /home/me/code/content-factory только для чтения: используй apps/console/app/globals.css, apps/console/components/console-shell.jsx и docs/product/work-admin-mode-boundary.md как источник принципов, не копируй реализацию вслепую.

Documentation: локальный lockfile, код и принятые документы проекта — источник истины. Для version-sensitive поведения Next.js, React, Tailwind, Mantine или Playwright сначала используй orch-prompts docs-resolve с точной версией; first-party docs — fallback при нехватке L1.

# Execution

Используй orchestrator-stage. Выполняй .1 foundation/auth/shell, затем .2 core surfaces, .3 secondary surfaces и .4 audit/closeout. Не закрывай child без acceptance evidence и epic без общей приёмки.

1. Зафиксируй baseline и dirty-tree ownership. Сохрани чужие изменения.
2. Сначала создай падающий focused brand-scan test с allowlist: user-facing строки/assets отдельно от attribution и legacy contracts.
3. Реализуй семантические light/dark tokens и общие primitives. Compatibility aliases допустимы; новый JSX не использует customColor1…55.
4. Удали глобальное outline:none. Добавь focus ring, полные component states, skeleton/empty/error и reduced-motion.
5. Создай оригинальный code-native wordmark Content Factory и компактный CF mark. Не используй форму, asset или фиолетовый бренд Postiz. Используй vendored Plus Jakarta Sans.
6. Сделай auth и shell эталоном. Удали testimonials, “20,000+” и postiz.com. Google показывай только при готовой конфигурации; email/password остаётся полноценным входом. Terms/Privacy — только через конфигурируемые Content Factory URLs, без сочинения юридического текста.
7. Замени icon-only rail на 248px signed sidebar, 72px collapsed state и mobile drawer. Сохрани organization, roles/admin, billing, theme, language, notifications и routes.
8. Мигрируй calendar/composer/media/integrations/agents/analytics, затем settings/billing/admin/preview/extension/provider/OAuth и остальные видимые состояния на общие primitives.
9. Обнови metadata, manifest/OG, favicon, emails, support/feedback copy, актуальный README и product docs. Исторические ADR/stages не переписывай.
10. На каждом child делай focused red-green, browser screenshots и обновляй artifact/handoff/Beads.

# Constraints

- Никакого global replace.
- Сохрани LICENSE, copyright/notices, AGPL source obligations, upstream provenance и исторические упоминания Postiz.
- Не переименовывай @contentfactory imports, legacy env keys, Prisma/table identifiers, Temporal names, provider slugs, OAuth parameters или public API contracts без отдельной доказанной миграции.
- Не меняй бизнес-логику ради дизайна; не добавляй providers, capabilities или AI/model calls.
- Не используй gradient text, glassmorphism, decorative grids, emoji UI icons, card walls, radius 24px+ или широкую тень вместе с border.
- Не выполняй push, deploy, real OAuth/social connection, live publication, paid call или user messaging.
- Не оставляй TODO/FIXME/HACK/XXX; реальный defer оформи в Beads.

# Verification

Проверь 1440/1024/768/390px, light/dark, 200% zoom, keyboard-only, focus return, reduced motion, длинные RU/EN строки и horizontal overflow. Сними auth, /launches, composer, media, integrations, analytics и settings. Контраст: обычный текст/placeholder >= 4.5:1, крупный текст/control boundaries >= 3:1.

Перед завершением epic выполни:
pnpm run build
pnpm test
git diff --check
scripts/orchestration/run_process_verification.sh

Обнови Graphify после принятого изменения и запиши graph-reviewed. Проведи review реального diff и browser evidence; исправь P0/P1.

# Output

В финале сообщи: результат каждого child, изменённые архитектурные поверхности, реально прошедшие команды, пути к screenshots/artifacts, разрешённые legacy Postiz references и оставшиеся bounded defers. Обнови Beads и handoff в соответствии с фактом.

# Stop

Если нужна новая пользовательская продуктовая развилка, секреты, внешняя запись или расширение полномочий — остановись и задай один конкретный вопрос. При техническом blocker не объявляй completion: зафиксируй его в Beads/handoff и дай точное следующее действие.
