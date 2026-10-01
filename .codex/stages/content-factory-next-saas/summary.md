# Итог этапа Cloud-first SaaS

Этап `content-factory-next-saas` реализует безопасный первый вертикальный срез
принятой Cloud-first модели на локальной ветке `codex/cloud-saas-growth`.
Отдельные файлы и ветка агента главного экрана не изменялись.

## Доставленный результат

- PRODUCT, новая продуктовая спецификация и ADR-0010 фиксируют managed
  multi-tenant SaaS при неизменной AGPL-3.0, заметной ссылке Source и без
  пользовательского self-hosting-позиционирования.
- Публичными стали ровно `/`, `/product`, `/security`, `/docs` и `/demo`.
  Синтетическое demo проходит plan → draft → review → schedule без tenant data,
  AI, Temporal, OAuth, публикации или платных вызовов.
- Email-first регистрация хранит email только в памяти до submit, совместима с
  legacy `company`, принимает optional `workspaceName`, использует безопасное
  имя `Workspace` и корректно передаёт approval/activation в существующие auth
  маршруты. Реальный starter catalogue не выдуман: `blank` — единственный
  текущий idempotent no-op.
- Суточные first-party growth aggregates принимают только закрытые coarse
  поля, не сохраняют IP, User-Agent, referrer, email или visitor id. Регистрация
  и активация фиксируются доверенным серверным переходом с hashed dedupe.
- Гибридный AI использует явный `included | workspace_key` без скрытого
  fallback и без межтенантного reuse. Admission по included quota выполняется
  serializable-транзакцией; журнал не хранит prompt/output/cost. Новые
  организации получают `included`, но quota остаётся `0` до отдельного решения
  о тарифах.
- Readiness-runbook связывает Source, роли, migration guard, backup/recovery,
  observability, egress и incident boundary, не объявляя production готовым.

## Проверка и review

Focused RED→GREEN покрывает публичные маршруты, demo, регистрацию, telemetry,
tenant-scoped AI resolver, quota concurrency, consumer adoption и schema
guards. Локальный браузер прошёл RU/EN, 1440/1024/768/390, эквивалент 200%
zoom до 195 CSS px, keyboard и reduced motion без горизонтального overflow.

Независимый review нашёл один P1 и два P2. До release acceptance исправлены:
activation-required handoff, повторный расход после сбоя финального AI-ledger
update и дрейф месячного anchor после короткого месяца. Коррекция прошла 2
suites / 14 tests. Единственный общий результат команд хранится в
`acceptance-receipt.json`; receipt, а не пересказ здесь, является источником
статуса release-команд.

Первый release run дополнительно обнаружил пять интеграционных пробелов:
использование native button и off-token typography, неполный локальный AI copy,
устаревший SSRF test harness и ошибочно изменённый durable branch pin. Все пять
исправлены без расширения allowlist; затронутые 7 suites / 97 tests прошли до
повторного общего запуска.

## Explicit defers

- Beads `content-factory-next-saas.2` остаётся открытой для полного proof ролей,
  export/delete lifecycle и tenant security; совместимая регистрация уже
  реализована.
- Beads `content-factory-next-saas.4` и `.6` сохраняют реальные Terms, Privacy,
  support/subprocessors, provider, region и legal entity; deploy до них
  запрещён.
- Beads `content-factory-next-saas.5` сохраняет production observability,
  privacy-safe partitioned abuse budget и sizing/reconciliation AI-ledger.
- Beads `content-factory-next-or3.2`, `.5`, `.7`, `.8`, `.9` и epic `or3`
  остаются открытыми из-за реального template catalogue, core-product `9e9`,
  legal/readiness dependencies и будущего pricing/trial решения.
- Migration SQL и schema apply не выполнялись. Production, credentials, paid
  providers, live OAuth/publishing, Git push, PR и deploy не выполнялись.

docs-reviewed: updated — добавлены Cloud SaaS spec, ADR-0010, readiness runbook, AI/data/config docs и стабильная навигация в docs/project index.
graph-reviewed: updated — Graphify 0.9.45 локально пересобран без LLM/API: 9453 nodes, 18923 edges; focused query нашёл EmailFirstSignup, PublicGrowthService и executeAiOperation с их consumers.

## Current contract clarification — 01.10.2026

The earlier acceptance/defers above record the historical August slice. Owner
decision pdbe removed the starterTemplate selection in September; current
registration creates default localized tags per new organization, while editorial
stage is a separate Post field. The 03.09 saas.2 comment explicitly moved export/
delete to blocked saas.7; they are not an unfinished registration requirement.
The accepted role matrix and closed jjvz fix remain valid. A bounded two-org
PostgreSQL walk passed at 7f9f44a2d:26helper checks, root two suites / 117 tests and
bounded review/cleanup. Evidence:
../content-factory-next-0qgn/evidence/saas-two-org-acceptance-2026-10-01.json.
This proves named repository/registration scenarios, not PostsController HTTP
or the separate export/delete lifecycle.
No historical receipt is rewritten or reused for modified proof code.
