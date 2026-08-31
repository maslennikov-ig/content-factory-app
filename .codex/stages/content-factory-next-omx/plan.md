# План: собственные продуктовые события

## Решение

Добавить аддитивную `ProductEvent` и собственный приёмник четырёх событий `register`, `purchase`, `channel_added`, `lifetime_claimed`. Пользователь и организация всегда берутся из доверенного серверного контекста; тело клиентского запроса не может подменить их. Регистрация записывается на сервере после создания аккаунта, потому что при approval/email activation у нового пользователя ещё нет сессии. Остальные подтверждённые пользовательские успехи используют восстановленный `useFireEvents`, который обращается только к относительному собственному endpoint.

Первый вопрос админки: «Среди организаций, зарегистрировавшихся в выбранный период, сколько подключили первый канал и какова доля?» Ниже экран показывает количество и последнее время всех четырёх событий. Полную воронку из четырёх событий интерфейс не изображает: код и продуктовый контракт не доказывают такой порядок.

## Дизайн и референсы

Стабильная подборка: https://www.lazyweb.com/agentic-search/12991b9d-7210-46c8-9233-3563b1bc3ece

- Mixpanel `screens:50cc43d8d5884720b33163cc`: явный выбранный шаг и полезное пустое состояние; семантику полной воронки не копируем.
- Dub `screens:e18d93010d980b48c8ba3f67`: компактный контекст периода и спокойная иерархия данных; временной график не копируем без отдельного точного дневного агрегата, как и ряд одинаковых KPI-карточек.
- Calendly `screens:b503c11084cbdbac759625be`: период рядом с объёмом и популярными событиями; фильтр остаётся ограниченным и понятным.
- Amplitude `screens:3acadd638824c564d9f534e0`: обзор связан с точной таблицей; сложный конструктор и тренд без поддержанного агрегата не нужны для первого админского просмотра.

Сверка после реализации обязательна для иерархии, плотности, фильтров, loading/empty/error/access/long-content, мобильной раскладки, обеих тем и 200% zoom.

## Риски и условия

- **Подмена tenant/user:** DTO принимает только имя, свойства и ключ дедупликации; controller подставляет ID из запроса. Admin GET повторяет `assertSuperAdmin` и не подключает отношения User/Organization.
- **Персональные данные:** свойства ограничены размером и глубиной; персональные ключи отвергаются рекурсивно и без учёта регистра, а не молча удаляются. Серверные события используют пустые или явно безопасные свойства.
- **Повторная доставка:** уникальный tenant-scoped deduplication key превращает повтор в успешный no-op. Событие регистрации имеет серверный стабильный ключ; точки purchase/channel/lifetime используют ID подтверждённой операции либо стабильную семантику единственного результата.
- **Ложные события:** `?check=` сам по себе не считается покупкой; событие возникает только после `CheckPayment status === 2`. `channel_added` привязывается к подтверждённому созданию интеграции, а не к одному query marker.
- **Нагрузка:** POST имеет собственный rate limit и ограничение JSON; admin range и recent list ограничены. Prisma использует индексы и `groupBy`, raw SQL запрещён.
- **Миграция/откат:** схема только записывается в ветке; ни локальная, ни production БД не меняется. До развёртывания откат — revert единственного коммита. После будущего аддитивного применения таблица может остаться неиспользуемой при откате кода.
- **Расхождение истории:** Beads говорит 5 вызовов/4 события, история — 6/5. Beads выигрывает; `cancel_subscription` вынесен в `content-factory-next-sek`.

Verdict: **GO WITH CONDITIONS** — RED обязан доказать server-derived IDs, отказ персональных свойств, дедупликацию, регистрацию без сессии, покупку только после статуса 2, superadmin-only просмотр и отсутствие внешнего адреса.

## Критерии и реализация

### Backend и данные

**Граница:** Prisma schema, DTO/privacy validation, repository/service, authenticated receiver, server-side register/channel seams, admin aggregation. **Verification lane:** `tdd-required` — новая таблица, tenancy, privacy и idempotency.

- [x] RED: тесты на schema/query shape, server-derived IDs, privacy refusal, duplicate no-op, unauthenticated registration success path и superadmin refusal.
- [x] GREEN: модель, repository/service, endpoints и достоверные серверные точки.
- [x] Заполнить `.codex/stages/content-factory-next-omx/artifacts/backend.md`.

### Hook и админский интерфейс

**Граница:** относительный `useFireEvents`, подтверждённые client seams, admin route/nav/component/locales. **Verification lane:** `tdd-required` — наблюдаемая доставка и новый интерфейс.

- [x] RED: тесты hook payload/call timing и admin normal/loading/empty/error/access/long-content states.
- [x] GREEN: hook, call sites, admin view и доступная адаптивная реализация на `cf-*` токенах/shared primitives.
- [x] Сопоставить финальный экран с четырьмя закреплёнными референсами и заполнить `.codex/stages/content-factory-next-omx/artifacts/frontend.md`.

## Приёмка

После объединения потоков root запускает один сфокусированный набор, независимые correctness/security/UI reviews и затем четыре task gate на Node 22.23.2 с `TMPDIR=/tmp`: `pnpm test`, `pnpm run build`, brand scan, process verification. Также обязательны `git diff --check`, проверка Prisma format и external-services purge. Ни одна база, сервер или внешний приёмник не используются.

## Не входит

- `cancel_subscription` и будущие события публикации/ошибок/первого поста.
- Self-hosted Umami, любой сторонний адрес или аналитический SDK.
- Применение Prisma schema, seed/backfill, deploy, push, merge, SSH и работа с production.
- Произвольный конструктор отчётов или доказательно несуществующая четырёхшаговая воронка.
