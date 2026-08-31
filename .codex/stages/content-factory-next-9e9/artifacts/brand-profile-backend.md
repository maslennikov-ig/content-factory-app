---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:brand-profile-backend
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.brand-profile-backend
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
cleanup_notes: Shared-worktree delivery only; the temporary standalone TypeScript config was removed and no runtime, browser, database, network or external resource was created.
risk_level: high
risk_tags:
  - tenancy
  - authorization
  - versioning
affected_surfaces:
  - backend
  - api
  - data
invariants:
  - organization-tenancy
  - immutable-published-versions
  - admin-only-mutation
  - zero-model-manual-path
verification:
  - 'RED: Node 22.23.2 and pnpm 10.6.1; node --test tests/brand-profile.contract.test.cjs failed at the missing real brand-profile service entrypoint'
  - 'INITIAL GREEN: node --test tests/brand-profile.contract.test.cjs — 8/8 passed'
  - 'P1 DIGEST RED: persisted content changed without its digest activated successfully; malformed tampering downgraded to 422 instead of fail-closed unavailability; published runtime resolution also returned the altered content'
  - 'P1 CONCURRENCY RED: the shared serializable pin protocol was absent, so deactivation had no retryable ordering contract with concurrent AutoPost V2 creation'
  - 'P1 GREEN: node --test tests/brand-profile.contract.test.cjs — 11/11 passed, including malformed/valid digest tampering, a deterministic barrier race and bounded repeated P2034 conflicts'
  - 'TYPECHECK: standalone strict noEmit config containing only the owned backend graph — passed; temporary config removed'
  - 'FORMAT: Prettier check for all owned TypeScript/CJS files — passed'
  - 'SCOPED DIFF: git diff --check for all owned product/test files — passed'
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.types.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.context.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/brand-profile.dto.ts
  - apps/backend/src/api/routes/brand-profile.controller.ts
  - tests/brand-profile.contract.test.cjs
  - .codex/stages/content-factory-next-9e9/artifacts/brand-profile-backend.md
explicit_defers:
  - no-shared-module-registration-ui-consumer-model-network-publish-or-deploy
resolves_review: 213c5b71-af0b-4dcb-a9f0-1b9c3676ddc5
completion_event: 3ceb4902-8abd-498d-8b6c-8ad00ef319fd
---

# Summary

The stream delivers the manual, zero-model brand-profile backend facade at
`/content-intelligence/brand-profile`. Request DTOs never accept a trusted
organization id; the controller derives it from the authenticated request.
All repository lookups and writes repeat the tenant predicate.

One organization-owned profile contains mutable optimistic-revision drafts and
immutable published versions. Activation/select/restore/deactivate operations
move the active pointer and append the exact audit record in the same Prisma
transaction. Activation and deactivation retries are idempotent. A failed audit
write rolls back the version/pointer update. A live AutoPost V2 dependency
blocks deactivation atomically and returns its bounded ids for remediation.

The deterministic resolver implements explicit `active`, `version`, `none`
and legacy-absence behavior. Missing, foreign-tenant, draft, archived and
deactivated explicit versions all collapse to `409
BRAND_PROFILE_VERSION_UNAVAILABLE`, so existence is not disclosed. No-profile
active selection returns the visible neutral fallback. Platform overrides may
add guardrails and replace only the declared style fields; global prohibitions
remain present.

Draft validation rejects malformed/unknown fields, normalized lexicon
conflicts and payloads above 64 KiB. Activation additionally enforces the
minimum viable profile and the 16,000-character rendered-context ceiling.
Published content and its SHA-256 canonical digest are never edited in place;
editing starts a lineage-preserving clone.

The P1 integrity correction no longer trusts the digest column by itself.
Activation recomputes canonical SHA-256 from the persisted content before any
validation and again inside the write transaction. Every active/explicit
runtime resolution, published clone/selection/restore and the AutoPost pin
protocol recomputes it as well. A mismatch is always the non-bypassable `409
BRAND_PROFILE_VERSION_UNAVAILABLE`; it cannot fall through to client
validation, pointer/audit writes or prompt context.

Deactivation now runs as a Prisma interactive `Serializable` transaction with
at most three complete attempts on `P2034`. The repository exports
`withPinnedPublishedVersionWrite`: later AutoPost V2 creation must validate the
same-tenant, non-deactivated, published and digest-correct pinned version and
insert its database row through the callback in the same serializable
transaction. The callback is explicitly database-only; model, network and
workflow side effects happen after commit.

# Verification

Focused tests execute the real DTO/controller/service/context/repository and a
stateful Prisma-shaped fake whose transaction uses copy-on-write commit. The
fake intentionally throws on an audit insert to prove rollback, not merely the
requested mock call.

Covered behaviors:

- tenant-scoped create/read/update plus foreign-version non-disclosure;
- optimistic revision conflict without lost update;
- valid atomic publication, immutable published snapshots and idempotent retry;
- clone-to-edit lineage and explicit restoration after soft deactivation;
- missing/draft/foreign/deactivated resolver failures and all neutral modes;
- effective provider override without weakening global prohibited claims;
- incomplete activation, unknown input and lexicon-conflict rejection;
- atomic deactivation rollback and AutoPost V2 dependency conflict;
- `Sections.ADMIN` metadata on every mutation, with reads/resolve left to any
  authenticated member;
- dependency graph rejects any model, AI admission or network import on the
  manual path.
- canonical digest tampering, including malformed content, fails before
  activation validation and leaves lifecycle, pointer and audit unchanged;
- active and explicit runtime reads both reject altered published content
  without any read-side write;
- a barrier pauses deactivation after its dependency predicate read, commits a
  concurrent V2 pin through the shared protocol, then proves `P2034` retry sees
  the dependency and blocks deactivation without losing either row;
- permanent `P2034` contention performs exactly three transactional attempts,
  persists no callback write and returns the final conflict.

# Risks / Follow-ups

- Root must register the controller, repository, context and service in the
  shared Nest modules; this stream intentionally did not touch those files.
- The focused transaction fake mirrors query predicates, atomic increment and
  rollback plus PostgreSQL-style serializable commit conflicts, but root
  integration remains responsible for the final generated Prisma/app
  acceptance against the concurrently integrated streams.
- AutoPost V2 consumer integration must call
  `withPinnedPublishedVersionWrite`; root must recheck this seam after that
  consumer lands and reject any direct create path that validates outside the
  shared serializable transaction. Its callback must contain database writes
  only because `P2034` retries rerun the callback.
- Provider identifiers are bounded and normalized here. Checking an arbitrary
  integration UUID against the organization's installed providers belongs to
  the later consumer adapter; canonical slugs remain valid for the manual
  profile contract.
- No live database, model, network, publisher, workflow, credentials or deploy
  action was used.
