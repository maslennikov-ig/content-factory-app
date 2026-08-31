# Выбор встроенного редактора изображений

Дата проверки источников: **2026-08-20**. Решение относится к Content Factory на
Next.js 16, React 19 и TypeScript. Юридическая совместимость ниже — инженерная
оценка текста лицензий, а не юридическое заключение.

## 1. Рекомендация

**Основной выбор — Fabric.js 7.4.0.** MIT разрешает включение и распространение
кода в AGPL-продукт, а браузерный пакет не требует ключа, телеметрии или сервиса
поставщика ([LICENSE](https://github.com/fabricjs/fabric.js/blob/master/LICENSE),
[README](https://github.com/fabricjs/fabric.js/blob/master/README.md)). Библиотека
даёт нужные примитивы — интерактивный текст, изображения, фигуры, кисти,
порядок слоёв, сериализацию и raster export — но мы осознанно оцениваем создание
доступного продуктового интерфейса и истории действий в **24 инженерных дня**,
а не выдаём canvas-библиотеку за готовый редактор
([core concepts](https://fabricjs.com/docs/core-concepts/),
[cropping controls](https://fabricjs.com/demos/cropping-controls/)). Выбор
проигрывает, если прототип не проходит кириллический PNG/JPEG export, запрет
внешней сети или удержание браузерной памяти на согласованных лимитах.

**Резерв — Filerobot Image Editor 4.9.1.** Это MIT-редактор с готовыми crop,
resize, rotate/flip, annotation/drawing, history, crop presets и callback
сохранения; вызов удалённого сервиса переводов явно отключается через
`useBackendTranslations: false`, а cloud mode по умолчанию выключен
([README/config](https://github.com/scaleflex/filerobot-image-editor)). Он
сокращает оценку до **14 дней**, но требует локальных переводов и шрифтов,
отдельного слоя порядка объектов, проверки React 19 и доказательства нулевой
сети. Резерв проигрывает при любом скрытом запросе, несовместимости с React 19,
дефекте кириллицы или невозможности сделать управление слоями и клавиатурой без
форка upstream.

**Почему не оставить Polotno на дешёвом тарифе:** опубликованный grass-roots
тариф всё равно стоит $249/месяц ($2,490/год), требует ручного допуска и
сохраняет license verification; стандартный тариф — $899/месяц или $9,990/год
([pricing](https://polotno.com/sdk/pricing)).

Принятое допущение: один инженерный день стоит **$800**, а одинаковая
self-hosted сборка обслуживает 5 и 50 пользователей без оплаты за место.

## 2. Дисквалифицированные и исключённые кандидаты

| Кандидат | Решение по воротам | Подтверждённый факт |
|---|---|---|
| Polotno | **Дисквалифицирован: лицензия и неизбежный vendor-call.** Остальные критерии не ранжируются после провала ворот. | Проприетарная, подписочная, непередаваемая лицензия; исходный код не входит. Сам поставщик подтверждает HTTPS license verification и vendor-managed stock/font endpoints ([license](https://polotno.com/legal/license), [pricing/privacy FAQ](https://polotno.com/sdk/pricing)). |
| Pintura | **Дисквалифицирован: несовместимые права распространения.** | Лицензия revocable/non-transferable; запрещает предоставлять части Software третьим лицам и распространять Software отдельно, а OEM требует custom plan. Это несовместимо с публикацией полного AGPL source tree без отдельного письменного разрешения ([license, updated 2025-11-13](https://pqina.nl/pintura/license/), [pricing/OEM](https://pqina.nl/pintura/pricing/)). |
| tldraw | **Дисквалифицирован: source-available SDK, downstream key.** | Продакшен требует действующий ключ; SDK не open source, а каждый downstream-пользователь открытого продукта должен получить свою лицензию. Trial отправляет hash ключа поставщику ([official license docs](https://tldraw.dev/community/license), [license key](https://tldraw.dev/sdk-features/license-key)). |
| Photopea iframe | **Дисквалифицирован: неизбежный внешний origin.** | Официальный API встраивает `https://www.photopea.com` в iframe. Файлы заявлены как локально обрабатываемые, но сам редактор, реклама/аккаунт и его код остаются внешним сервисом, который нельзя включить в нашу offline-сборку ([API](https://www.photopea.com/api/), [privacy](https://www.photopea.com/privacy.html)). |

**Penpot не провалил лицензионные ворота**, но исключён из финальной пары по
архитектуре. MPL-2.0 допускает совместное распространение при сохранении
file-level условий, однако Penpot — отдельное приложение с frontend, backend,
хранилищем и headless-browser exporter, а не клиентская библиотека
([LICENSE/repository](https://github.com/penpot/penpot),
[exporter architecture](https://help.penpot.app/technical-guide/developer/architecture/exporter/),
[self-hosting](https://help.penpot.app/technical-guide/getting-started/)). Публичной
первичной документации для поддерживаемого встраивания полного workspace как
редактора Content Factory не найдено; обычная интеграция добавляет отдельный
аккаунт, БД, storage и exporter.

## 3. Сравнение кандидатов, прошедших лицензионные ворота

Сокращения: «лок.» — только наши локальные assets; «не подтв.» — первичный
источник не даёт точного обещания.

| Кандидат | 1. Лицензия | 2. Сеть | 3. Floor | 4. Лиц./год | 5. Build | 6. Здоровье | 7. React/Next/TS/SSR | 8. Кириллица/шрифты | 9. Доступность |
|---|---|---|---|---:|---:|---|---|---|---|
| **Fabric.js 7.4.0** | MIT, проходит | Нет встроенного vendor-call | Все примитивы; UI/история нужны | $0 | 24 дн. | Активен, release 2026-05-18 | Typed; browser entry; React-neutral; client boundary | Multibyte/composition; лок. font и export-test нужны | Canvas не семантичен; весь keyboard/ARIA UI наш |
| **Filerobot 4.9.1** | MIT, проходит | Переводы remote по умолчанию, отключаются; cloud off | 6 готово, 2 требуют работы | $0 | 14 дн. | Коммиты 2026, release 2024-12-30 | peer React >=17; TS complaints открыты; SSR не подтв. | Font задаёт host; кириллица не подтв. | Не заявлена; keyboard audit нужен |
| **Konva 10.3.1 + react-konva 19.2.5** | MIT, проходит | Нет встроенного vendor-call | Примитивы; почти весь editor UI наш | $0 | 30 дн. | Очень активен, releases 2026-08-15/20 | Точное peer React ^19.2; Next client официально; typed | Host font + redraw; кириллица не подтв. | Keyboard не встроен, делаем сами |
| **TOAST UI 3.15.3** | MIT, проходит | Vendor-call не найден; deny-test обязателен | Почти готов, layers/presets требуют работы | $0 | 18 дн. | Заброшен: release 2022, commit 2022 | Старый React wrapper/Fabric 4.2; React 19 не подтв. | Не подтв.; bundled font нужен | Не подтв.; старый UI |
| **Excalidraw 0.18.1** | MIT, проходит | Library локальна; embeds/links надо выключить | Сильный whiteboard, слабее photo editor | $0 | 20 дн. | Активен, release 2026-04-21 | peer React 17/18/19; Next ESM documented | Bundled fonts; кириллица export не подтв. | Много shortcuts/ARIA, но известны keyboard gaps |
| **miniPaint 4.14.3** | MIT, проходит | Self-host локален, но Google Fonts API надо удалить | Почти весь floor готов | $0 | 22 дн. | Активен, release 2026-04-20, bus factor 1 | Готовое приложение, не React library; SSR неприменим | Google Fonts path; лок. Cyrillic fork нужен | Keyboard shortcuts есть; screen-reader status не подтв. |
| **Penpot 2.17.1** | MPL-2.0, проходит с notice/source obligations | Self-host без vendor-call, но требует свой backend/exporter | Функции есть, client-only floor нет | $0 + infra | 35 дн. | Очень активен, release 2026-08-17 | Не React component; отдельный stack | Upload fonts; Cyrillic не проверен здесь | Продуктовая UI; embed accessibility не подтв. |

Источники интеграционной совместимости: Fabric публикует отдельные browser/node
entrypoints и встроенные types ([README](https://github.com/fabricjs/fabric.js/blob/master/README.md));
react-konva 19.2.5 объявляет peer React/ReactDOM `^19.2.0`, а документация говорит,
что Konva 10 работает в Next.js без server canvas и server render даёт пустой
`div` ([package.json](https://github.com/konvajs/react-konva/blob/master/package.json),
[Next.js usage](https://github.com/konvajs/react-konva#usage-with-nextjs)); Excalidraw
0.18 объявляет React 19 peer и документирует ESM imports для Next
([package.json](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/package.json),
[release notes](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.0)). Для
точного React 19.2 проекта версия react-konva должна совпасть с React minor;
совместимость только с React 19.0/19.1 из публичного диапазона не следует.

## 4. Матрица восьми обязательных функций

«Готово» означает публично документированную функцию продукта; «доработать» —
есть primitive/API, но нужен наш UI, adapter или hardening; «нет» — кандидат не
может выполнить требование в заданной архитектуре.

| Требование | Fabric | Filerobot | Konva | TOAST UI | Excalidraw | miniPaint | Penpot |
|---|---|---|---|---|---|---|---|
| 1. Открыть media и вернуть PNG/JPEG | Доработать: load/export + Uppy adapter | Доработать: `source`/save callback + upload | Доработать: Image + `toDataURL` + upload | Доработать: load/download API + upload | Доработать: image import/`exportToBlob` + upload | Доработать: host bridge вместо download | Доработать: отдельные asset/export APIs |
| 2. Crop/resize/rotate/flip | Доработать: controls/primitives есть | **Готово** | Доработать | **Готово** | Доработать: crop есть, photo transforms неполны | **Готово** | **Готово** в отдельном приложении |
| 3. Текст, локальные fonts, Cyrillic | Доработать: IText + host fonts + proof | Доработать: host font + Cyrillic proof | Доработать: Text + DOM input + font redraw | Доработать: Text + font/proof | Доработать: font set есть, Cyrillic proof | Доработать: заменить Google Fonts локальными | Доработать: upload font + proof |
| 4. Фигуры и рисование | Доработать: shapes/brush primitives | **Готово** | Доработать: shapes/Line | **Готово** | **Готово** | **Готово** | **Готово** |
| 5. Слои: порядок/move/delete | Доработать: stack API/selection есть | Доработать: selection есть, reorder не подтверждён | Доработать: React state/order | Доработать: objects есть, layer panel/reorder нет | **Готово** | **Готово** | **Готово** |
| 6. Social presets/templates | Доработать: наши размеры/JSON | **Готово**: crop preset config | Доработать: наши размеры/state | Доработать | Доработать: frame/template adapter | Доработать | **Готово**: boards/export presets |
| 7. Undo/redo | Доработать: наша snapshot history | **Готово** | Доработать: официальная React recipe | **Готово** | **Готово** | **Готово** | **Готово** |
| 8. Полностью client-side, zero third-party | **Готово** при локальных assets | Доработать: remote translations off, cloud off, deny-test | **Готово** при локальных assets | Доработать: deny-test | Доработать: embeds/links off, deny-test | Доработать: self-host + удалить Google Fonts/API | **Нет**: backend/storage/exporter обязательны |

Подтверждения функций: Fabric
[core concepts](https://fabricjs.com/docs/core-concepts/) и
[text/i18n](https://fabricjs.com/docs/old-docs/fabric-text/); Filerobot
[README/config](https://github.com/scaleflex/filerobot-image-editor); Konva
[export](https://konvajs.org/docs/react/Canvas_Export.html),
[undo/redo](https://konvajs.org/docs/react/Undo-Redo.html) и
[keyboard](https://konvajs.org/docs/events/Keyboard_Events.html); TOAST UI
[README](https://github.com/nhn/tui.image-editor); miniPaint
[README](https://github.com/viliusle/miniPaint); Penpot
[export](https://help.penpot.app/user-guide/export-import/exporting-layers/).

## 5. Модель полной стоимости за год

Расчёт: **$800/инженерный день**, один релиз для одного self-hosted instance,
без НДС, зарплатной индексации и обще-проектной инфраструктуры. Это сравнительная
модель, не оферта. Сопровождение первого года включает обновления, security
review, browser/network regression и исправления интеграции.

| Кандидат | Лицензия/инфра | Build | Сопровождение 1-й год | TCO 5 пользователей | TCO 50 пользователей |
|---|---:|---:|---:|---:|---:|
| Fabric.js | $0 | 24 дн. = $19,200 | 8 дн. = $6,400 | **$25,600** | **$25,600** |
| Filerobot | $0 | 14 дн. = $11,200 | 10 дн. = $8,000 | **$19,200** | **$19,200** |
| Konva/react-konva | $0 | 30 дн. = $24,000 | 8 дн. = $6,400 | **$30,400** | **$30,400** |
| TOAST UI | $0 | 18 дн. = $14,400 | 15 дн. = $12,000 | **$26,400** | **$26,400** |
| Excalidraw | $0 | 20 дн. = $16,000 | 10 дн. = $8,000 | **$24,000** | **$24,000** |
| miniPaint | $0 | 22 дн. = $17,600 | 14 дн. = $11,200 | **$28,800** | **$28,800** |
| Penpot | $240/год modelled local infra | 35 дн. = $28,000 | 15 дн. = $12,000 | **$40,240** | **$40,240** |

Для полноты дисквалифицированные коммерческие baseline: Polotno grass-roots
$2,490/год и standard $9,990/год независимо от 5/50 пользователей по
опубликованному single-domain тарифу; Pintura Developer €749/год **за developer
seat**, но OEM/AGPL redistribution требует отдельного согласования; tldraw
commercial price публично не указан; Photopea API free, но остаётся внешним
iframe. Эти цены не делают кандидатов допустимыми.

Оценка Fabric 24 дня: canvas/state/export 5; crop/transform 4; text/fonts 3;
layers/history/presets 5; media/Uppy roundtrip 2; accessible responsive UI 3;
network/security/performance tests 2. Filerobot экономит готовый UI и history,
но 14 дней всё равно нужны на adapter, local assets/translations, layer gap,
React/Cyrillic/accessibility hardening и тесты.

## 6. Состояние сопровождения

Даты ниже получены из официальных GitHub release/commit endpoints 2026-08-20.
Число открытых issues — снимок, а не тренд; первичного исторического ряда для
«issue trend» не найдено.

- **Fabric.js:** 7.4.0 опубликован 2026-05-18; последний commit в снимке
  2026-08-08, repository pushed 2026-08-18; 468 open issues. Несколько активных
  maintainers/contributors, но точный bus factor не опубликован
  ([releases](https://github.com/fabricjs/fabric.js/releases),
  [commits](https://github.com/fabricjs/fabric.js/commits/master)). В 2026 был
  исправлен SVG export advisory; stage использует raster export, однако
  untrusted import/export всё равно требует ограничений
  ([GHSA-hfvx-25r5-qc3w](https://github.com/fabricjs/fabric.js/security/advisories/GHSA-hfvx-25r5-qc3w)).
- **Konva/react-konva:** Konva 10.3.1 — 2026-08-15, react-konva 19.2.5 —
  2026-08-20; оба имели commits 2026-08-20, 14 и 3 open issues соответственно.
  Компания не заявлена; заметна сильная зависимость от Anton Lavrenov, поэтому
  bus factor оценивается как риск, а не подтверждённое число
  ([Konva releases](https://github.com/konvajs/konva/releases),
  [react-konva releases](https://github.com/konvajs/react-konva/releases)).
- **Filerobot:** последний published release 4.9.1 — 2024-12-30, последний
  commit в снимке 2026-06-04, 88 open issues. Поддерживается Scaleflex, но
  релизный разрыв и открытые TypeScript/custom-font/responsive issues повышают
  интеграционный риск
  ([releases](https://github.com/scaleflex/filerobot-image-editor/releases),
  [issues](https://github.com/scaleflex/filerobot-image-editor/issues)).
- **TOAST UI Image Editor:** release 3.15.3 — 2022-04-25; последний code commit
  2022-10-13, repository pushed 2023-11-20; 289 open issues. Зависимость на
  Fabric 4.2.0 и отсутствие релизов более четырёх лет означают фактическую
  заброшенность для нового React 19 проекта
  ([release](https://github.com/nhn/tui.image-editor/releases/tag/v3.15.3),
  [repository](https://github.com/nhn/tui.image-editor)).
- **Excalidraw:** 0.18.1 — 2026-04-21; последний commit 2026-08-16; 3,352 open
  issues отражают большой продукт, а не только SDK. Компания/широкая community
  уменьшают bus-factor risk, точное значение не опубликовано
  ([releases](https://github.com/excalidraw/excalidraw/releases),
  [commits](https://github.com/excalidraw/excalidraw/commits/master)).
- **miniPaint:** 4.14.3 — 2026-04-20; последний commit 2026-04-19; 47 open
  issues. Основной maintainer один (`viliusle`), поэтому bus factor — высокий
  риск; релиз 4.14.3 прямо упоминает обновление Google Fonts API key
  ([releases](https://github.com/viliusle/miniPaint/releases),
  [repository](https://github.com/viliusle/miniPaint)).
- **Penpot:** 2.17.1 — 2026-08-17; commits 2026-08-20; 748 open issues.
  Активно поддерживается Kaleidos и community
  ([releases](https://github.com/penpot/penpot/releases),
  [commits](https://github.com/penpot/penpot/commits/develop)).

## 7. Неподтверждённые утверждения и пробелы

- Ни один первичный источник не обещает именно **Next.js 16**; подтверждены
  browser/Next patterns, а точная версия проверяется только нашим build.
- Fabric React-neutral; точная React 19 совместимость является свойством нашей
  оболочки. Для react-konva подтверждён React **19.2**, но не 19.0/19.1.
- Публичные первичные источники не дают надёжный minified+gzip bundle size для
  всех кандидатов в одинаковой конфигурации. Konva source package ставит limit
  45 KB для core build, остальные размеры измеряются только после lockfile.
- Нет первичного подтверждения кириллического raster export для Fabric,
  Filerobot, Konva, TOAST UI, Excalidraw, miniPaint или Penpot. Browser canvas
  и multibyte claims недостаточны: нужен наш тест `Привет, ёжик — №42` с
  локально загруженным font и pixel/export assertion.
- Filerobot объявляет `react >=17` и `react-konva >=17`, но не публикует
  отдельную матрицу React 19/Next 16; открыты TypeScript и custom-font issues.
- Не найдено публичного доказательства полного WCAG соответствия ни у одного
  кандидата. У Konva keyboard events явно не встроены; у Excalidraw есть
  известный Deque audit issue по keyboard-only canvas и focus
  ([issue #7492](https://github.com/excalidraw/excalidraw/issues/7492)).
- Filerobot документирует отключение backend translations и cloud mode, но
  отсутствие иных запросов доказывается только runtime deny-test, не README.
- miniPaint заявляет «ничего не отправляется на сервер», но текущий release
  использует Google Fonts API; обещание верно только после self-host fork,
  удаления этого пути и deny-test.
- Публичного стабильного host API для встраивания miniPaint как React component
  и возврата Blob не найдено. Официальный README показывает внешний iframe,
  поэтому production fork/bridge — наша ответственность.
- У Penpot не найден поддерживаемый API для встраивания полного workspace в
  Content Factory без отдельного приложения и учётной записи.
- Цены Polotno/Pintura могут измениться; tldraw commercial и Penpot operational
  cost публично не зафиксированы. В модели Penpot $20/месяц — наше допущение.
- Тренд open issues и точный bus factor не выводятся из одного API snapshot;
  они оставлены неизвестными, а не заменены догадкой.

## 8. Что изменит рекомендацию

Fabric перестанет быть основным выбором, если любой из следующих фактов
подтвердится на pinned-версии в нашем приложении:

1. runtime network-deny test фиксирует обращение не к Content Factory;
2. локальный кириллический font не даёт стабильный PNG/JPEG export;
3. 24-дневная оценка после двухдневного spike вырастает выше 32 дней из-за
   crop, history или accessible layer controls;
4. browser memory/CPU limits не удерживают согласованный максимальный media;
5. лицензия или transitive dependency перестаёт быть AGPL-совместимой.

Filerobot станет основным выбором, только если двухдневный spike одновременно
докажет: React 19/Next 16 production build; ноль внешних запросов с локальными
переводами/fonts; корректную кириллицу в PNG/JPEG; управляемый порядок слоёв;
keyboard/focus state без upstream fork. При провале любого пункта он остаётся
резервом или исключается.

Рекомендацию также изменит письменная лицензия поставщика, явно разрешающая
публикацию и downstream redistribution всего SDK под совместимыми с AGPL
условиями **без** обязательного ключа/validation call и с меньшим годовым TCO.
Маркетингового письма или скидки без изменения прав недостаточно.
