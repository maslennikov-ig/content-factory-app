# Sixth walk wave execution contract

Source: docs/product/sixth-walk-wave-2026-09-14-spec.md and docs/prompts/astra-sixth-walk-wave-2026-09-14.md.
Beads is the sole task status authority: 4zul.1–.10 and 75xn.35; 4zul.11 stays with Claude. Preserve 75xn.9/.33/.34 exclusions.

## Ownership and integration

- S1 agent/s1, /home/me/code/cf-4zul-s1: intake/questions/search scope; tasks .1/.2/.10. Sol high; interacting backend decisions.
- S2 agent/s2, /home/me/code/cf-4zul-s2: piece/answers/review UI; tasks .3/.5/.6/.7/.8. Sol high; coupled backend/UI behavior.
- S3 agent/s3, /home/me/code/cf-4zul-s3: provider settings and FAQ .9. Luna max; bounded edit.
- Root S4 after S1/S2: research enrichment .4 and 75xn.35, recorded flow regression first.
- Integration order S3, S1, S2, S4. Each worker commits and returns focused evidence; root records acceptance and safe cleanup here. No child closes Beads.

## Retained gates

No schema changes, paid model tests, secret disclosure or edits in public output clone. Existing protected prompts/contracts require version successors; old facts questions remain readable and close without another interview.
Owner demonstration at localhost:4200 must precede release and requires explicit yes per current order. Only cf-dev-* runtime belongs to this wave.
One root full suite via record-suite-receipt.sh, build, three app tsc, diff and process checks. Batch Beads closure after all streams with individual readback.
Release through private push after fetch, public copied tree with contiguous Source-Commit/Co-Authored-By trailers, archive/build/nginx/no-env/image verification, host pull/schema/Mastra/switch/retention and three HTTP 200 checks. Rollback 447e360f7007.
Final evidence JSON and <=200-line handoff with Next stage id and Recommended action; bd remember; help FAQ.

## Evidence

Initial checkout clean on main at 31bab100. Wave branch and three isolated worktrees created. Existing root Graphify report is old (94fdcb33); use only for orientation and confirm exact files.

## Technical premortem

Verdict: GO WITH CONDITIONS. Scope: piece enrichment door -> intake research/digest -> Redis snapshot -> core writer -> brief repository -> ResearchOutcome. Reversibility: code rollback to 447e360f7007, no schema migration.

| Failure symptom | Evidence and mechanism | Detection and mitigation | Owner |
|---|---|---|---|
| Continuing findings repeats paid search | Intake helpers currently private; existing snapshot flow explicitly avoids replay | Piece continuation reads snapshot; missing/expired state refuses without a new search; recorded calls assert one search | Root S4 |
| Another tab loses edits | Existing pieces.acceptCoreReview atomically compares body, brief and title | Bind snapshot to org, user, piece, original body/brief; compare before model and conditional write; stale tests | Root S4 |
| Foreign tenant consumes findings | Existing intake snapshot keys carry org and actor | Separate piece key namespace plus payload ownership checks | Root S4 |
| Enrichment still uses deep corrective review | Current reviewV2 branches mode research to level deep | Remove mode from active doors/UI, keep immutable historical contracts; standard research + digest, no questions | Root S4 |
| Optional service injection silently unavailable | Piece constructor comment documents union metadata Object issue | Explicit Inject for any optional runtime service; three-app typecheck and wiring test | Root S4 |
| Old questions become unreadable | Stored brief JSON contains facts and existing contract is protected | Version successor; legacy facts questions close; recorded legacy tests | S1/S2 |
| Release publishes private material or wrong receipt | Existing release scripts gate copied tree and Source-Commit | Build public copied tree only; contiguous trailers, no /app/.env, source and image guards | Root |

Preflight: recorded snapshot ownership/stale/no-repeat tests, user-approved local demonstration, exact-source suite receipt, empty schema diff and unchanged Mastra metadata before switch. No extra reviewer or broad intermediate suite required.

S3 delivery accepted: ebc8ed71 merged in prescribed first position. Focused 67/67 initial checks, amended FAQ 17/17, diff clean. Source/config/FAQ reviewed; no public pushes or Beads closure. Clean worktree and merged local branch removed after ancestry check; no force or unrelated cleanup. Root will align the existing adjacent review FAQ with S2 removal of author questions.

Release baseline verified read-only: image 447e360f7007 healthy; product database has zero Mastra tables by design, separate MASTRA_DATABASE_URL database has 29. Canonical Mastra schema SHA-256: 310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7. Local backend start needed 8 GiB Node heap; orphaned own development children stopped, direct compiled backend running on 3000, frontend on 4200.

## S4 implementation decisions

Expose a narrow IntakeService enrichment facade over existing researchForIntake, digestResearch, researchRows and selection logic. No extraction/interview and standard level only. Keep prior selected found facts while adding new findings. PieceService uses the same optional IntakeService that answer-link reading uses and the existing injected Redis store; separate piece namespace binds organization, actor, piece and current body/brief/title. Start and accept are separate explicit authenticated doors. Accept must not call search; missing/expired/foreign/stale snapshots refuse, and the existing PieceRepository.acceptCoreReview performs the final conditional write. Retain unrelated piece metadata and original authorNumbers provenance. A core-writer fallback must not replace an existing good core. Frontend reuses ResearchOutcome and existing busy/error controls, without an enrichment instruction field. Immutable historical review contracts may remain importable; active review doors reject research mode.

S1 delivery accepted: ba01ab7f merged after S3. Root reviewed no-hidden-search and scope/country diffs. 9 focused suites / 151 tests passed, backend tsc and diff passed; protected contracts/schema unchanged. Two existing content-pieces.service expectations (facts question and hidden search) are explicitly owned by S2 integration. S2 merged the public readLink seam; clean S1 worktree and local branch removed after checking ancestry in root and S2.

S2 delivery accepted: 8d23f26c merged after S1. Root reviewed event versioning, link evidence and no-op review notes; corrections included. Focused 8 suites/230 passed, backend/frontend tsc passed, 31 foundation/contrast/AI checks passed, diff clean. Protected intake-v2 unchanged. Clean S2 worktree and merged local branch removed after ancestry check. S4 starts now with a recorded service-flow test.

S4 UI is delegated to Luna max in /home/me/code/cf-4zul-s4-ui (agent/s4-ui), owning adaptation-review.tsx and focused UI proof. Root owns server/contract. Settled piece-research/v1 contract at 67ee778f enables parallel work after S1/S2; backend flow test first red: four missing researchCore methods and legacy research review mode still accepted.

S4 backend delivered locally: authenticated POST /pieces/:id/research and /research/accept reuse intake research/digest and the one-hour Redis store. Recorded pipeline and existing adaptation backend: 44/44 passed; backend tsc passed after fixing the stored borrowed-context accessor. Old research mode is rejected before paid work. Snapshot comparison covers body/title/brief, save uses conditional updateMany, and original metadata/provenance survives. Wiring confirmed: global database module provides INTAKE_SNAPSHOT_STORE.

S4 UI delivery accepted: d249e8a4 merged after backend fa1bc9ec. Root reviewed selection/continuation/error paths against the service API. UI focused 21/21 and frontend tsc passed; worker tree clean and safely removed with merged branch. Root recorded pipeline 6/6 including DTOs passed. All four streams are integrated; no child remains writing.

docs-reviewed: updated — navigation now points to prompt successors and the research snapshot API; FAQ describes selected findings and no repeated search.
graph-reviewed: no-change-needed — existing local graph was read for orientation only; stale 94fdcb33 graph was not used as implementation evidence. Exact affected seams were checked in current files and focused recorded flows.

Final root acceptance: three application tsc checks prove types; record-suite-receipt.sh runs the full three-part pnpm test exactly once for the committed source; pnpm run build proves deployable applications; git diff --check and run_process_verification.sh prove source/process consistency. Owner stand approval and production gates remain pending.

Final acceptance first attempt at 56c2d1f9: all three tsc checks, pnpm run build and process verification passed. Jest reported 435 passed / 2 failed (5698 passed / 2 failed tests): new research routes were absent from the additive route expectation and roles-matrix documentation. Updated both, and added real controller forwarding/error coverage; focused 3 suites / 132 tests passed. No runtime source changed, so successful build/type evidence remains applicable. The exact-commit release receipt requires a fresh full suite after this test/docs-only correction.

Owner stand opened in Windows at http://localhost:4200/content; frontend login and backend root returned 200, updated research routes mapped. Five required scenarios listed to owner; explicit approval requested and pending. Automated model/search checks use recorded responses only.
