# План стадии: интерфейсный долг раздела 6

**Цель:** закрыть девять Beads-задач одним воспроизводимым интерфейсным срезом.

**Подход:** сначала отдельный поток создаёт безопасный review-host и контракт
синтетических сценариев. Затем три изолированных потока переводят независимые
группы экранов. Последний последовательный поток сокращает общие реестры и
выносит геометрию ссылок публичной шапки в общий источник с `Button`.

**Не входит:** Admin Errors, внешняя platform-разметка, Stripe checkout,
provider/OAuth contracts, production, credentials, платные или живые вызовы.

**Spec:** `.codex/stages/content-factory-next-vme.2/spec.md`.

## Scope ledger

- Settings и admin users/stats -> `content-factory-next-2id`.
- Analytics и platform analytics -> `content-factory-next-k21`.
- Billing chrome -> `content-factory-next-s96`.
- Developer и Public API -> `content-factory-next-qzw`.
- Preview, extension и provider/OAuth chrome -> `content-factory-next-den`.
- Словесные aliases и customColor -> `content-factory-next-mzh`.
- Сырая Tailwind-палитра -> `content-factory-next-qn4`.
- Dark channel picker -> `content-factory-next-8e7`.
- Общая геометрия публичной шапки -> `content-factory-next-n25`.

## Поток 1: безопасный review-host

**Boundary:** локальный синтетический runtime, не production auth/data.

**Verification lane:** TDD-required — публичный fixture-contract и запрет
сетевых/живых подключений являются наблюдаемым поведением.

- [x] Сначала доказать отсутствие воспроизводимого авторизованного host.
- [x] Добавить локальный host с независимыми маршрутами/сценами и явным
  запретом внешних запросов.
- [x] Зафиксировать контракт состояний, темы, языка и ширины.
- [x] Передать стабильный интерфейс трём потребителям.

## Поток 2: Settings, Admin и channel picker

**Boundary:** settings, admin users/stats и выбор локальных каналов.

**Verification lane:** TDD-required — состояния, доступность и fixture.

- [x] Добавить RED-проверки отсутствующих состояний и review-coverage.
- [x] Перевести product-owned chrome на `cf-*` и общие примитивы.
- [x] Добавить dark fixture с Mastodon, Dev.to, Listmonk и raster mark.
- [x] Записать evidence manifest без живых подключений.

## Поток 3: Analytics и Billing

**Boundary:** analytics/platform analytics и product-owned billing chrome.

**Verification lane:** TDD-required — девять состояний и contract exclusions.

- [x] Добавить RED-матрицу состояний и точные исключения.
- [x] Перевести экраны, не подменяя provider metrics и Stripe markup.
- [x] Проверить RU/EN, обе темы и четыре ширины на review-host.

## Поток 4: Developer, Public API, Preview, Extension и OAuth

**Boundary:** product-owned chrome; протоколы и реальные ключи неизменны.

**Verification lane:** TDD-required — состояния и безопасные host boundaries.

- [x] Добавить RED-проверки состояния/контрактов каждого runtime boundary.
- [x] Перевести developer/public API и воспроизводимые product-owned shells.
- [x] Для невоспроизводимой границы создать точную blocker-задачу с причиной.

## Поток 5: общие реестры и публичная шапка

**Dependency:** после потоков 2–4, потому что владеет общими guards/tokens.

**Verification lane:** TDD-required — shrink-only реестры и API классов кнопки.

- [x] Измерить точные остатки до изменения.
- [x] Удалить только разрешения, потребители которых мигрированы.
- [x] Удалить хотя бы одну полностью неиспользуемую роль из `colors.scss`.
- [x] Дать `Button` и ссылкам шапки один источник геометрии/состояний.
- [x] Не расширять ни один allowlist.

## Корневая приёмка

- [x] Проверить артефакты потоков и соответствие write zones.
- [x] Запустить focused design/foundation/screen-review проверки.
- [x] Снять браузерную матрицу и channel-picker evidence.
- [x] Один раз выполнить release-набор на Node 22.23.2, pnpm 10.6.1,
  `TMPDIR=/tmp`, затем проверить документацию, Graphify и diff.
