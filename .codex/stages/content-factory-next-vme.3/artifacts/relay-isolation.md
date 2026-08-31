---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.3/stage-manifest.json
stream_owner: subagent:relay-isolation
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-vme.3.relay-isolation
stage_id: content-factory-next-vme.3
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 4588f0202069504218da4a694905f7666afb612f
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the corrected stream after focused tests, typecheck, independent security review and exact cleanup verification; disposable nginx proof resources were removed.
risk_level: high
risk_tags:
  - security
  - privacy
affected_surfaces:
  - api
  - telemetry
write_zone:
  - libraries/helpers/src/errors/**
  - apps/frontend/src/app/api/browser-errors/**
  - apps/frontend/src/instrumentation-client.ts
  - var/docker/nginx.conf
  - tests/browser-error-relay.test.cjs
  - docs/operations/error-collection.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-isolation.md
invariants:
  - payload-minimization
  - bounded-lifecycle
verification:
  - 'RED: pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (exit 1; 1/8 failed: A exhausted the shared bucket and the first B event received false)'
  - 'GREEN: pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (14/14 passed, including real keyring, route wiring, real @sentry/nextjs isolation-scope proof and nginx proxy-hop)'
  - 'REQUIRED DOCKER: ./scripts/ci/run-docker-backed-ci.sh --require-docker (3 suites, 31/31 passed, 0 skipped; both operational proofs passed)'
  - 'FOCUSED: pnpm exec jest tests/browser-error-relay.test.cjs tests/error-collection.privacy.test.cjs tests/external-services.purge.test.cjs --runInBand (3 suites, 54/54 passed)'
  - 'TYPECHECK: pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit (passed)'
  - 'P1 RED: real nginx:alpine proxy proof exhausted A and returned 429 to first B; Content-Type reached upstream unchanged'
  - 'P1 GREEN: real nginx:alpine proxy proof gave A its own 429 budget, accepted B with 200, forwarded both exact Content-Type values and collapsed malformed/missing inputs into one fixed bucket'
changed_files:
  - libraries/helpers/src/errors/browser.error.relay.ts
  - libraries/helpers/src/errors/browser.error.relay.server.ts
  - apps/frontend/src/app/api/browser-errors/route.ts
  - apps/frontend/src/instrumentation-client.ts
  - var/docker/nginx.conf
  - tests/browser-error-relay.test.cjs
  - docs/operations/error-collection.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-isolation.md
explicit_defers:
  - deliberate-nonce-rotation-is-not-authentication-or-global-dos-protection
  - cached-pre-change-browser-tab-requires-reload
  - application-limiters-are-per-process-and-per-replica
  - process-salt-and-map-cleanup-is-request-driven
---

# Summary

## Design decision

Each browser document creates one 128-bit random nonce in module memory. It is
never written to cookies, local/session storage or the error JSON. The existing
same-origin transport places it only in a strict `cf-client` parameter of the
already forwarded `Content-Type` header. The exact nginx location suppresses
both access and error logs and forwards no arbitrary request headers.

Nginx maps only the exact 22-character base64url nonce to a rate-limit key in a
fixed 64 KiB shared-memory zone. Every malformed or missing value collapses to
one literal bucket. The application then derives its own opaque HMAC key; raw
nonce values never enter its map or the collector payload.

The Node route validates the exact media type and nonce grammar, then derives
an opaque key with HMAC-SHA-256 and a process-local random salt. The salt rotates
with the limiter window and is never configured or persisted. The raw nonce is
not retained. The limiter stores only derived digests in a bounded map, clears
the map at the window boundary and evicts the oldest digest if the hard client
cap is reached. Missing, duplicated, extra or malformed parameters fail closed
before any rate-limit state is allocated.

This is noise isolation, not authentication. A cooperative or accidentally
noisy page cannot spend another page's nginx or application budget. A malicious
client can rotate a syntactically valid nonce and evade both per-client buckets;
this design is deliberately not authentication or complete global DoS
protection. No stable account, session, IP, User-Agent, cookie, URL/query,
user/model content or new secret enters the design.

The route depends only on standard `Request.headers`. Next.js `16.2.9` primary
documentation confirms Route Handlers read incoming headers through the Web
Request API and that `NextRequest.ip` was removed in Next 15. The repository
uses Next `16.2.6`, so no undocumented client-address runtime property is used.
The versioned primary sources are the official Next.js
[`route.mdx`](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/route.mdx)
and
[`version-15.mdx`](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/upgrading/version-15.mdx).

## Technical premortem

Verdict: **GO WITH CONDITIONS**. The change is local, memory-only and reversible
by reverting these files; no database, durable cache, secret or production
state changes.

| Failure symptom                            | Evidence / mechanism                                       | Detection                                 | Mitigation                                      | Disposition |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- | ----------- |
| A still blocks B                           | nginx or Next uses one process-wide count                  | real proxy + route RED/GREEN              | keyed counters on both layers                   | preflight   |
| key becomes cross-session identity         | browser storage or stable server salt                      | transport/lifecycle tests and diff review | document-memory nonce; rotating process salt    | preflight   |
| raw seed or key reaches GlitchTip          | transport reuses request metadata                          | inspect real forwarded event              | rebuild event from closed JSON only             | preflight   |
| malformed values allocate unbounded state  | attacker rotates arbitrary header strings                  | real nginx + malformed/churn tests        | exact grammar, fixed invalid key, hard map caps | preflight   |
| missing key spends a valid client's budget | fallback shares a bucket                                   | missing-key integration test              | fail `400` before limiter                       | preflight   |
| executor broadens ingress payload          | convenient new body field or arbitrary header pass-through | write-zone and existing ingress test      | reuse only strict Content-Type parameter        | preflight   |

Recovery trigger is any focused regression, payload expansion or identifier in
forwarded output. Revert the local stream; browser collection returns to the
known global-bucket behavior while the relay remains privacy-minimized. There
is no durable data to restore or migrate.

# Verification

## Наблюдаемый RED

```text
pnpm exec jest tests/browser-error-relay.test.cjs --runInBand
```

До реализации: exit 1, 1 suite failed, 1/8 tests failed. Клиент A получил
`true`, затем `false`, но первый запрос B тоже получил `false` вместо `true`:
существующий общий счётчик воспроизвёл исходный дефект.

После добавления остальных требований отдельный RED дал 4/12 failures:
отсутствовали server keyring, строгий Content-Type parameter и fail-closed
ветви malformed/missing key.

## GREEN

Та же focused-команда после реализации: exit 0, 1 suite passed, 14/14 tests
passed. Тесты исполняют настоящий Node keyring и настоящий Next route с реальным
`@sentry/nextjs`, production options и in-memory transport: 300 событий A
приняты, следующее отклонено `429`, а первое событие B принято `202`. Отдельно
проверены загрязнённый isolation scope, вращение HMAC-соли,
строгая грамматика, отсутствие расхода бюджета на malformed/missing input,
ограниченное вытеснение/очистка и отсутствие nonce/digest в response, runtime
logs и пересобранном внешнем событии. SDK client закрывается после assertions.

Frontend type contract также прошёл:

```text
pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit
```

Результат: exit 0. Full suite и build не запускались: единая release-приёмка
принадлежит root.

Соседний privacy-набор прошёл одной командой: 3 suites, 54/54 tests. Проверка
документных ссылок прошла 3/3, targeted Prettier, `git diff --check` и
artifact validator завершились с exit 0.

## P1 correction: реальный nginx proxy-hop

Исполняемый тест запускает tracked `var/docker/nginx.conf` в cached
`nginx:alpine`, заменяя только локальный upstream на echo-location внутри того
же контейнера. RED: A исчерпал burst и получил `429`, точный Content-Type дошёл
до upstream, но первый B тоже получил nginx `429`. Это доказало, что дефект был
в глобальном `$server_name` bucket; гипотеза о потере параметра через
`$content_type` не подтвердилась.

GREEN после strict map: A по-прежнему исчерпывает свой ingress budget, B сразу
получает `200`, а upstream видит точные параметры обоих клиентов. Двадцать
четыре malformed-запроса исчерпывают один фиксированный bucket, и следующий
missing-key запрос получает `429`; Next-тест отдельно подтверждает `400`, когда
такой запрос достигает route. Контейнер и временный config удаляются в
`finally`.

Обязательный Docker runner теперь заранее проверяет либо получает
`nginx:alpine`, включает этот suite в общий JSON-результат и требует ноль
пропусков. Реальный required-run прошёл 3 suites, 31/31 tests, 0 skipped и обе
существующие operational proofs.

# Risks / Follow-ups

Residuals are explicit: deliberate nonce rotation bypasses per-client budgets;
an already cached old client receives `400` until page reload; Next salts/maps
are per process/replica; salt and map cleanup is lazy on the next request. The
fixed zone/map sizes bound memory, but this is not a global request-rate guard.
