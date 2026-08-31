---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:data-foundation
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.data-foundation
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 6e1d1621
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
resolves_review: fda6d80b-dc46-4ea5-8988-a5091fcf9ef0
cleanup_status: cleaned
cleanup_notes: Root accepted the corrected shared-worktree delivery after independent review and repeated focused verification; no child worktree or runtime resources remained.
risk_level: high
risk_tags:
  - data
  - migration
  - tenancy
affected_surfaces:
  - database
  - data
  - contract
invariants:
  - additive-schema-only
  - organization-tenancy
  - immutable-provenance
  - legacy-row-compatibility
  - no-runtime-side-effects
verification:
  - 'RED: Node 22.23.2, pnpm 10.6.1; node --test tests/content-intelligence.persistence.test.cjs against the generated baseline client — 0/5 passed, all failures named the absent models/relations'
  - 'INITIAL GREEN: after prisma validate/generate; node --test tests/content-intelligence.persistence.test.cjs — 5/5 passed'
  - 'MUTATION RED: Post.contentContextSnapshot relation reduced from composite tenant FK to id-only, client regenerated — 4/5 passed and the Post relation assertion failed; restoration regenerated the client and returned 5/5'
  - 'P1 RED: current generated client lacked SourceSyncRun.resultSnapshot and SourceSnapshot.retrievalProvider — 4/6 passed, 2 failed'
  - 'P1 GREEN: nullable composite current/result snapshot pointers plus search-provider provenance added; prisma client regenerated — 6/6 passed'
  - 'P1 MUTATION RED: ContentSource.currentSnapshot reduced to id-only, client regenerated — 5/6 passed; restoration returned 6/6'
  - 'PRISMA: prisma format, DATABASE_URL=<local-placeholder> prisma validate and prisma generate on Node 22.23.2 — passed; no database connection was made'
  - 'MIGRATION EQUIVALENCE: fresh prisma migrate diff from exact 6e1d1621 schema compared byte-for-byte with migration.sql — passed; 137 additive statements'
  - 'SQL GUARD: exact command recorded in the Verification section — SQL apply guard passed: 137 explicitly selected statement(s)'
  - 'ROOT APPLY/RESTORE/REAPPLY: PostgreSQL 17.10 disposable database; exact baseline schema applied, backup restored, guarded migration applied twice across the restore boundary, and all 14 models were present after each apply'
  - 'CONTRACT: standalone TypeScript noEmit compile and Prettier check — passed'
  - 'SCOPED DIFF: git diff --check on the five owned files — passed'
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/prisma/migrations/20260820143000_add_content_intelligence_foundation/migration.sql
  - libraries/nestjs-libraries/src/content-intelligence/contracts.ts
  - tests/content-intelligence.persistence.test.cjs
  - .codex/stages/content-factory-next-9e9/artifacts/data-foundation.md
explicit_defers:
  - no API, UI, repository, service, network, model, Temporal, publish or backfill behavior
  - production apply and lock timing remain deployment preflight; no deployed database was contacted
completion_event: 75a9da83-dc71-444a-8852-48d9b5297016
---

# Summary

The additive foundation introduces 14 organization-owned Prisma models:

- `ProjectBrandProfile`, `ProjectBrandProfileVersion`, `BrandProfileAuditEvent`;
- `ContentSource`, `SourceSyncRun`, `SourceSnapshot`, `SourceEvidence`,
  `ContentEvidenceAssessment`;
- `ContentFact`, `ContentFactEvidence`;
- `ContentContextSnapshot`, `ContentContextItem`, `ContentOutputContext`,
  `DraftEvidence`.

Every new root/join stores `organizationId`, exposes
`@@unique([organizationId, id])`, and uses composite tenant foreign keys for
cross-model provenance. `Organization` owns all new roots. `Post` adds nullable
typed snapshot/profile relations and typed output/evidence relations while
keeping `researchSources String @default("[]")`. `AutoPost` adds nullable source
and profile pins, `workflowVersion = 1`, and `requiresAttention = false`, so
existing rows remain legacy-compatible.

`ContentSource.currentSnapshotId` and `SourceSyncRun.resultSnapshotId` are
nullable composite same-tenant pointers to `SourceSnapshot`. They let a
transaction record a successful 304 or same-hash validation against the reused
immutable snapshot without creating a duplicate. `SourceSnapshot` also carries
nullable `retrievalProvider` and JSON `providerMetadata` for bounded
`SEARCH_PROVIDER_RESULT` provenance; later services own the provider allowlist
and payload-size validation.

Published brand versions, context snapshots, source snapshots and evidence are
represented as separate rows with digest/revision/lifecycle/freshness/tombstone
metadata. Immutability remains a service contract for later streams; this
stream intentionally adds no runtime mutation path.

Pure TypeScript contracts export `BrandProfileSelectionV1`,
`ResolvedBrandProfileContextV1`, `ContentContextBuildRequestV1`,
`ContentContextEnvelopeV1`, `GroundedDraftPartV1`, the stable error codes
`CONTENT_EVIDENCE_REQUIRED` and `BRAND_PROFILE_VERSION_UNAVAILABLE`, and the
literal V1 budgets of 8 facts, 8 evidence items and 12,000 rendered characters.

# Verification

Focused TDD used the real generated `@prisma/client` DMMF. The test never reads
or greps `schema.prisma` and does not assert on mocks.

RED:

```bash
source /home/me/.nvm/nvm.sh && nvm use 22.23.2
node --test tests/content-intelligence.persistence.test.cjs
```

Result before schema changes: 5 failed, 0 passed because all 14 models and both
legacy-compatible provenance relations were absent.

GREEN and mutation sanity:

```bash
DATABASE_URL=postgresql://local:local@127.0.0.1:5432/local \
  pnpm exec prisma generate \
  --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
node --test tests/content-intelligence.persistence.test.cjs
```

Initial result: 5 passed. Temporarily reducing
`Post.contentContextSnapshot` from `[organizationId,
contentContextSnapshotId]` to the id-only relation produced the intended 4/5
mutation RED. Restoring the tenant relation and regenerating returned 5/5.

P1 correction RED/GREEN: before the correction, 4/6 passed and two tests failed
on the missing `SourceSyncRun.resultSnapshot` and
`SourceSnapshot.retrievalProvider`. After adding both nullable tenant pointers
and provider provenance, 6/6 passed. Reducing
`ContentSource.currentSnapshot` to an id-only relation produced the intended
5/6 mutation RED; restoring its composite tenant relation returned 6/6.

Migration creation/equivalence used real Prisma output from the exact baseline:

```bash
pnpm exec prisma migrate diff \
  --from-schema-datamodel <exact-6e1d1621-schema-file> \
  --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --script
```

A second fresh diff was byte-identical to the checked-in migration. A literal
statement scan found 137 statements, all beginning with `CREATE TYPE`,
`CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX`, or additive `ALTER TABLE`.
There are no `DROP`, rename, truncate, data update/delete, type change or
not-null conversion statements.

Exact production SQL guard command:

```bash
node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff libraries/nestjs-libraries/prisma/migrations/20260820143000_add_content_intelligence_foundation/migration.sql \
  --selected libraries/nestjs-libraries/prisma/migrations/20260820143000_add_content_intelligence_foundation/migration.sql \
  --allow-table Post \
  --allow-table AutoPost \
  --allow-table ProjectBrandProfile \
  --allow-table ProjectBrandProfileVersion \
  --allow-table BrandProfileAuditEvent \
  --allow-table ContentSource \
  --allow-table SourceSyncRun \
  --allow-table SourceSnapshot \
  --allow-table SourceEvidence \
  --allow-table ContentEvidenceAssessment \
  --allow-table ContentFact \
  --allow-table ContentFactEvidence \
  --allow-table ContentContextSnapshot \
  --allow-table ContentContextItem \
  --allow-table ContentOutputContext \
  --allow-table DraftEvidence \
  --allow-enum BrandProfileLifecycle
```

Result: `SQL apply guard passed: 137 explicitly selected statement(s).`

Root then exercised the selected migration against a disposable PostgreSQL
17.10 instance. It applied the exact `6e1d1621` baseline, saved a binary
backup, applied the selected migration in one transaction, restored the
baseline backup into a fresh database, and applied the migration again. All 14
new models were present after both applications. The container, backup and
temporary SQL files were removed at the end of the check.

# Risks / Follow-ups

- Rollout is expand-first: apply this schema before enabling any later consumer
  code. Old code ignores the new tables and nullable/defaulted columns.
- App rollback keeps the new tables read-only and returns to legacy reads. A DB
  down migration is intentionally absent. Physical removal would require an
  explicit later plan proving no adopted data; production recovery otherwise
  uses backup/restore or a forward fix.
- New rows and indexes increase migration lock time on `Post` and `AutoPost`.
  The two new Post columns are nullable and both AutoPost non-null additions
  have constant defaults; PostgreSQL apply timing must still be observed by the
  root-owned apply/rollback/reapply acceptance.
- Schema foreign keys enforce tenant consistency and provenance identity. Later
  services must additionally enforce lifecycle rules: only published profile
  versions are selectable, published versions/snapshots are immutable, purged
  evidence is excluded, and actor ids belong to active organization members.
- Later source services must update `SourceSyncRun.resultSnapshotId` and
  `ContentSource.currentSnapshotId` in the same transaction as successful run
  finalization. They must allowlist provider metadata keys and enforce its
  bounded size before writing the JSON payload.
- No deployed database, live service, network, model, workflow or publisher was
  contacted by this stream.
