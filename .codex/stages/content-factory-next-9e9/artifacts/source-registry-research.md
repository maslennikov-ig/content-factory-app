---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:source-registry-research
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.source-registry-research
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 1534b132
worktree: /tmp/cf-vme2
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted by root; no branch, process, browser session, network fixture, credential or temporary runtime resource was created by this stream.
risk_level: high
risk_tags:
  - security
  - tenancy
  - data
affected_surfaces:
  - data
  - api
  - outbound-network
  - background-jobs
invariants:
  - tenancy
  - provenance
  - ssrf-fail-closed
  - draft-only
verification:
  - Node 22.23.2 / pnpm 10.6.1 pnpm run docs:check — Documentation links OK, 82 files checked
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-9e9/artifacts/source-registry-research.md — artifact validation OK
  - git diff --check -- .codex/stages/content-factory-next-9e9/artifacts/source-registry-research.md and git diff --no-index --check /dev/null docs/product/content-source-registry-spec.md — passed
changed_files:
  - docs/product/content-source-registry-spec.md
  - .codex/stages/content-factory-next-9e9/artifacts/source-registry-research.md
explicit_defers:
  - public-scraping-disabled
  - telegram-collection-disabled
  - no-live-fetch
  - no-production-purge-claim
---

# Summary

Спроектирован единый organization-owned реестр manual/URL/RSS/future Telegram с
раздельными desired/health/rights/robots состояниями и цепочкой
`source -> snapshot -> evidence -> draft`. Принятые defaults: управляют только
`ADMIN/SUPERADMIN`, члены организации читают/используют; soft delete сразу
исключает context, hard purge имеет целевой срок 24 часа после реализации,
неудалённые superseded snapshots хранятся 90 дней.

Вердикт premortem: `GO WITH CONDITIONS`. Реализацию нельзя начинать с
расширения текущего `fetch(...).text()`; сначала нужен единый streaming gateway
и tenant-linked provenance contract.

Подтверждённые findings:

- **P0 / must-fix / high confidence — resource exhaustion.** Текущий safe-fetch
  путь проверяет redirect и DNS connector, но не задаёт общий timeout, streaming
  byte/MIME/decompression budget; RSS/JSDOM получают целую строку. Attack path:
  разрешённый public host возвращает slow/unbounded/compression/XML/DOM payload.
  Impact: память/CPU/worker availability. Minimal fix: один URL/RSS gateway с
  connect/header/total deadlines, on-wire + decoded limits и parser budgets.
- **P0 / must-fix / high confidence — SSRF policy gaps.** Validator допускает
  URL credentials и любой HTTPS port, вручную выбранные IPv4/IPv6 ranges не
  покрывают полный IANA special-purpose space (`fe80::/10` покрыт только
  префиксом `fe80:`). Attack path: literal/mixed DNS/redirect/embedded address
  или custom service port. Impact: запрос к локальной/VPC службе и утечка
  данных. Minimal fix: HTTPS/443 only initial rollout, reject userinfo,
  resolve-all + deny-if-any-unsafe + per-hop pinned connector.
- **P1 / must-fix / high confidence — provenance/tenancy.**
  `Post.researchSources` — JSON string без FK на tenant/source/snapshot/evidence.
  Attack prerequisite: ошибочный join/backfill/DTO link. Impact: чужой или
  устаревший источник в draft. Minimal fix: `organizationId` на каждом корне,
  composite relation guards и один typed context contract.
- **P1 / high-value improvement / high confidence — supply-chain boundary.**
  Production code импортирует `undici`, доступный только транзитивно. Minimal
  fix: если новый gateway использует его API, объявить direct dependency и
  проверить принятую версию/lockfile.

# Verification

Спецификация включает capability matrix, lifecycle, canonicalization/dedupe,
ETag/Last-Modified/cache freshness, retention/deletion, parser/search/direct
fetch separation, SSRF IPv4/IPv6/DNS rebinding и каждый redirect hop,
protocol/port/userinfo, time/size/MIME/decompression/XML/DOM budgets,
robots-vs-terms gates, concurrency/retry/idempotency, additive migration,
rollback и normal/failure/integration acceptance matrix.

Локально проверены кодовые границы AutoPost, WebResearchService,
PostsRepository/`researchSources`, SSRF validator/dispatcher/fetch,
RSS/JSDOM parsers, organization permissions, Telegram single consumer и
Graphify report/focused queries. Version-sensitive решения сверены с первичными
Node 22, WHATWG, IETF/IANA/W3C, RSS Board и Telegram Bot API источниками.

Static review не проверяет runtime egress firewall, proxy/DNS/TLS, Prisma
locking/migration output, Temporal redelivery, memory limits или purge SLA.

# Risks / Follow-ups

Immediate implementation containment: оставить `SOURCE_DIRECT_FETCH`, periodic
sync и Telegram ingest выключенными; не направлять новые consumers на текущий
unbounded `.text()` path; не превращать web-search citations в разрешённые
ContentSource.

До cutover нужны focused RED/GREEN на cross-tenant links, DNS rebinding и mixed
A/AAAA, unsafe redirects, streaming/decompression/XML/DOM budgets, duplicate
runs, late commit after disable/purge, 304/same-hash freshness и rollback к
legacy AutoPost. Public scraping, live fetch, Telegram credentials/collection,
paid/model calls, публикация и deploy остаются вне scope.
