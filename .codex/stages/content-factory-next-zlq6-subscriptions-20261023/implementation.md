# Content Factory subscription access: local acceptance

**Verdict: local engineering A1–A10 PASS. Real-provider A11 UNKNOWN.**
Implementation `2fb9812b070a4d2c351f7c61879f936aa4760000`, base
`e18afdc3b2a39d90349c05dd2d947c5e615a307f`, branch `codex/video-v1-api`, owned
checkout `/home/me/code/content-factory-next-worktrees/video-v1-api`.
The evidence/docs follow-up changes no application code.
[Source hashes, commands and exit codes](root-acceptance.json),
[operator runbook](../../../docs/operations/video-subscription-local-acceptance.md).

## Behavior and acceptance

Explicit subscription / existing API / manual choice shares saved editable
source-backed drafts and owned results across UI/native chat. Access changes
preserve edits, invalidate approval and never submit or fall back. Personal
credits and obligations are separate from API USD. Native MCP adapters use
reviewed allowlists and explicitly synthetic pinned schemas; production profiles
remain disabled without real schema/identity/eligibility/quote evidence.

| Spec | Accepted local evidence |
| --- | --- |
| A1 | Actual Prisma, two users/two workspaces: foreign attempts/approval/grants, member removal, impersonation and user deletion. HTTP reader launch 403, foreign result 404. |
| A2 | Native SDK/HTTP PKCE and one-use session-bound state, issuer/resource/redirect/private-host rejection, encrypted DCR reuse, concurrent rotating refresh and disconnect fencing. |
| A3 | Serializable same-wallet admission across grants, exact Decimals, old unresolved obligations, UTC rollover/reconnect and owner reconciliation provenance. |
| A4 | Browser edits survive API → manual → subscription with unchanged counters, new immutable approval and no silent payer/engine switch. |
| A5 | Higgsfield pinned synthetic tools, quote-only counters, explicit Wan/Kling option rejection, one receipt, bounded status and owned MP4 import. No live Unlimited/Standard/Pro claim. |
| A6 | HeyGen exact script/numbers/negations/locale, explicit renderer and eligible trial assets; no Video Agent, implicit Avatar IV or API fallback. |
| A7 | Prisma concurrency and native chat replay; actual dedicated Temporal worker/service restart. Two resumed receipts complete with one attempt each; lost response stays unknown with one attempt. Retry-save imports that same result. |
| A8 | Actual Next/Nest/Prisma/storage: local OAuth by clicking UI, both providers, edit/save/review/status/reopen/play/download and job-only links. Native Mastra tool uses authored ingress, requires approval and emits the facade job. |
| A9 | Real existing uploader and unchanged CC0 MP4, copy/export, intercepted fixed website link, idempotent owned attachment/reopen/download. Foreign/PNG/oversize/stale/reader writes fail; quote/generation counters unchanged. |
| A10 | Affected existing API credentials/settings/domain/chat/module/reference/media/UI and native-part guards pass. Browser API play/download passes. Old workflows/activities, inbound MCP, API plan revision 3, license/readme/security and video fixture unchanged. |

New UI vocabulary covers all 16 existing interface locales. Job-only links load
the saved draft and retain its access. Manual external expense and subscription
credits have distinct truthful labels. A one-second approval clock formerly
starved the four-second SWR polling timer; the reproduced defect is fixed with
numeric intervals, actual SWR timer regression and browser status transition.

## Root verification

Node 22.23.2, pnpm 10.6.1. Exact commands/log hashes are in the JSON receipt.
Initial `jest.log` is historical: 25 selected suites, 23 passed / 2 failed.
Manual tests originally confused valid MP4 bytes labelled image with invalid
content; they now reject actual PNG and test real-upload promotion. Old UI mocks
were updated to the additive facade contract. Both failures were corrected and
affected suites rerun; the initial log is **not** the accepted aggregate verdict.

Accepted reruns: `domain-final.log` 6 suites / 89 tests;
`ui-design-final.log` 5 / 86; `ui-final.log` 3 / 31 including oversize rejection;
`subscriptions-final.log` 6 / 44; `chat-native.log` 2 / 40;
`execution-affected.log` 2 / 14. These overlap: **do not add their counts**.
Together with unchanged passing initial suites, 26 unique selected Jest files
have accepted evidence. Node old/new provider contracts: 27 PASS, zero skips.
All three app typechecks exit 0. Additive SQL guard: 22 statements, nine new
tables only; schema applied only to disposable PostgreSQL. Docs (226 files)
and final diff checks pass. Full build/repository suite/release gate not run.

## Actual runtime receipts

[Browser JSON](browser/browser.actual.json), [final labels/screenshots](browser/copy.actual.json),
[Temporal JSON](temporal.actual.json), [browser log](browser.log), [worker log](temporal.log).

Browser: two subscription submits/two quotes, one API submit, one manual result,
no page errors. Four MP4s play at 960×540 and downloaded SHA-256 equals
`0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451`.
This is the unchanged public CC0 fixture, **not provider-generated output**.
1440/1024/768/390 widths have no horizontal overflow. Public egress is blocked;
one provider website navigation is intercepted before transmission. Persistence
is checked through HTTP receipts, not transient save notices. Reopening waits
for the URL-driven workspace remount before playback.

Temporal: actual dedicated SDK worker/service restart, two captured provider IDs
and owned Media IDs, submitAttempts=1 each. A third lost-response case persists
submission_unknown without replay. Payloads carry opaque local IDs, no scripts
or tokens. Browser domain stepping and actual Temporal transport are separate
receipts; neither substitutes for the other. Native LLM selection was not tested.

## Delegated delivery

- `video_access_ui`: bounded frontend/copy/inventory delivery inspected and accepted by root through actual browser, SWR regression, UI/design checks and types. No worker commit or independent acceptance gate.
- `subscription_fixtures`: bounded HTTP OAuth/MCP/provenance and Prisma delivery inspected and accepted by root. Helpers close only their own rows, uploads and servers; no independent commit.
- Root owns backend/schema/permissions/chat, integration, all acceptance, commits and cleanup. Both child streams are complete; no active work or child resources remain.

## Task-owned cleanup

- PostgreSQL `55f5c35a2ad5cb736f706bb50692385d2c2b428528e15d24c88f4ede57ea8bdc`, `cf-video-subscriptions-20261023`, loopback 55489: removed with its exact task-owned anonymous volume.
- Temporal `2efa9036724217349b230844df0ebc02cc9a41fc44e23b8d2751732acdad564c`, `cf-video-subscriptions-temporal-20261023`, loopback 7329: removed; no shared queue consumed.
- Own Nest/Next processes stopped, ports 43321/43320 closed, temporary uploads removed. Only Next's two newly generated untracked agent files were removed. Foreign workloads untouched, implementation worktree preserved. [Cleanup receipt](cleanup.actual.json).

graph-reviewed: main checkout's read-only dd67538d map oriented VideoManager;
current files inspected; new symbols not indexed, no graph refresh.

## Tracking and real-provider gates

`.8`–`.12` closed for local engineering in dependency order; [Beads receipt](beads.actual.json).
`.1`–`.6`, `.7` identity and API plan revision 3 preserved; epic/.7 remain open.
Canonical Linear publication through the server bridge is asynchronous and
unverified here. No native `bd linear sync` or direct publication performed.

A11 UNKNOWN: real DCR/OAuth, authenticated stable wallet identity, exact MCP
schemas/models/options, quote-only non-generation and applicable credit unit,
provider-reachable references, HeyGen trial/avatar/voice/locale/regular-use fit,
actual charges and attributable cost, playable provider output, selected
language/facts/negations, competent quality assessment and prompt benefit.
Read-only account/schema work and each bounded credit sample need their own
current authority. Production profiles stay disabled. No real registration/login,
secret access/wiring, paid/text/video/credit calls, push, merge, live migration
or deploy occurred. Fixture success cannot close the epic or establish billing.
