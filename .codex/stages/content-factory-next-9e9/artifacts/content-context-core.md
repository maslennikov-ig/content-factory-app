---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:content-context-core
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.content-context-core
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
cleanup_notes: Shared-worktree delivery only. Disposable PostgreSQL container cf-post-context-proof-content-core and temporary migrate-diff directories were deterministically removed; no model, browser, credential, publish or deployment resource was created.
risk_level: high
risk_tags:
  - tenancy
  - immutable-provenance
  - authorization
  - transaction-integrity
affected_surfaces:
  - backend
  - api
  - data
invariants:
  - server-owned-tenant-and-clock
  - deterministic-zero-network-zero-ai-selection
  - current-required-fails-before-model-admission
  - atomic-post-provenance
verification:
  - 'INITIAL RED: node --test tests/content-context.builder.test.cjs tests/post.content-context.test.cjs — 4/4 failed because the production builder was absent and Post did not validate, persist or roll back typed provenance'
  - 'FACT/API RED: the production fact service and authenticated context controller boundaries were absent before their focused implementation'
  - 'AUTHORIZATION RED/GREEN: a USER proposal initially downgraded an already ACCEPTED evidence link to PROPOSED; the repository now preserves reviewed state and 15/15 focused checks pass'
  - 'FINALIZE RED/GREEN: an assessment changed to BLOCKED between build and save initially allowed the Post; finalize now revalidates tenant, source lifecycle, assessment, trust, freshness, conflicts and profile digest before any write'
  - 'P1 FRESHNESS RED/GREEN: old immutable evidence with a fresh latest source receipt was initially BLOCKED_STALE, while a stale source receipt still allowed Post finalization; source.freshUntil is now authoritative for registered-source reuse in build, fact evaluation and finalize'
  - 'P1 IMMUTABILITY RED/GREEN: changing the live fact statement, temporal fields and evidence links after build rewrote GET output; ContentContextItem now stores the bounded fact payload and selected evidence citation ids, and GET renders those frozen fields'
  - 'CORRECTION RED/GREEN: 9 focused failures proved missing currentSnapshotId closure, shuffled-link nondeterminism, terminal fact revival, thread-wide citation copying, frozen citation laundering, stale provenance retention and foreign Post/group IDOR; all are now green'
  - 'GREEN: node --test tests/content-context.builder.test.cjs tests/post.content-context.test.cjs tests/content-intelligence.persistence.test.cjs — 32 passed, 1 conditional PostgreSQL proof skipped without its explicit local URL'
  - 'POSTGRESQL: POST_CONTENT_CONTEXT_POSTGRES_URL=<disposable-local-postgres> node --test tests/post.content-context.test.cjs — 11/11 passed, including production PostsRepository rejection of foreign post id and group with zero mutation'
  - 'COMPATIBILITY: pnpm exec jest --runInBand tests/content-context.builder.test.cjs tests/post.content-context.test.cjs tests/post.research.sources.test.cjs — 3 suites, 27 passed, 1 conditional PostgreSQL proof skipped'
  - 'PRISMA: prisma format, DATABASE_URL=<local-placeholder> prisma validate and prisma generate — passed; node --test tests/content-intelligence.persistence.test.cjs — 6/6 passed'
  - 'MIGRATION EQUIVALENCE: fresh prisma migrate diff from exact 6e1d1621 schema was byte-identical to the amended stage migration; the guard accepted all 137 explicitly selected additive statements'
  - 'TYPECHECK: pnpm exec tsc --noEmit --pretty false -p apps/backend/tsconfig.build.json — passed'
  - 'FORMAT: Prettier check for all owned TypeScript/CJS files — passed'
  - 'SCOPED DIFF: git diff --check for all owned product/test files — passed'
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.types.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-fact.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-fact.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-context.dto.ts
  - apps/backend/src/api/routes/content-context.controller.ts
  - libraries/nestjs-libraries/src/dtos/posts/create.post.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/prisma/migrations/20260820143000_add_content_intelligence_foundation/migration.sql
  - tests/content-context.builder.test.cjs
  - tests/post.content-context.test.cjs
  - tests/content-intelligence.persistence.test.cjs
  - .codex/stages/content-factory-next-9e9/artifacts/content-context-core.md
explicit_defers:
  - no-shared-module-registration-consumer-adoption-full-schema-apply-model-network-publish-workflow-or-deploy
---

# Summary

The stream delivers the shared deterministic `ContentContextBuilderV1`, the
tenant-scoped fact/evidence/context backend API and the common Post provenance
sink. HTTP DTOs never accept an organization id or an `asOf` clock. The
controller derives organization and actor from the authenticated request;
context read/build and member proposals use `Sections.AI`, while evidence
review and trust assessment require `Sections.ADMIN`.

The builder resolves the accepted immutable brand-profile context before
memory selection. It performs only bounded Prisma reads and local SHA-256,
normalization, ranking and rendering. It imports no model, AI-usage, retrieval
or network dependency. Every explicit fact/source/evidence id is preflighted
with the tenant predicate and a missing or foreign id is the same 404.

Selection rechecks persisted fact state, accepted support, accepted
assessment, trust, source rights/lifecycle/robots/current snapshot, freshness
and accepted contradictions. For registered sources the mutable
`ContentSource.freshUntil` from the latest validation receipt is authoritative;
immutable evidence/snapshot TTL is used only for source-less
`SEARCH_PROVIDER_RESULT` material. A registered source must point exactly to
the evidence snapshot; a null or different `currentSnapshotId` fails closed.
Nested support links are ordered in Prisma and sorted again at the domain
boundary. Ordering is a stable tuple of explicit
choice, trust, lexical overlap, freshness and id. Output is capped at eight
facts, eight evidence records, 800 characters per excerpt and 12,000 rendered
characters. Citation ids are stable `F1..F8` and `E1..E8`; URL query and
fragment data is removed. Internal sources never expose a URL. Removed source
history renders the `SOURCE_REMOVED` tombstone without URL or excerpt.

The immutable snapshot/items transaction records the exact profile version and
digest, policy versions, budgets, counts and rejection reasons. Each fact item
also freezes its bounded statement, temporal kind, verification/freshness
instants and selected evidence citation ids. GET therefore does not change when
the mutable fact or its review links later change; live rows are consulted only
at draft finalization for current eligibility. The canonical GET envelope
returns facts with `evidenceCitationIds`, a separate evidence array,
`EVIDENCE_REQUIRED` plus the distinct public
`CONTENT_EVIDENCE_REQUIRED` code. `withModelAdmission` rejects that policy
before invoking the supplied operation.

Fact creation derives normalized value/dedupe hashes and is always
`UNVERIFIED`; member evidence links are always proposals. A later member retry
cannot downgrade an admin-reviewed link. Admin review and assessment update
the mutable fact lifecycle in one transaction without editing immutable source
snapshots or evidence. `TOMBSTONED`, `RETRACTED` and `SUPERSEDED` are terminal:
review or assessment can never evaluate them back into an active status.

`Post` DTOs accept only the server-issued context id, optional matching profile
id and citation ids. A multi-item thread must put `usedCitationIds` on each
`PostContent`; the legacy common list remains a single-item fallback and is
rejected as ambiguous for threads. With a context, `PostsRepository` accepts a
draft create or draft update, opens one Prisma transaction, re-resolves every
relation with `organizationId`, validates each item's citations independently,
then writes Post, `ContentOutputContext` and `DraftEvidence` atomically. Fact
citations are checked against the frozen statement hash and frozen evidence
citation ids, never mutable support links. A contextless update atomically
clears both typed Post pointers, every current output binding and draft
evidence. Every client Post id and replacement group is tenant-preflighted and
all update/upsert/delete predicates are tenant-scoped. Unknown citations,
foreign/missing/tombstoned or blocked dependencies fail before the Post write.
A provenance-write failure rolls back the Post. Existing `researchSources`
remains a compatibility JSON field and is never treated as evidence.

`invalidatedAt` is intentionally an admission boundary rather than a history
deletion signal: finalization rejects an invalidated snapshot, while canonical
GET continues to render its immutable, redacted provenance for audit and draft
history. This avoids making an already recorded output non-reproducible.

# Verification

Focused production-module checks cover:

- deterministic ordering, selection hashes and immutable round-trip;
- shuffled nested evidence links producing identical citations and hashes;
- latest source receipt freshness in both directions: refreshed immutable
  evidence is reusable and a stale current receipt blocks finalize;
- frozen fact statement/temporal/freshness/citation output after live fact and
  link mutation;
- frozen statement-hash tampering rejection and frozen-only evidence binding;
- 8/8/12k and 800-character hard bounds;
- foreign explicit ids and cross-tenant context reads as indistinguishable
  not-found responses;
- current-required stale/conflict outcomes and a zero-call model-admission
  seam;
- source removal redaction after the immutable snapshot was created;
- server-derived fact hashes and organization/actor arguments;
- member proposal versus admin-reviewed evidence integrity;
- controller AI/admin policy metadata and absence of organization in DTOs;
- exact context/profile/citation/evidence Post links plus legacy JSON;
- independent citation/evidence bindings for every item in a two-item thread;
- fail-closed terminal fact transitions and null/mismatched source snapshot pointers;
- contextless draft updates clearing typed provenance in the same transaction;
- foreign Post ids and replacement groups rejected by both the stateful harness
  and a disposable PostgreSQL-backed production repository run;
- fail-closed foreign, tombstoned and blocked references;
- atomic rollback when `ContentOutputContext` persistence fails;
- legacy Post research-source persistence after the transaction refactor.

The backend TypeScript build graph compiles with no diagnostics. Owned files
pass Prettier and scoped whitespace checks. Prisma format, validate and generate
pass; a fresh diff from exact `6e1d1621` is byte-identical to the migration and
the additive SQL guard accepts all 137 selected statements. The local
PostgreSQL proof used a uniquely named disposable schema/container and both
were removed. No live/shared database, model, AI allowance, credentials,
publishing, workflow or deployment action ran.

# Risks / Follow-ups

- Root must register `ContentContextRepository`, `ContentContextBuilderV1`,
  `ContentContextService`, `ContentFactRepository`, `ContentFactService` and
  `ContentContextController` in the shared Nest modules. This stream did not
  touch root-owned module files.
- Generator, editor, Mastra and AutoPost V2 adoption remains root/consumer
  work. Each must build once before AI admission, honor
  `CONTENT_EVIDENCE_REQUIRED`, carry the exact snapshot/profile ids and save
  only through the shared Post sink. This stream does not itself call a model.
- Atomic provenance success/rollback still uses a stateful Prisma-shaped fake.
  The disposable PostgreSQL run exercises the production repository's negative
  tenant preflight against real query semantics, but not a full positive
  provenance write or the complete stage migration apply/restore/reapply. Root
  acceptance owns those broader integration checks.
- MVP lexical selection is intentionally bounded to 64 database candidates;
  relevance and warm p95 need traffic-like validation. This does not relax
  tenancy, lifecycle, freshness, conflict or size gates.
- Source/profile deletion after an already committed draft preserves historical
  ids and renders tombstones; future purge/invalidation job runtime proof is
  outside this stream.
