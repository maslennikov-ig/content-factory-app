# Content Factory video reacceptance — 23 October 2026

**PASS: requested local browser and Temporal acceptance after review fixes.**
Application commit: `c06d6e3d7a0b017746e18d87e36fe26bc5797be1`, branch
`codex/video-v1-api`, owned `content-factory-next-worktrees/video-v1-api`.
Only the subscription Temporal acceptance runner was extended; application,
provider and versioned workflow/activity contracts remain unchanged.

## Observed behavior

| Path | Fresh evidence |
| --- | --- |
| Higgsfield subscription | UI connection via loopback OAuth, saved edits/approval, one submit, persisted result, reload/reopen without submit, actual playback/download |
| HeyGen subscription | Same complete UI journey, one submit, exact saved edits and owned playback/download |
| Existing API | Browser launch/result plus actual Temporal restart for both clip and presenter; two persisted receipts and two submits total in the Temporal runner |
| Manual upload | Real uploader and saved attachment; copy/export and intercepted provider link; playable/downloadable owned result; no quote or generation |
| Subscription restart | Stop worker after both receipts persist; fresh domain/worker instances finish both original receipts with one submit each |
| Subscription exhaustion | Actual workflows reach `status_delayed` for age/poll exhaustion; explicit resume creates cycle 1 with a fresh persisted deadline and completes the same receipt, no new submit |
| Save after reconnect | Save failure, disconnect/reconnect same wallet, explicit retry-save, fresh worker/service; expired URL refreshed from the original receipt, no new submit |
| Ambiguous submit | Lost response remains `submission_unknown`, one attempt; replaying the same launch does not submit again |
| API busy-lease expiry | Expired workflow continues as new while the lease is held, then ends `uncertain` after release; no extra submit |

Browser also checks explicit first choice, route switching without generation,
back/forward, reader launch 403, foreign result 404, and widths
1440/1024/768/390 without overflow. Zero page errors. All four videos play at
960×540, duration 5.055 seconds. Download SHA-256 is
`0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451`,
matching the unchanged public CC0 flower fixture. This is file integrity/playback
evidence, not generated-video quality. Screenshots contain synthetic actors only.

Browser counters: 2 quotes, 2 subscription submits, 1 API submit, 1 manual
attachment. Extended subscription Temporal runner: 6 submits total across
6 distinct jobs, 6 quotes, 7 polls; recovery adds zero submits. API Temporal:
2 submits before/after restart, 2 owned media files with matching bytes.

## Verification and reproducibility

- [Commands, source hashes, exits and artifact hashes](reacceptance/acceptance.json).
- [Browser receipt](reacceptance/browser/browser.actual.json) and
  [log](reacceptance/browser.log); screenshots:
  [Higgsfield](reacceptance/browser/higgsfield.png),
  [HeyGen](reacceptance/browser/heygen.png),
  [manual/mobile](reacceptance/browser/manual-mobile.png).
- [Subscription Temporal receipt](reacceptance/subscription-temporal.actual.json)
  and [log](reacceptance/subscription-temporal.log).
- [API Temporal receipt](reacceptance/api-temporal.actual.json) and
  [log](reacceptance/api-temporal.log).
- [Local reproduction runbook](../../../docs/operations/video-subscription-local-acceptance.md).

All three runners exited 0, using Node 22.23.2/pnpm 10.6.1, installed headless
Chrome, newly created loopback PostgreSQL and a dedicated Temporal dev server.
Current Prisma schema, including the nullable recovery deadline, was applied
only to that empty disposable database. The Temporal runners used the dedicated
queue sequentially. They restart SDK workers/domain instances while PostgreSQL
and Temporal history survive; this does not claim production/server-restart proof.

Browser uses actual Next/Nest/controllers/policies/Prisma/storage and local HTTP
OAuth/MCP, with synthetic sessions/text/providers. Its fixture drives domain
steps by timer; separate actual Temporal workflow/activity runs prove durable
transport and worker recovery. No live LLM or additional chat journey was run.
The unchanged application sources retain the prior review's 102 Jest/27 contract
tests and backend/orchestrator typechecks; those were not rerun. Full repository
build/suite and frontend typecheck were not part of this follow-up.

## Cleanup and remaining gates

[Cleanup receipt](reacceptance/cleanup.json) records exact task-owned container
IDs, browser PIDs and closed ports. Fixtures left zero organizations, users,
video jobs, manual attachments and media in the disposable database. Their
uploads were removed, both containers removed, browser/Next/fixture stopped.
Foreign workloads and this owned worktree were preserved. No global cleanup.

`.8`–`.12` remain locally complete; `.7` and the epic remain open. Real account
identity, exact live schemas/options, eligibility/quotes, charges, provider output,
language/facts/negations and quality still require separate evidence and authority.
Production subscription profiles remain disabled. No real registration/login,
credentials, paid call/credit consumption, push, merge or deploy occurred.
Beads comments record this follow-up; asynchronous Linear publication is not
claimed as verified.

docs-reviewed: updated — runbook, handoff and index link the new transport proof.
graph-reviewed: no-change-needed — acceptance script/evidence/docs only; no
application structure changed since the reviewed baseline.
