# Спецификация завершения оставшихся задач

## Результат

Все локально выполнимые задачи эпика `content-factory-next-ia0` доведены до
готовых тематических веток. В `main` ничего не сливается и не отправляется;
production, реальные аккаунты, секреты, платные вызовы и боевые базы не
затрагиваются. Задачи владельца и наполовину измеренная `71m.7` остаются
открытыми с актуальными фактами.

## Решения

- Дизайн не получает нового визуального направления. Все изменения сводят
  существующие экраны к `DESIGN.md`, девяти типографическим токенам, `cf`-цветам,
  общим формам и полному набору состояний. Lazyweb служит только источником
  паттернов иерархии и состояний: https://www.lazyweb.com/agentic-search/57f5b887-5ce6-454a-aa23-c94ebb61bb5c.
- Платформенные знаки заменяются только официальными SVG с проверяемым
  происхождением и разрешённым использованием. Знак не перерисовывается, не
  перекрашивается и не обрезается. Для остальных сохраняется растр и записывается
  причина.
- Legacy `Errors` получает положительно определённый безопасный payload,
  ограниченное хранение и отдельный owner-run dry-run/apply путь. Агент не
  применяет очистку к данным. Начальная рабочая гипотеза хранения — 30 дней,
  как у принятого собственного сборщика; исполнитель обязан подтвердить её
  текущими сценариями Admin Stats и истории публикации.
- Повтор согласованной подписки строится на новом versioned Temporal
  workflow/activity или на доказанно более узком долговечном механизме. Ни один
  существующий upstream workflow/activity contract не меняется.
- `cancel_subscription` записывается на авторитетном серверном переходе после
  успешной отмены. Клиентский клик не считается успехом; повтор того же перехода
  не создаёт вторую запись.
- PostgreSQL разделяется на DML-only product runtime роль и отдельную границу
  Mastra. Предпочтительный вариант — отдельная Mastra database/role, если
  документация pinned `@mastra/pg` подтверждает отдельный connection string;
  runtime роль не владеет схемой и не может подключиться к Listmonk DB.
- Browser error relay принимает только фиксированную схему, не пересылает и не
  сохраняет IP, User-Agent, cookies, headers, URL/query, произвольные сообщения,
  содержимое постов или модельные данные. Для его first-party ingress access log
  отключён точечно; отказ сборщика не влияет на пользовательский запрос.

## Отказы и откат

- Каждая тематическая ветка откатывается независимо до общей координационной
  базы. Финальное объединение допускается только в отдельной локальной ветке
  приёмки, никогда не в `main`.
- Любая Prisma-схема поставляется миграцией и проходит
  `validate-prisma-migration-sql.cjs`; `prisma db push` запрещён.
- Любой новый guard сначала демонстрирует красный сценарий при возврате дефекта.
- Неясность, требующая production, секрета, платного вызова, внешней публикации,
  merge в `main` или расширения области, останавливает только соответствующий
  поток и возвращается корневому агенту.

## Доказательство

Потоки запускают только точечные red-green проверки. Корневой агент после
локальной интеграции запускает полный набор ровно один раз: `pnpm test`,
`pnpm run build`, brand scan, docs check, process verification и diff check.
Дизайн дополнительно подтверждается неизменным или меньшим размером ledgers,
design guard/contrast и скриншотами обеих тем на контрольных ширинах.

## Технический premortem

**Вердикт: GO WITH CONDITIONS.** Все изменения обратимы как код веток; data
cleanup, role rollout и production wiring остаются только читаемыми owner-run
процедурами и здесь не выполняются.

**Blast radius:** UI tokens/primitives → десятки экранов и guards; legacy
`Errors`/`ProductEvent`/newsletter → Prisma, admin history, auth и Temporal;
PostgreSQL roles → cf-app, Mastra init, Listmonk isolation, backup/restore;
browser relay → browser runtime, first-party Nginx/Next ingress, sanitizer и
GlitchTip transport.

| Симптом отказа | Evidence | Механизм и поверхность | Обнаружение | Условие/смягчение | Решение |
|---|---|---|---|---|---|
| cf-app не стартует с новой ролью | confirmed | pinned Mastra выполняет DDL при init | role-matrix и local startup contract | docs-resolve, отдельная Mastra DB/role, запрет owner grants product runtime | preflight |
| backup не содержит новую Mastra DB | plausible | новый database boundary не попал в manifest/restore | disposable restore proof | расширить manifest, checksum и restore contract до rollout | block до proof |
| relay сохраняет IP/UA несмотря на sanitizer | confirmed | сетевые данные возникают до event payload | Nginx config contract и request-capture proof | отдельный location с access log off; не пересылать headers | block до proof |
| relay становится abuse proxy или задерживает UI | plausible | открытый ingress и outage collector | rate-limit/outage tests | fixed schema/target, малый body, timeout, fire-and-isolate | preflight |
| retry создаёт дубли или меняет upstream contract | confirmed | повтор side effect и запрещённая мутация workflow | deterministic retry/idempotency tests | новый versioned workflow/activity и устойчивый idempotency key | block до proof |
| cleanup стирает нужную историю | plausible | retention/backfill меняют существующие строки | dry-run counts и Admin Stats/history tests | положительный payload, owner-run apply, backup/rollback docs | preflight |
| cancel event появляется после неуспеха или дважды | plausible | клиентский click/webhook retry | success/failure/replay tests | authoritative server success + unique idempotency boundary | block до proof |
| широкая UI-миграция ломает тему, фокус или длинную строку | confirmed | общие JSX и shrink-only ledgers | guards, обе темы, 4 ширины, keyboard/zoom | строгий порядок задач, общие primitives, screenshot proof | preflight |
| исполнитель правит чужую ветку или придумывает API | plausible | параллельные writers и versioned behavior | git status/diff + docs decision | worktree/write-zone stop rule, docs-resolve до reliance | preflight |

**Recovery:** код откатывается до `1c650d09` отдельно в каждой тематической
ветке. Additive schema может остаться до roll-forward; destructive cleanup не
запускается без owner-run backup и dry-run. При role rollout старая роль не
отзывается до preflight/startup/restore proof, а при ошибке конфигурация
возвращается к прежнему connection string. Relay отключается удалением одного
first-party route/config switch без изменения сохранённых пользовательских
данных.
