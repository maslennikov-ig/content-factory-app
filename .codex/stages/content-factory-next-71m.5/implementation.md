# Исследование памяти бэкенда

## Исходный факт

Замер 2026-08-16 зафиксировал 380 600 KB RSS и 20 потоков для production
backend. В этой ветке сервер не открывался и production-значение не
переизмерялось. Локальные числа ниже показывают цену изолированного импорта,
а не аддитивное разложение 380 MB: пакеты разделяют код и зависимости.

## Путь запуска

- `AppModule` сразу подключает Database, API, Public API, Agent, Video, Chat и
  Temporal modules. Nest создаёт их singleton providers при построении app.
- `DatabaseModule` регистрирует около 50 repositories/services. Само число
  экземпляров не объясняет RSS: двадцать несоединённых `PrismaClient` в
  контрольном процессе добавили меньше 1 MiB RSS.
- `PrismaService` импортирует generated client и при module init подключается к
  БД. Изолированный импорт клиента дал медиану около 20.1 MiB RSS в текущем
  root-замере; native engine/pool без подключения к БД здесь не измерялись.
- `IntegrationManager` импортирует и создаёт 34 provider objects при оценке
  модуля. У них нет собственных конструкторов; главный вес приходит из
  статических SDK imports, а не из этих 34 объектов.
- `ChatModule` и безусловный `startMcp(app)` делают Mastra, Memory, PostgresStore,
  tools и MCP boot-reachable. Это следующий крупный кандидат, но его безопасная
  ленивая граница шире текущей задачи из-за auth gates, первого параллельного
  запроса и SSE lifecycle.
- CopilotKit уже исправлен в `main`: commit `5c916f45` заменил статический import
  на dynamic import после проверки AI configuration. Поэтому он не относится к
  текущему boot RSS, хотя изолированно стоит около 94 MiB RSS.
- `facebook-nodejs-business-sdk` отсутствует в manifest, lockfile и исходниках.
  Упомянутый в Beads SDK уже не является потребителем памяти.

## Изолированные измерения

Семь свежих процессов на импорт, Node 22.23.2, `--expose-gc`, четыре GC после
импорта, `TMPDIR=/tmp`, без сети и БД. Plain Node baseline: 45.19 MiB RSS.

| Импорт                | Медиана прироста RSS | IQR или пояснение                              |
| --------------------- | -------------------: | ---------------------------------------------- |
| `@prisma/client`      |            17.95 MiB | 16.00–18.10 MiB; обязательный generated client |
| `googleapis`          |            93.09 MiB | 90.85–96.60 MiB; heap +45.45 MiB               |
| `@copilotkit/runtime` |             94.6 MiB | уже не грузится при boot                       |
| `@mastra/core/mastra` |             94.9 MiB | boot-reachable через Chat/MCP                  |
| `@mastra/memory`      |             97.9 MiB | boot-reachable через agent construction        |
| `@mastra/pg`          |            116.9 MiB | boot-reachable через Mastra store              |

TS import-профиль реального `IntegrationManager` дал 202.62 MiB RSS
(IQR 202.20–203.07) и 3 305 загруженных модулей. Тот же профиль с одним
stub для `googleapis` дал 150.83 MiB (IQR 148.98–151.43): внутри этого графа
SDK отвечает примерно за 51.8 MiB RSS, 43.2 MiB heap и 909 модулей. Абсолютный
TS RSS включает `ts-node` и не переносится в production; парная разница —
более надёжная оценка выбранного шва.

После реализации семь холодных импортов `IntegrationManager` дали медиану
148.15 MiB RSS и ровно 2 396 модулей; `googleapis` отсутствовал в
`require.cache` во всех семи запусках. Разница с исходной медианой — 54.47 MiB
RSS. Это подтверждает прогноз на реальном import-графе, но по-прежнему не
является замером запущенного production-контейнера.

Исходники подтвердили три boot-reachable value imports: Google login, YouTube
и Google My Business. Это самый узкий кандидат: metadata и 34 provider objects
остаются синхронно доступны, а SDK нужен только при Google OAuth/provider
operation.

## Выбранное изменение

`googleapis` загружается одной memoized dynamic-import Promise при первом
Google-dependent вызове. Type-only imports не должны создавать runtime edge.
Это сохраняет URL, scopes, token/user shapes и список provider metadata, но
убирает крупный SDK из холодного запуска организаций, которые им не пользуются.

Измеренная разница в реальном import-графе — около 54.5 MiB RSS; точная экономия полного
backend может быть ниже из-за пересечения зависимостей. Production before/after можно честно получить только
после отдельного owner-controlled deploy; этот прогон ничего не публикует и к
серверу не подключается.

## Решения и границы уверенности

- Высокая: boot graph и отсутствие Facebook SDK подтверждены исходниками и
  generated CommonJS output.
- Средняя: ранжирование импортов; isolated RSS — верхний ориентир, не доли
  production RSS.
- Низкая: connected Prisma/native pool и полный-process saving без разрешённого
  локального стенда с БД и без нового production deployment.

`graph-reviewed: blocked` — `graphify-out/GRAPH_REPORT.md` и `graph.json` в
этой ветке отсутствуют; `graphify query` завершился `graph file not found`.

Отложенный production-контейнерный замер записан в
`content-factory-next-71m.7`; эта ветка не даёт разрешения на deploy, SSH или
доступ к серверу.
