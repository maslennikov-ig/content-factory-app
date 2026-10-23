# Independent video review and corrections — 23 October 2026

Reviewed implementation `e18afdc3b..e8060aabd` on `codex/video-v1-api`, in the
owned `content-factory-next-worktrees/video-v1-api` checkout. User authorized
local review/fixes/checks only. Root accepted and fixed five findings: one P1,
four P2. No accepted finding remains unresolved in this review's scope.
The initial [implementation acceptance](implementation.md) remains historical;
this record supersedes its security/recovery claims for the cases below.

## Findings and fixes

1. **P1: impersonation lost the original authenticated principal.**
   `apps/backend/src/services/auth/auth.middleware.ts:92` returned from the
   impersonation branch without installing the original-session context.
   Consequently the personal-wallet guard permitted the represented user's
   writes. The branch now sets that context while retaining the acting user
   for ordinary audit attribution. An actual middleware regression invokes
   connection start, limits, token access and launch; all reject with 403 and
   no subscription job or remote generation is created. JWT signature checking
   itself is supplied as a synthetic dependency in this regression.
2. **P2: browser OAuth callback used the internal backend address.**
   `videos/subscriptions/video-connection.service.ts` now uses the public
   `NEXT_PUBLIC_BACKEND_URL`, preserving its path and normalizing the trailing
   slash. Invalid/missing public configuration fails closed. A split
   internal/public configuration verifies the exact persisted and registered
   callback without contacting the synthetic public hostname.
3. **P2: cached credentials allowed later MCP requests after revocation.**
   `video-mcp-client.ts`, both subscription adapters and facade/execution
   consumers now carry a credential check to every HTTP send. It rechecks
   member/grant, account generation and token version. Real loopback HTTP
   regressions revoke access after discovery or during initialization and prove
   that no later RPC, quote or submit is transmitted. A request already sent
   at the revocation boundary can still complete; no remote cancellation is
   claimed. No additional automatic retry is introduced.
4. **P2: resume remained trapped behind the original deadline/poll budget.**
   `video-subscription-job.service.ts` now persists a fresh bounded recovery
   deadline and resets only the read-only poll budget on explicit resume.
   `expire()` rereads under the lease and cannot apply an old workflow's expiry
   to a newer recovery window. Tests cover age and poll exhaustion, restart,
   stale expiry and the renewed deadline. Original created time, receipt and
   submit count are unchanged. Existing Temporal workflow/activity source and
   payload contracts are unchanged.
5. **P2: retry-save could not refresh an expired URL after reconnect.**
   The explicit action may adopt a newer generation only after validating the
   same owner/wallet. Tests prove successful import of the original receipt
   after reconnect, refusal of another wallet, and saving an accessible captured
   file while disconnected with no credential request. No new submit occurs.

The additive generated migration
`20261023110000_video_subscription_recovery_deadline` adds nullable
`VideoSubscriptionJob.statusDeadlineAt`. Existing rows use their original
createdAt + 24h until explicit recovery. Migration guard accepted the exact
Prisma diff: one statement, only `VideoSubscriptionJob`. Applied only to this
review's disposable local database; future rollout must apply it before code.

## Verification

[Source hashes, exact commands and exits](review/acceptance.json).
[Failing proofs](review/red-complete.log): 7 failures / 19 passes before fixes;
all failures correspond to the five findings, including two deadline variants
and two revocation points. Additional boundary cases were added after that run.

- [Affected Jest](review/affected-jest.log): **10 suites, 102 tests pass**, zero
  skips. Actual disposable PostgreSQL, native MCP/OAuth over loopback HTTP,
  owned storage, subscription/UI-chat facade and retained API/manual paths.
- [Provider contracts](review/affected-contracts.log): **27 pass**, zero skips;
  retained API plus both subscription adapters.
- Backend and orchestrator TypeScript noEmit: exit 0.
- Prisma generation, actual generated migration guard/application and final
  diff check pass. Documentation links checked after these edits.

No browser journey, Temporal transport restart, frontend typecheck, full build
or full repository suite was rerun. The existing browser/Temporal receipts
remain historical evidence for unchanged UI and workflow transport; the changed
recovery behavior is verified here through the actual persisted domain service.
No fixture result proves provider compatibility, price, billing or video quality.

The later owner-requested [browser/Temporal reacceptance](reacceptance.md)
passed on these fixed application sources, including the reviewed recovery
cases. It supersedes the transport-evidence gap above, not the real-provider gates.

## Review ownership and cleanup

- `review_video_security`: independent read-only OAuth, credential lifecycle,
  impersonation, SSRF and deletion review. Three findings accepted/reproduced.
- `review_video_execution`: independent read-only credit, leases, workflow and
  provider-adapter review. Two findings accepted/reproduced; stale-workflow
  expiry concern incorporated into the recovery fix.
- Root: facade, API/manual/UI/chat consumer review, all mutations and acceptance.
  Reviewers wrote no files, created no resources, and have completed their work.

Task-owned PostgreSQL container
`be2c9122ea057da6ae8505926ee53572e03f59e159b89251a989678e0bb67e43`
used loopback 46325 and tmpfs; removed and absence verified. An initial container
failed to bind an already occupied port, was removed, and the replacement used
an automatically allocated port. Existing services were untouched.
[Cleanup receipt](review/cleanup.json). Fixtures removed their own rows/uploads.
No Next/browser/Temporal server was started in this review.

graph-reviewed: intentionally borrowed main checkout's read-only `dd67538d`
graph; `VideoJobService` was absent, so known current files and consumers were
inspected directly. No graph rebuild or external semantic calls.

Beads `.8`–`.12` retain local-complete state with review progress comments;
`.7` and the epic remain open for real evidence. Canonical Linear publication
is asynchronous and was not verified. No real accounts/credentials, paid calls,
credit consumption, push, merge, deployment or production mutation occurred.
