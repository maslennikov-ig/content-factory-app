# Итог этапа `content-factory-next-ia0`

Статус: принят. Все локально выполнимые задачи объединены только в
`codex/remaining-epic-acceptance`; `main`, Git remote и production не
изменялись. Независимый review на `b2088b0b` завершился `ACCEPT` без
подтверждённых P0–P3.

## Результат для продукта

- Интерфейс использует общие контролы, семантические цвета и единые размеры.
  Плотные radio-варианты сохраняют 32 px визуально и имеют неперекрывающуюся
  мобильную область нажатия 44 px. Calendar сворачивает лишние отметки в
  доступный `+N`; четыре подтверждённых платформенных знака используют
  неизменённые first-party SVG.
- Старые публикационные ошибки очищаются owner-run процедурой с dry-run и
  90-дневным сроком, а новые записи не содержат тела публикации, секретов или
  пользовательских деталей. Отмена подписки восстанавливает частную запись
  события через Stripe webhook и дедуплицируется по конкретному переходу.
- Рассылка вызывается только через новую версионированную Temporal activity.
  Pending-переход арендуется атомарно; bounded retries, expiry recovery и
  lease-aware paging не дают старым ошибкам блокировать новые согласия.
- Product runtime, Mastra runtime и owner разделены. Bootstrap и preflight
  проверяют владение всеми объектами текущей БД, membership в обе стороны,
  точные разрешения и current/global/schema-scoped PUBLIC ACL. Backup/restore
  включает отдельную Mastra DB.
- Browser errors идут через same-origin relay с закрытым allowlist payload;
  IP, User-Agent, cookies, headers, URL query и произвольный пользовательский
  или модельный текст не принимаются и не пересылаются.

## Проверка

- Потоковые RED→GREEN доказательства и точные команды находятся в пяти
  валидных stage artifacts.
- Визуальное доказательство относится только к `/auth`: dark проверен на
  1440/1024/768/390, light — на 1440/768/390; также сохранены отдельные
  проверки клавиатурного фокуса и 200% zoom. Файл `auth-light-1024.png`
  отозван: это 390x844 byte-identical копия dark long-English capture, поэтому
  authenticated-экраны и light 1024 здесь не заявляются. Отобранное Lazyweb evidence:
  https://www.lazyweb.com/agentic-search/57f5b887-5ce6-454a-aa23-c94ebb61bb5c.
- PostgreSQL 17 proof включает будущие table/sequence/function в product и
  Mastra, повторное загрязнение global defaults и 9/9 role tests.
- Первый полный запуск выявил только интеграционные пробелы тестов и
  локализации: stale Prisma Client был штатно сгенерирован заново; доступный
  `+N` получил текст во всех 16 локалях; три source-loader теста получили
  новые внутренние модули; logo guard следует общему asset resolver. Повторный
  focused набор: 5 suites, 72 tests passed.
- Единственный полный release-набор выполняется root-owned closeout runner;
  точные команды, счётчики и результат являются источником истины в
  `acceptance-receipt.json` этого этапа.

## Решения и границы

- Тематические ветки `codex/remaining-design-consistency`,
  `codex/remaining-technical-debt` и `codex/remaining-infrastructure`
  сохранены как локальные deliverables. Их удаление — отдельное разрушительное
  действие и в этот этап не входит.
- Реальные базы, Temporal, Listmonk, Stripe, collector, аккаунты и ключи не
  использовались. Владелец отдельно применяет newsletter migration, запускает
  Errors cleanup, выполняет role/Mastra rollout и проверяет proxy logs.
- Owner-blocked `hb8 cxd 3aw c6k.16 cft 0c8 ry5.5 2ua`, частично измеренная
  `71m.7` и родительские эпики `71m c6k ry5` оставлены открытыми.
- `0pf` закрывается дубликатом `71m.5`; `ma1` и `uip` — дубликаты `71m.6` и
  друг друга. Реализованные 17 задач, эти три дубликата и `ia0` закрываются
  одним пакетом только после остановки агентов и успешного acceptance.

docs-reviewed: updated - обновлены runbooks, навигация, handoff, дизайн-реестры и эксплуатационные границы.

graph-reviewed: updated - Graphify 0.9.45 обновлён локально без внешних моделей; точные counts хранятся в локальном GRAPH_REPORT, focused newsletter query нашёл retry module/service/workflow и их связи.

documentation-decision: docs-resolve - @mastra/pg@1.8.5 exact L1 hit; @temporalio/client@1.15.0 and @temporalio/workflow@1.15.0 exact L1 hits.

cleanup-audit: blocked - тематические ветки и worktrees нужны как локальные результаты; disposable PostgreSQL и Windows browser profile удалены, но точный design Next dev на 4200 и связанный Playwright daemon/browser остались после завершённого потока. Их остановка и destructive cleanup веток/worktrees требуют отдельного разрешения; унаследованные MCP-процессы и чужие контейнеры не затрагивались.
