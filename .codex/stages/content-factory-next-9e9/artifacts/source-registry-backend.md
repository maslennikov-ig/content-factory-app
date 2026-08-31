---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:source-registry-backend
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.source-registry-backend
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: feee9cc3
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared-worktree delivery only; the local TLS server/certificate directory and disposable PostgreSQL schema/container were deterministically closed and removed. No product-source fetch, application database, model, credential, publish or deployment occurred.
risk_level: high
risk_tags:
  - ssrf
  - tenancy
  - untrusted-content
affected_surfaces:
  - backend
  - api
  - network-boundary
invariants:
  - capabilities-off-by-default
  - every-hop-validation-and-pinning
  - bounded-stream-and-parser
  - immutable-provenance
verification:
  - 'RED: Node 22.23.2 and pnpm 10.6.1; both focused files failed because the production source-registry boundary was absent'
  - 'SECURITY RED/GREEN: one DNS resolution per hop, IPv6 literal handling, unsafe redirect no-connect, total deadline, redacted response and immutable same-hash reuse all failed before their fixes and passed afterward'
  - 'PERSISTENCE RED/GREEN: atomic manual source+snapshot, 304-without-current refusal, active-lease exclusion and policy health mapping failed before implementation and passed afterward'
  - 'P1 RED/GREEN: the accepted network policy initially allowed IANA dummy prefix 100:0:0:1::/64; literal, mixed-DNS and redirect cases now reject it under registry snapshot 2026-08-20'
  - 'P1 RED/GREEN: invalid Expires initially ignored bounded RSS TTL; the single calculator now handles no-store/no-cache/must-revalidate/max-age/Expires/RSS TTL'
  - 'P1 RED/GREEN: lease correction initially failed repository tests until complete/fail required the same leaseId, RUNNING and leaseExpiresAt > commit clock inside the transaction'
  - 'P1 GREEN: node --test tests/content-source-fetch-gateway.test.cjs tests/content-source-registry.test.cjs — 30/30 passed, including local TLS pinning/original-hostname certificate verification and million-token pre-DOM refusal'
  - 'P1.2 RED/GREEN: 4 focused failures reproduced RFC 9309 wildcard/anchor matching, embedded-private IPv6, stale captured lease clock and cross-origin unsolicited 304; production fixes plus Allow-to-Deny fencing now pass'
  - 'P1.2 GREEN: node --test tests/content-source-fetch-gateway.test.cjs tests/content-source-registry.test.cjs — 35/35 passed'
  - 'P1.2 RACE RED/GREEN: DRAFT Allow-to-Deny-to-late-success reproduced with configVersion staying at 1; recordValidationPolicyFailure now atomically increments the version and the stale VALIDATE transaction rejects before snapshot/current pointer/run success; focused suites 36/36 passed'
  - 'POSTGRES GREEN: SOURCE_REGISTRY_POSTGRES_URL=<disposable local PostgreSQL 16> node --test tests/content-source-registry.postgres.test.cjs — 1/1 passed; lease crossed expiry inside SERIALIZABLE and the late snapshot was rolled back'
  - 'TYPECHECK: pnpm exec tsc --noEmit -p apps/backend/tsconfig.json passed before the parallel Post/generated-client drift; final rerun reports only out-of-zone posts.repository.ts Post-field/implicit-any diagnostics and none in owned source/controller/DTO paths (root acknowledged integration noise)'
  - 'LOCK: pnpm install --frozen-lockfile --ignore-scripts — passed on Node 22.23.2/pnpm 10.6.1; lock delta is 9 insertions only'
  - 'FORMAT: Prettier check for all owned TypeScript/CJS/JSON files — passed'
  - 'SCOPED DIFF: git diff --check for all owned product/test/artifact files — passed'
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/network-policy.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-access-policy.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-fetch.gateway.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-freshness.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-parser.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts
  - apps/backend/src/api/routes/content-source.controller.ts
  - tests/content-source-fetch-gateway.test.cjs
  - tests/content-source-registry.test.cjs
  - tests/content-source-registry.postgres.test.cjs
  - package.json
  - pnpm-lock.yaml
  - .codex/stages/content-factory-next-9e9/artifacts/source-registry-backend.md
explicit_defers:
  - no-live-product-fetch-periodic-sync-telegram-model-publish-shared-module-registration-database-apply-or-deploy
completion_event: 98732422-7e88-48a4-9f07-e2a9e25633b6
---

# Summary

The stream delivers the tenant-scoped registry API at
`/content-intelligence/sources` with member reads/draft-material access and
`Sections.ADMIN` on create, rights, activation, sync and archive mutations.
Organization identity always comes from authenticated request context and is
repeated in every repository predicate and composite relation write.

Creating URL/RSS records performs canonicalization and tenant-local dedupe but
never DNS or HTTP. Manual content creates its source, immutable snapshot,
evidence, current pointer and completed run inside one serializable transaction.
Rights confirmation is explicit. Archive immediately removes a source from all
member reads and draft material.

Direct URL/RSS collection is off by default. The member list contract is
`{sources, capabilities:{directFetch,validate,sync}}`; a current snapshot is
presented as `{observedAt,freshUntil,evidenceCount}`, with the latest source
validation receipt authoritative when immutable evidence is reused. Admin
validation at `POST /content-intelligence/sources/:id/validate` requires
confirmed rights, checks `SOURCE_DENIED_DOMAINS` before every hop, retrieves and
evaluates a bounded robots policy through the same gateway, and atomically
captures the first snapshot. Activation has no bypass: it requires CONFIRMED,
ALLOWED (or NOT_APPLICABLE for manual), and a current snapshot.

Robots matching follows [RFC 9309 sections 2.2.2–2.2.3](https://www.rfc-editor.org/rfc/rfc9309.html):
octet-normalized matching supports `*` and terminal `$`, decodes only
percent-encoded unreserved ASCII, normalizes reserved/non-ASCII octets, selects
the most specific octet match and prefers Allow on a tie. The parser and fetch
budgets are 512 KiB, satisfying the RFC minimum while remaining fail-closed.

When enabled for an operator-approved cohort, sync requires ACTIVE, CONFIRMED
and robots=ALLOWED. The gateway accepts HTTPS/443 without userinfo, resolves
every hop once, rejects the whole answer set if any address is not globally
reachable, and connects through an Undici agent pinned to that same set with
the original TLS hostname. Redirects are manual, capped, cycle checked,
re-resolved and stored only as query-redacted diagnostics.
IPv4-compatible, mapped and translated IPv6 forms are denied before transport
for literals, every DNS answer and redirects. Cross-origin redirects never send
validators, and an unsolicited `304` on such a hop is rejected.

Responses have explicit connect/header/total, header, on-wire, decoded,
decompression-ratio, MIME, charset and content-encoding limits. XML forbids
DOCTYPE/entities and bounds depth, attributes, fields and items; HTML bounds
nodes/depth/text and removes active/hidden content without loading resources.
A single-pass markup preflight bounds tokens/nesting/items before `parse5` or
`fast-xml-parser` may allocate a DOM/object graph. Parsers accept bytes only and
cannot perform network I/O.

Successful sync finalizes run, immutable snapshot/evidence and current source
pointer atomically. `304` and same-normalized-hash validations reuse the current
snapshot. The lease is computed above the worst two-fetch redirect and parse
envelope; completion/failure conditionally commits only for the same unexpired
RUNNING owner. Tenant-local run keys make retries idempotent. Safe run
metrics/errors are persisted without response bodies, headers, resolved IPs or
query secrets.

Every ACTIVE sync refetches and evaluates robots before the source request.
Policy failure and successful snapshot/source commits are fenced by tenant,
configVersion, rights and expected lifecycle/robots state. Transaction attempts
use a fresh injected clock at lease read and immediately before final CAS, so a
lease crossing expiry cannot commit and an Allow-to-Deny race cannot restore
fresh health or write a snapshot.
Policy denial also advances `configVersion` in the same conditional update, so
a previously started DRAFT validation cannot reinterpret the newer DENIED state
as eligible for a late ALLOWED commit.

Freshness is calculated once from HTTP cache directives, valid Expires and a
bounded RSS TTL. `no-store` prevents capture; `no-cache`, `must-revalidate` and
`max-age=0` expire immediately. `304` and same-hash receipts reuse immutable
snapshot/evidence while updating source/run validation authority.

# Verification

This P1.2 correction supersedes pending completion event
`990263de-fb9a-4041-9087-d7130a59ca93` and resolves the original review event
`e7173fa8-1bc3-436f-b113-0ea1df05ad4a`.

Focused tests execute real policy, gateway, parser, DTO/controller metadata,
service and repository code. Network responses and DNS are deterministic local
adapters except for one loopback-only TLS proof with deterministic cleanup. A
Prisma-shaped transaction fake plus a disposable PostgreSQL 16 SERIALIZABLE
rollback proof verify:

- cross-tenant-safe predicates and duplicate identity;
- capability, rights, lifecycle and robots fail-closed ordering before fetch;
- one resolve-all decision per hop and no second request after unsafe redirect;
- special IPv4/IPv6, mapped/translation/transition and link-local refusal;
- deadline, header, compressed, decoded, ratio, MIME, charset and parser limits;
- immutable manual/direct provenance, `304`/same-hash reuse and current pointer;
- rollback propagation, serializable active lease and idempotent run receipt;
- query redaction plus safe deterministic draft-material trace;
- admin-only mutation metadata while authenticated organization members retain
  read/use methods.

# Risks / Follow-ups

- Root must register the controller, repository, service and gateway in shared
  Nest modules; this stream intentionally did not edit those files.
- `SOURCE_DIRECT_FETCH` remains false by default. Validation is the only URL/RSS
  lifecycle path that can set ALLOWED and capture the prerequisite snapshot;
  UNKNOWN/DISALLOWED remain hard blocks and there is no bypass endpoint.
- Periodic sync and Telegram ingest are modeled but remain disabled and have no
  runtime producer in this stream.
- `undici@7.29.0` is a direct exact MIT dependency. Primary evidence is the
  official [Undici v7.29.0 security release](https://github.com/nodejs/undici/releases/tag/v7.29.0)
  and [Node.js July 2026 security notice](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases).
  A real local TLS test proves pinned-address connection plus original-hostname
  certificate checks.
- PostgreSQL proof creates and drops only a random disposable schema in a local
  one-shot container; it does not apply the product Prisma schema or touch an
  application database.
- No live product-source network, application database, model, credentials, publish,
  scheduler, Telegram or deployment action occurred. Internet use was limited
  to official security documentation and package metadata for the pinned
  dependency.
