# Empty-schedule draft candidate delivery

Task `content-factory-next-2q28.2.1`; local candidate only. Root owns
acceptance/integration/release/live execution and tracker state.

Base `d70c2106295e0c396d3917545447da5c94c331a6`;
branch `codex/empty-schedule-draft-2026-10-02`;
worktree `/home/me/code/content-factory-next-worktrees/0qgn-empty-schedule-draft-20261002`.
The exact completion commit is returned separately; verification.json binds
five changed inputs and 15 unchanged protected inputs by SHA-256.

## Outcome and source flow

PieceService resolves the effective mode through existing org-scoped
adaptPlanMode (own override first, otherwise current channel mode). Only draft
passes a server-owned third argument to AgentGraphService.start. A declared
LangGraph channel carries it to postDateTime, which bypasses the preliminary
global scheduler. Public body/options cannot set that argument; actual public
PostsController still passes two arguments.

Existing draft/derivation persistence and the final locked mode re-read remain.
The existing fallback DRAFT date is storage metadata; draft mode returns
plan=draft/date=null. Non-draft Piece preliminary/final scheduling is retained.
Empty/invalid stored schedules now fail with BadRequestException before post
date reads. Valid earliest UTC slots/format stay intact; occupied scans stop at
today through day +366 (367 daily reads). No publication time is invented.

Source changes are limited to posts.service.ts, agent.graph.service.ts, the
approved narrow PieceService link and internal GeneratorRunInput scheduling
type. No public DTO/controller/repository/schema/Temporal/release/host change.
Detailed contract and retained boundaries: draft-schedule-contract.md.

## Proof

- Meaningful base-source RED: 26 failed/7 passed, 33 total, zero skips. A bounded
  diagnostic sentinel exposed the infinite scan without hanging the test run.
- Development focused GREEN: 33/33. Final coverage then expanded to 41 cases.
- Final complete selected set: 8 suites, 270/270, zero failures/skips, including
  all 41 new regressions. detectOpenHandles returned [], natural exit 0.
- Backend types: exit 0. Working/staged diff checks: exit 0.
- Actual PieceService -> compiled LangGraph -> owned draft save; actual public
  controller body-spoof/error-stream consumer; actual IntegrationService and
  both repository read methods. ORM/provider/model ports are substituted.
- Covers effective overrides/current/locked changes, empty/malformed draft,
  non-draft typed refusal, UTC today/next day/midnight/day +366, occupied horizon,
  foreign scope, missing optional store, mode/save failures without false
  success, four existing model stages and one usage scope.

Own frozen/offline pnpm install: 2977 packages, downloaded 0; own Prisma 6.5.0
client generation only, no DB. Two existing suites initially could not load
bcrypt after ignore-scripts. Own bcrypt 5.1.1 was then built from existing local
source/Node headers through pnpm rebuild with forced build-from-source; installed
node-pre-gyp's early source-build branch avoids the download path. All eight
selected suites were rerun successfully afterward. The two earlier harness
loader failures and one intermediate flag-placement correction are preserved
separately and are not accepted source proof. Raw nonempty logs are retained
losslessly as gzip (mtime 0); empty backend-types.log remains plain text.

## Limits and safe cleanup

No real DB/provider/model/API/host or live B1 call occurred. The finite horizon
bounds daily reads, not a stalled database call's duration. Non-draft
preliminary global scheduling and the existing final channel/queue/Temporal
rules remain; existing partial save may retain its DRAFT after derivation-save
failure. This does not establish the cause of an earlier OOM or production,
semantic/product-quality, SaaS or whole-EPIC acceptance.

All test/build sessions exited. No server/container/background service was
created; fixture timers were zero and restored. Retain the isolated worktree,
own dependency/native/client artifacts and proofs for root integration. No
shared caches/resources, primary files, accepted readiness worktree or other
workers were removed or changed. Writer freezes after the completion event.

Graph-reviewed: borrowed root c1e44cfd graph orientation through native focused
findFreeDateTime/postDateTime lookups; exact d70 sources confirmed. No graph
refresh/logging/config mutation, remote, push, Beads or paid action.
