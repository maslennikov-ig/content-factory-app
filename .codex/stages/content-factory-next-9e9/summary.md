# Итог стадии content-factory-next-9e9

Четвёртая стадия оставшейся программы реализована и принята единой
release-приёмкой. Исследовательские решения были приняты до кода; точечные
RED→GREEN-доказательства и исправления независимых проверок находятся в
`artifacts/` и `evidence/`.

## Принятая реализация

- Один профиль организации имеет изменяемые черновики, неизменяемые
  опубликованные версии, audit trail, явный active pointer и видимый neutral
  fallback без модельного вызова.
- Реестр ручных, URL- и RSS-источников хранит права, robots, свежесть,
  неизменяемые snapshots/evidence и полный tenant provenance. Прямой fetch
  закрыт HTTPS/443, DNS/TLS pinning, redirect/MIME/size/time/XML budgets и
  capability, выключенной по умолчанию.
- Детерминированный `ContentContextBuilderV1` использует только сохранённые
  данные, ограничен 8 фактами, 8 доказательствами и 12 000 символов, замораживает
  факты/цитаты и выдаёт `CONTENT_EVIDENCE_REQUIRED` до AI admission для
  обязательного stale/conflicting/removed контекста.
- `Post`, `ContentOutputContext` и `DraftEvidence` сохраняются одной
  tenant-scoped транзакцией с точной версией профиля и цитатами каждого
  элемента цепочки; обновление без контекста атомарно очищает typed provenance.
- Generator, editor, контекстный Mastra и новый AutoPost V2 используют один
  server-issued contract. Контекстный режим создаёт только drafts; обычный
  MCP/agent сохраняет прежнюю семантику, а upstream AutoPost V1 не изменён.
- Settings-поверхности профиля, источников и provenance имеют точные
  loading/empty/default/selected/success/error/restricted/disabled/
  long-content состояния, RU/EN, обе темы и локальные browser fixtures без API,
  модели или внешней сети.

## Интеграционная проверка

- Все 11 stream artifacts приняты; completion inbox пуст, оставшихся P0/P1 нет.
- Focused проверки покрывают digest/revision/tenancy, SSRF и redirect policy,
  RFC 9309, lease/race/freshness, frozen context, per-item citations, generic
  и CI agent paths, AutoPost V2 failure/rollback и неизменность V1.
- Реальные disposable PostgreSQL proofs подтвердили additive migration,
  tenant/IDOR fences и атомарный success/двухэлементный rollback AutoPost V2;
  локальный TLS proof подтвердил pinned connector. Временные ресурсы удалены.
- Browser evidence покрывает 390/768/1024/1440, RU/EN, light/dark, клавиатуру,
  200% zoom, отсутствие overflow и мобильные targets не меньше 44 px.

## Исходная release-приёмка

Receipt `acceptance-receipt/v1` зелёный на `342d983d`: собраны frontend,
backend, orchestrator и commands; Jest — 124/124 набора, 1603 passed и 1
skipped из 1604. Независимый аудит обнаружил, что receipt не сохранил TAP totals
native Node и три условных PostgreSQL skips, поэтому этот receipt оставлен
неизменным как историческое доказательство, но не используется как финальное
доказательство ремонта.

## Evidence repair `content-factory-next-9e9.8`

- Локальная ветка `codex/content-intelligence-evidence-repair` удерживает
  `8cc3bb27` и принятую историю. `main` расходится от `3a9606e7` на 6/40 commit
  по 21 общему изменённому файлу; merge явно отложен.
- Оба PostgreSQL proof используют random schema, запрещают remote/query target
  overrides, создают нужную структуру только в явно помеченной loopback
  disposable DB и всегда удаляют схему.
- Required Docker runner запускает прежние три Jest suites, source-registry и
  post-context native proofs без skips и прежние две operational проверки;
  container, network, volume и временные результаты очищаются fail-closed.
- Closeout сохраняет Node 22 TAP totals и точные env-gates. Новый
  `acceptance-receipt.evidence-repair.json` создаётся без чтения или перезаписи
  исходного receipt и является итоговым release-доказательством repair tip.
- Feature-код, Prisma schema/migration и AutoPost V1 не менялись.

После закрытия Beads однократный GitHub sync не был поставлен в очередь:
isolated worktree не владеет `.beads` database. Повторный запуск и настройка
учётных данных не выполнялись.

## Остаточные границы

- VoiceOver/NVDA spoken announcements требуют отдельной ручной проверки в
  доступной среде; keyboard, focus, semantics и размеры покрыты автоматически.
- Direct URL/RSS fetch и periodic sync выключены по умолчанию. Их включение —
  отдельное серверное решение после проверки прав/robots и эксплуатационных
  лимитов; Telegram source остаётся выключенным.
- Hard purge имеет принятый целевой срок 24 часа только после отдельной
  реализации и runtime proof; текущий archive немедленно исключает источник
  из контекста, но не обещает физическое удаление за этот срок.
- Additive Prisma migration доказана локально, но не применялась к production.
  Live fetch, paid model calls, публикация, credentials, deploy и решения
  владельца из программы не выполнялись и не поглощались.

docs-reviewed: updated - актуализированы product specs, data model, content lifecycle, docs index, stage summary, handoff и project index.

graph-reviewed: updated - локальный code-only Graphify 0.9.45 обновлён без LLM/API; query и affected подтвердили ContentContextService → controller, generator, Copilot и AutoPost V2 consumer boundaries. Точные counts и built commit хранятся в GRAPH_REPORT.md.

documentation-decision: no new external/versioned boundary - финальная приёмка опирается на принятые repository-local контракты; versioned undici/Next behavior уже разрешены и записаны в stream artifacts.
