---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:public-funnel-runtime-proof
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: content-factory-next-or3 root integration and acceptance
public_facade: public growth event POST registration and OAuth callback POSTs and protected aggregate report GET
bounded_acceptance: disposable PostgreSQL 17 plus real Nest HTTP auth DTO provider persistence throttling atomicity rollback and idempotency proof
non_goals:
  - product source changes schema migrations db push deployment or remote database access
  - full backend bootstrap external integrations browser lifecycle or release acceptance
  - production rate-limit sizing or operational load testing
evidence:
  - runtime-proof
  - postgresql-proof
  - nest-http-proof
task_id: content-factory-next-or3.public-funnel-runtime-proof
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: reproducible public funnel server and database proof
milestone_status: accepted
agent_type: backend-developer
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - tests/public-funnel-runtime-proof.test.cjs
  - scripts/evidence/run-public-funnel-database-proof.cjs
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime
  - .codex/stages/content-factory-next-or3/artifacts/public-funnel-runtime-proof.md
success_criteria:
  - a real Nest HTTP route accepts one allowlisted event and rejects extra fields and a trusted-only name
  - the public route exhausts its actual 120-request bucket and returns 429 on request 121
  - admin report rejects a non-super-admin before a PublicGrowthDaily query and returns fixed aggregates to a super-admin
  - email-first step one makes no registration request and leaves User Organization and Tags empty
  - LOCAL and a strictly local OAuth callback both traverse AuthController AuthService OrganizationService OrganizationRepository and Prisma through POST auth register
  - the real global DTO pipe rejects unsupported and multi-valued starterTemplate before the repository
  - explicit blank and omitted starter intent with omitted workspace are accepted without tags
  - LOCAL duplicate and OAuth callback or register replay create no second organization or tag quartet
  - content-workflow creates one organization user and exactly Plan Draft Review Schedule in one nested Prisma write
  - blank creates no tag and duplicate identity leaves no second organization or tag quartet
  - trusted public-growth persistence stores an HMAC receipt once rolls receipt and aggregate back together and feeds the real report
  - every disposable Docker resource is removed and machine evidence contains no skipped check
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-or3/spec.md
  - .codex/stages/content-factory-next-or3/plan.md
  - .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-implementation.md
  - .codex/stages/content-factory-next-or3/artifacts/conversion-report-implementation.md
selected_skills:
  - receiving-code-review
  - test-driven-development
  - systematic-debugging
  - verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: unique PostgreSQL container volume and network were removed; labeled and prefixed Docker inventory is empty; Nest Prisma pg and jsdom resources were closed
risk_level: high
risk_tags:
  - auth
  - data
  - atomicity
  - rollback
  - idempotency
  - public-api
affected_surfaces:
  - api
  - backend
  - database
invariants:
  - privacy
  - authorization
  - idempotency
  - rollback
  - test-matrix
verification:
  - 'TDD RED: Node 22.23.2 pnpm exec jest --runInBand tests/public-funnel-runtime-proof.test.cjs failed 1 of 1 because the proof runner did not exist'
  - 'CORRECTION RED: the focused suite failed because the prior machine summary had 10 checks instead of 15 and no real auth HTTP evidence'
  - 'CORRECTION AUTH: real POST auth register returned 200 and exact four-tag seeds for LOCAL and for OAuth after POST auth oauth GOOGLE exists returned the local callback token with 201'
  - 'CORRECTION DTO: the real global ValidationPipe returned 400 for unsupported and array starter intent with zero repository calls and unchanged database counts'
  - 'CORRECTION COMPATIBILITY: explicit blank and omitted starter intent with omitted workspace each returned 200 and created zero tags under the neutral Workspace name'
  - 'CORRECTION REPLAY: LOCAL duplicate returned 400; OAuth callback replay and register replay returned 200; repository calls and database counts remained unchanged'
  - 'CORRECTION BOUNDARY: AuthController AuthService UsersService UsersRepository OrganizationService OrganizationRepository and PrismaClient were real; only email notification newsletter and one strict in-process OAuth provider were local boundaries; external calls equal zero'
  - 'STABILITY ROOT CAUSE: container-local Unix-socket pg_isready could observe the postgres image temporary init server before final TCP startup and caused one ECONNRESET; readiness now retries only real published-port TCP connect plus SELECT 1'
  - 'CORRECTION GREEN 1: the focused suite passed 1 of 1 in 8.344 seconds with 15 PASS checks zero skips and empty cleanup'
  - 'CORRECTION GREEN 2: an immediate second focused run passed 1 of 1 in 7.413 seconds with 15 PASS checks zero skips and empty cleanup'
  - 'FINAL DETERMINISM: disposable random organization identifiers are omitted from retained evidence; two consecutive 15 of 15 runs produced byte-identical hashes for all six machine JSON files'
  - 'HTTP: actual Nest controller guard service and repository returned 202 for allowlisted demo_started 400 for an extra email field 400 for trusted-only registration_completed and 429 on request 121'
  - 'ADMIN AUTH: ordinary user returned 400 with zero PublicGrowthDaily queries; super-admin returned 200 with exactly six totals and five ratios from PostgreSQL rows'
  - 'POSTGRESQL: postgres:17 reported 17.10; nested tag failure rolled User Organization and Tags from zero back to zero; successful workflow produced counts 1 1 4 and exact four names/colors'
  - 'IDEMPOTENCY: direct and HTTP blank organizations had zero tags; direct duplicate LOCAL HTTP duplicate and OAuth replay left their database counts unchanged'
  - 'PRIVACY: trusted duplicate returned recorded false; one selected receipt contained the independently derived SHA-256 HMAC and no raw key; four HTTP registrations plus the selected receipt produced aggregate count five'
  - 'ROLLBACK: injected aggregate constraint failure left zero workspace_activated receipt rows and zero workspace_activated aggregate rows'
  - 'CLEANUP: machine cleanup evidence reports PASS with empty containers volumes and networks; direct Docker prefix inventory was empty'
  - 'MACHINE EVIDENCE: summary auth HTTP and database JSON record 15 PASS checks zero skips the complete local provider boundary and empty cleanup'
  - 'DIFF: an isolated temporary Git index ran git diff --check only over every owned code evidence and artifact path and passed'
  - 'ARTIFACT: scripts/orchestration/validate_artifact.py accepted this orchestration-artifact/v3 file'
changed_files:
  - tests/public-funnel-runtime-proof.test.cjs
  - scripts/evidence/run-public-funnel-database-proof.cjs
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/cleanup.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/auth.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/database.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/environment.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/http.json
  - .codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/summary.json
  - .codex/stages/content-factory-next-or3/artifacts/public-funnel-runtime-proof.md
explicit_defers:
  - root orchestrator owns integrated stage acceptance and any broader browser or backend build checks
  - the fixture intentionally models only tables and scalar columns touched by these real Prisma paths and is not a schema deployment mechanism
---

# Summary

Added a reproducible proof harness without changing product source. It starts a
uniquely named `postgres:17` container on a unique network and volume, creates
only a disposable fixture schema, and invokes the current generated Prisma
client against the real organization, user, and public-growth repository
classes. It also starts a minimal real Nest application with the current auth,
public-growth, and admin controllers, the global production-shaped
`ValidationPipe`, the public throttling guard, and the real touched services and
repositories.

The machine result is
`.codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/summary.json`.
Supporting JSON separates auth, HTTP, database, environment, and cleanup facts.
The summary reports `PASS`, fifteen passing checks, zero skipped checks, Node
22.23.2, pnpm 10.6.1, PostgreSQL 17, and no remaining Docker resource.

The email-first check renders the current component and advances only step one.
It observes one anonymous `signup_started` call, no `/auth/register` call, and
zero `User`, `Organization`, and `Tags` rows. The database then proves both
failure and success of the current nested Prisma organization create. A forced
tag constraint failure leaves all three tables at zero. A normal
`content-workflow` write produces one user, one organization, and exactly Plan,
Draft, Review, and Schedule. Blank adds no tag. A repeated LOCAL identity fails
with Prisma `P2002` and leaves organization and tag counts unchanged.

The correction extends that proof through the real registration HTTP boundary.
LOCAL `content-workflow` traverses `AuthController`, `AuthService`,
`UsersService/Repository`, `OrganizationService/Repository`, and Prisma before
creating exactly four tags. OAuth first traverses
`POST /auth/oauth/GOOGLE/exists`; a strict in-process provider converts one
fixed synthetic callback into a fixed synthetic provider token and identity.
That token then traverses the same `POST /auth/register` chain and produces its
own exact four-tag seed. Repository-boundary instrumentation records the chosen
`content-workflow` for both calls while delegating unchanged to the real
repository method.

Explicit `blank` and an omitted starter intent both accept an omitted workspace
and persist the neutral `Workspace` name with zero tags. The real global DTO
pipe returns 400 for an unsupported string and for a multi-valued array before
the repository is called. A LOCAL duplicate returns 400. Replaying both the
OAuth callback and the OAuth registration returns the existing login without a
second repository call, organization, or tag quartet. The provider stub has no
network implementation: attempting to generate an OAuth link throws, and the
evidence records zero external calls. Email, notification, and newsletter
delivery are also inert local boundaries because they are unrelated
post-registration integrations; the touched auth, organization, user, and
persistence classes remain real.

The HTTP proof sends requests over a bound TCP port rather than calling
controller methods. The allowlisted event returns 202. An extra email field and
the trusted-only `registration_completed` name both return 400. The actual
120-request guard bucket returns 429 on request 121. The admin route returns 400
for an ordinary user without issuing a `PublicGrowthDaily` query, then returns
only the six fixed totals and five fixed ratios to a super-admin.

Trusted persistence is exercised through the real service and repository. The
second identical receipt returns `recorded: false`; PostgreSQL contains one
independently verified SHA-256 HMAC and not the raw synthetic organization key.
A forced aggregate failure rolls back both its receipt and daily aggregate.
The super-admin report reads the surviving real aggregate rows.

# Verification

Focused TDD used one exact command under Node 22.23.2. The original RED failed
because the runner was absent. Correction RED then failed because the prior
summary exposed only ten checks and no auth evidence. After the real auth chain
was added, the exact focused command passed twice consecutively. The final run
passed one suite and one test in 7.413 seconds; its executable proof produced
fifteen PASS checks without a skip.

One intermediate run failed before behavior checks with `ECONNRESET`. Root
cause was the readiness probe: container-local `pg_isready` observed the
official image's temporary Unix-socket init server, which stops before the final
published TCP server starts. Readiness now resolves the published port and
retries only TCP connect plus `SELECT 1`. No behavior assertion is retried. Two
immediate complete GREEN runs after that change provide the stability evidence.

No `prisma db push`, Prisma migration, deployed database, external service,
credential, paid call, commit, push, PR, or deploy was used. The proof fixture
uses local PostgreSQL DDL solely inside the disposable database; application
writes and reads use the current generated Prisma client and current product
repositories.

Graphify was used before broad inspection and the exact files were then
confirmed in the current worktree. Marker: `graph-reviewed`.

# Risks / Follow-ups

This is bounded runtime evidence, not a full backend bootstrap or release gate.
Its Nest module uses the real touched route and service classes but supplies
inert values for unrelated admin-controller services and external delivery
integrations. OAuth identity exchange ends at the documented strict local
provider stub, so this proof does not claim a real third-party OAuth round trip.
The PostgreSQL fixture includes only the models and scalar columns needed by the
exercised Prisma paths. Root owns integration with the concurrent stage changes
and any broader browser, build, or release acceptance.

All created Docker resources used the unique `cf-public-funnel-*` run name and
the unique proof label. The runner closes Nest, Prisma, PostgreSQL, and jsdom in
all normal and failure paths, then removes the container, volume, and network.
Both machine cleanup evidence and direct inventory inspection were empty.
