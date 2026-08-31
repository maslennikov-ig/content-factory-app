# Stage Summary: own error collection

## Goal

Вернуть полезный сбор неожиданных ошибок только на собственной инфраструктуре,
не передавая персональные данные, содержимое запросов и ответы модели.

## Accepted Boundary

- Отдельный GlitchTip `6.2.6` all-in-one с PostgreSQL 18, приватной БД,
  loopback-only ingress, resource limits и 30-дневным retention.
- `@sentry/nestjs` и `@sentry/nextjs` строго `10.70.0` для backend,
  orchestrator и Next server/edge; без прямого browser sink.
- DSN принимается только вместе с отдельно заданным exact origin той же scheme,
  host и port. Отсутствие или отказ collector не ломает запуск продукта.
- Payload строится заново: event id, time, level, environment, release, service,
  один из фиксированных generic error types и числовые frame coordinates.
  Message, code names, request/user data, AI content и attachments удаляются.
- Logs, sessions, Spotlight, debug, tracing, replay, profiling, AI integrations,
  source maps и vendor control plane выключены.

## Reference Comparison

- Официальные GlitchTip install/sample подтверждают all-in-one, PostgreSQL 14+,
  optional Valkey и 512 MB recommended; выбран отдельный host вместо уже
  нагруженного product host.
- Официальный retention contract подтверждает `GLITCHTIP_*` variables;
  30 дней совпадают с hot default и текущим месячным диагностическим окном.
- Официальный Next/Sentry contract проверен также по установленному SDK 10.70:
  direct browser config отвергнут из-за IP/User-Agent на ingress, а ambient
  Spotlight/debug/tracing явно перекрыты после реального воспроизведения.

## Verification

- Focused integration after corrections: 4 suites, 57/57.
- Real SDK in-memory transport: no network; secret message and attachment absent.
- Independent correctness review: ACCEPT.
- Independent security review: ACCEPT.
- Canonical release acceptance: `acceptance-receipt.json`.

## Defers

- `content-factory-next-e7t`: legacy Prisma `Errors` payload/retention.
- `content-factory-next-ry5.10`: browser collection through a first-party relay
  or equivalently proven privacy-safe ingress.
- Actual host, DNS/TLS, admin/project/DSN, backups and runtime smoke checks are
  owner-only deployment actions and were not performed.

docs-reviewed: updated - added collector/runbook/env/privacy documentation and a stable project-index entry; documentation-decision: pinned Sentry-compatible SDK 10.70 behavior is documented against official GlitchTip 6 references.

graph-reviewed: blocked - the worktree has no `graphify-out` artifact; direct source reading confirmed the architecture and no external semantic/model backend or graph refresh was used.

## Closeout

- Branch: `work/own-error-collection` from `main` `53fc73c6`.
- Commit model: Терра.
- No push, merge, deploy, server/SSH, production database or collector runtime.
