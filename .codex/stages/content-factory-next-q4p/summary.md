# Итог repair-стадии Cloud-first SaaS

Стадия `content-factory-next-q4p` закрывает 18 замечаний независимого review
поверх Cloud-first SaaS-среза на локальной ветке `codex/cloud-saas-growth`.
Четыре защищённых landing/auth-файла и receipt исходной стадии не менялись.

## Поведение

- Посетитель видит отдельный вход на каждой публичной странице. Авторизованный
  переход на `/` снова открывает приложение, а не marketing home.
- Приглашённый участник сохраняет invite по всей анонимной цепочке
  `/?org=… → /auth?org=… → /auth`; авторизованный участник выполняет
  `/user/join-org` и возвращается на `/?added=true`.
- Публичная регистрация и восстановление пароля ограничены на одного временного
  caller. Canonical и trailing-slash URL делят бюджет. Новая LOCAL-регистрация
  требует 12 символов, approval-mode ведёт на `/auth/pending` даже без
  читаемого response header, а self-service пользователь не становится
  операторским superadmin.
- Администратор workspace явно выбирает `included` или `workspace_key` без
  credential fallback. Included allowance считает допущенные попытки
  продуктовых AI-операций, включая failed/incomplete; это не provider-call и не
  spend cap. Generate, EOF, error, cancel и ранний выход из stream имеют один
  tenant-scoped lifecycle и останавливают upstream работу там, где consumer
  отменяет её.
- Оператор получает реальные fail-closed `AI_INCLUDED_*` и
  `PUBLIC_GROWTH_DEDUPE_KEY` в обоих env-шаблонах. Сырые trusted growth receipts
  и AI usage удаляются через 90 дней ежедневным owner-run процессом; дневные
  обезличенные агрегаты сохраняются.

## Записанные решения

- R6: quota — счётчик допусков попыток операций; failed, crash-left `admitted`
  и incomplete расходуют allowance. Per-call sizing/reconciliation остаётся в
  `content-factory-next-saas.5`.
- R8: минимум 12 символов только для новых `provider === 'LOCAL'`; существующие
  hashes/login и non-LOCAL регистрация не перевалидируются этим правилом.
- R12: 60-секундный HMAC caller bucket от connection address с process-random
  memory-only ключом; IP, User-Agent, cookie и persistent visitor id не
  сохраняются.
- R16: 90 дней для `PublicGrowthTrustedEvent` и `AiUsageRecord`; удаляет
  оператор ежедневным dry-run/apply процессом, `PublicGrowthDaily` не удаляется.

## Надёжность и review

Daily aggregate `P2002` и `P2034` повторяют всю операцию максимум три раза в
новой транзакции. Только точный unique target receipt возвращает duplicate;
registration event больше не теряется при гонке aggregate upsert. Trusted
dedupe — domain-separated HMAC со стабильным ключом не короче 32 байт.

До корневой приёмки были найдены и закрыты восемь дефектов: второй hop
anonymous invite, stale copy-test, trailing-slash обход auth throttle,
расхождение admitted/completed quota, production env drift, ложный refresh в
503, cancel/EOF race и отсутствие upstream `iterator.return()` при раннем
выходе. Каждый из них виден в коде и focused-тестах этой стадии.

Формулировка «независимый итоговый review» и verdict `ready` сняты
`content-factory-next-1ii` 2026-08-19: артефакта такого review нигде под
`.codex` нет, и подтвердить ни его независимость, ни verdict репозиторий не
может. Перечень исправлений выше — это всё, что здесь доказуемо.

Корневой focused-набор под Node 22.23.2, pnpm 10.6.1 и `TMPDIR=/tmp` прошёл 27
suites / 257 tests. Единый release-result хранится только в
`acceptance-receipt.json`; отсутствие receipt означает, что release-проверка
ещё не завершена.

Первый release-запуск обнаружил три устаревшие test-интеграции: две valid
LOCAL-registration fixtures использовали восьмисимвольный пароль, а один
ad-hoc loader не разрешал новый tracker module. Production-код менять не
потребовалось; затронутые 3 suites / 123 tests прошли перед повтором release.

## Нормальные, ошибочные и краевые случаи

- Проверены signed-in/anonymous invite, public allowlist, signed-in root и
  общий sign-in action.
- Проверены normal registration, approval/activation, слабый LOCAL password,
  register 1/60s, forgot 5/60s, разные callers, query и trailing slash.
- Проверены included/workspace isolation, quota zero, missing credential,
  provider failure, final ledger-write failure, nested same-tenant reuse,
  cross-tenant refusal, stream EOF/error/cancel/race/early break.
- Проверены public/trusted growth, точный duplicate, ambiguous/aggregate P2002,
  P2034 exhaustion, rollback, missing/short HMAC key, retention dry-run/apply,
  strict cutoff и сохранение aggregate.
- Guard отклоняет `free tier`, `Start for free`, `Бесплатный тариф` и
  `Pricing from $19/mo`; все 16 locale владеют public и AI keys через `useT()`.

## Ограничения и rollback

- Transient throttle instance-local и сбрасывается при restart; distributed
  abuse budget остаётся `content-factory-next-saas.5`.
- Полученный, но никогда не прочитанный и не отменённый model `ReadableStream`
  может остаться `admitted`; это fail-closed для allowance, но даёт unfinished
  status до retention.
- Локально не проверялись реальные provider, production DB, scheduler install,
  ingress readback, mail, OAuth, publish или deploy. Длинные LTR/RTL переводы
  прошли контракт/сборку, но требуют будущей native-language и visual вычитки.
- Схема остаётся аддитивной и нигде не применялась. Утверждение «нового
  migration SQL не потребовалось, потому что оба `createdAt` index уже есть»
  исправлено `content-factory-next-1ii` 2026-08-19: `createdAt` index был
  только у `PublicGrowthTrustedEvent`, а собственные добавления среза (три
  таблицы, два enum, две колонки, коммит `284e7707`) требуют DDL до запуска
  нового backend. Пятнадцать операторов и порядок применения записаны в
  `docs/operations/production-deploy.md`.
- Rollback — отмена локального repair-коммита; миграций и данных для отката нет.

## Explicit defers

- Открыты и не поглощены `content-factory-next-saas.2`, `.4`, `.5`, `.6`.
- Открыты и не поглощены `content-factory-next-or3.2`, `.5`, `.7`, `.8`, `.9`.
- R3 readiness row и R18 operator bootstrap step не реализуют распределённый
  abuse budget из `.5`.
- Не опубликованы price, free tier, trial/card policy, provider, region, legal
  entity, SLA или certification.

docs-reviewed: updated — PRODUCT/spec, configuration, readiness, data model, production env template и стабильные docs/project indexes согласованы с фактическими routing, AI, telemetry и operator contracts.
documentation-decision: docs-resolve — class-validator@0.14.4 и @nestjs/throttler@6.5.0 подтверждены exact installed declarations/source и официальными docs; Prisma@6.5.0 подтверждён installed error shape и официальными v6 docs; @mastra/core repo-exact 1.21.0 проверен по installed public types/source после cross-track resolver result.
graph-reviewed: stale — уточнено `content-factory-next-1ii` 2026-08-19. Graphify запускался локально без LLM/API, но его отчёт `graphify-out/GRAPH_REPORT.md` игнорируется Git; в рабочем дереве он собран с коммита `00c9c175`, то есть на один коммит позади `f4353c25` на момент закрытия стадии. Counts живут только в этом игнорируемом файле, а результаты smoke queries нигде не записаны и проверке не поддаются. Прежнее «output обновляется до точного текущего HEAD» неверно.
