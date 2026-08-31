# Реализация: собственные продуктовые события

Статус: принят локально в `work/product-events`; не влит, не опубликован и не развёрнут.

## Решения

- Первый вопрос admin view: регистрация → первый подключённый канал для выбранной когорты.
- Четыре имён из Beads образуют allowlist в коде, а не Prisma enum, чтобы будущие события не требовали migration.
- User/org берутся только на сервере; admin response не включает связанные сущности.
- Register записывается сервером, потому что успешная регистрация не всегда выдаёт сессию.
- `cancel_subscription` не входит; follow-up `content-factory-next-sek`.

## TDD evidence

- Backend initial RED: 19/21 ожидаемых падений; после raw-envelope и security review цикл расширен до 36 кейсов с 12 ожидаемыми падениями.
- Backend GREEN: 36/36 — client allowlist, server-only register/channel, privacy/envelope bounds, tenant dedupe, atomic registration, OAuth actor/legacy skip, refresh refusal и DB-side cohort queries.
- Frontend initial GREEN: 10/10; reference-review RED: 4/15; corrected GREEN: 15/15.
- Locale gate RED: 306 отсутствующих locale/key пар. GREEN: 5 наборов, 35/35; по 22 непустых product-event ключа во всех 16 локалях.
- Root focused acceptance: 7/7 наборов, 142/142 — product events, external purge, design/foundation/contrast и choice controls.
- Независимые backend security/correctness и final UI reference reviews: ACCEPT, открытых P0–P3 нет.

## Реализованное поведение

- `ProductEvent` хранит только имя, opaque organization/user IDs, время, bounded Json и tenant-scoped deduplication key.
- `register` записывается атомарно с созданием организации и пользователя, даже когда регистрация не выдаёт сессию.
- `channel_added` пишется после подтверждённого создания integration; refresh и legacy OAuth state не создают ложных событий.
- Аутентифицированный receiver принимает только `purchase` и `lifetime_claimed`; ID, время, server-owned события и лишние поля подделать нельзя.
- Admin endpoint считает когорту в БД, не загружает список organization IDs в процесс и возвращает только scalar identifiers.
- Admin UI первым отвечает на register → first channel, затем показывает четыре totals/latest и честно ограниченную ленту последних 50 событий.
- Покупка считается только после payment status 2; lifetime claim — только после success с SHA-256 dedupe, без отправки claim-кода.

## Reference comparison

- Mixpanel: взяты один ясный предмет анализа и честный empty state; ложная четырёхшаговая funnel-семантика отвергнута.
- Dub: взяты компактный период, резюме и спокойная плотность; KPI-wall и недостоверный time-series отвергнуты.
- Calendly: период расположен рядом с объёмами; export/customization не добавлены.
- Amplitude: обзор связан с точной таблицей; query builder и trend без точного дневного агрегата не добавлены.

Стабильная частная подборка: https://www.lazyweb.com/agentic-search/12991b9d-7210-46c8-9233-3563b1bc3ece

## Root gates

- `pnpm test`: 72/72 Jest suites, 640 passed, 1 skipped; Python 6/6.
- `pnpm run build`: frontend, backend и orchestrator; production route `/admin/product-events` присутствует.
- `node scripts/branding/brand-scan.cjs`: 0 unexplained / 7 allowlisted.
- `bash scripts/orchestration/run_process_verification.sh`: OK.
- `git diff --check` и Prisma validate без соединения с БД: OK.

Первый test gate обнаружил отсутствующие локали; первый build gate — форму discriminant narrowing при `strictNullChecks: false`. Оба дефекта исправлены и соответствующие полные шлюзы повторены до exit 0.

## Ограничения

- Prisma schema не применялась и migration не генерировалась; production step остаётся владельцу через guard задачи 1.
- Реальная PostgreSQL transaction/concurrency/query plan и настоящий Nest HTTP pipeline не поднимались.
- Browser review на 390–1440px, обеих темах, 200% zoom и screen reader не выполнялся; структурные и design guards зелёные.
- Переводы проверены автоматикой, но не проходили отдельную редактуру носителями всех 15 non-English языков.
- `cancel_subscription` остаётся в `content-factory-next-sek`.
