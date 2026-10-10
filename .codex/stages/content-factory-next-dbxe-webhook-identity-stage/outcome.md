# dbxe.17 — publication webhook identity accepted locally, 10 October 2026

Only `content-factory-next-dbxe.17`; baseline `76ddaa82a57efd611e2a674e0c39e6034d4ef209`.
Original criterion is verbatim in [plan.md](plan.md); all 30 epic criteria
remain intact. Epic stays OPEN; dbxe.8 retains its original next full release
gate. No next stage, push or deployment starts automatically.

V108 passes `{localPostId, organizationId, integrationId}` to a new webhook
activity. Actual service/repository lookup scopes the Post and integration's
organization, excludes deleted/child rows and checks the channel. The HTTP body
keeps the existing array/public fields: `id` is local, `providerPostId` is the
separate stored provider ID, URL/state come from the same scoped row. A version-2
header identifies the additive consumer contract. No tokens, organization or
publication-journal fields escape the projection.

No eligible hook skips lookup/network. Org-owned all-channel/selected-channel
filtering, SSRF-safe dispatcher, explicit opt-out and manual redirects remain.
Each request has a 30-second signal. Only 2xx acknowledges transport; failures
are visible through fixed logs and a non-retryable failed activity with counts.
The proxy has one attempt. V108 catches this auxiliary failure and continues
automation/repeat deadlines without republishing the confirmed Post. Receiver
response bodies and raw error material are not retained. No exactly-once,
outbox, automatic resend, UI or manual-endpoint rewrite was introduced.

New ordinary starts, recovery and repeat children select V108. Recovery retains
USE_EXISTING/fixed IDs/tenant attributes. **31 historical workflow/activity
sources** retain baseline bytes; four new signatures are additive. Existing
V106 publication claims and V107 deadline/automation behavior are reused.

Root acceptance PASS: **7 Jest suites / 165 tests / zero skips**, including
32 new actual-code fake-HTTP cases, existing SSRF/tenant/publication/fire/deadline
rails, backend/orchestrator TypeScript, docs and diff checks. The original
diagnostic failed specifically on the legacy empty HTTP body. First selected
acceptance caught an old current-starter assertion and a pre-existing stale
credential-deduplication tenant exception. The baseline query already scopes
organization/provider; only its obsolete exception was removed. The legacy
webhook exception and implementation remain unchanged. Pre-fix logs are retained.

Actual SDK1.15.0 bundles the current exports, including V108. Offline replay
passes for all seven saved synthetic V101–V107 histories from .16; their hashes
and originating .16 receipt/bundle are checked and recorded. No new server,
container, database or receiver was started. **V108 was bundled and tested with
controlled workflow dependencies; it was not executed on a native Temporal
server in this stage.** No production-history or real-customer-delivery claim.
Root receipt: [root-acceptance.actual.json](root-acceptance.actual.json).

One accepted read-only caller mapper has no writes/resources/cleanup tails.
Root inspected the exact diff and accepted the selected evidence using
closeout-lite; no additional reviewer. Unrelated tracked/untracked work remains.
docs-reviewed: updated — [v2 event, failure visibility and migration](../../../docs/operations/publication-webhooks-v108.md),
deadline/publication guides and navigation.
graph-reviewed: used — focused `.sendWebhooks` query against stale46ec4108;
legacy orientation matches current bytes, new selectors verified directly;
no refresh/external extraction/hooks.

Future owner-selected release must verify actual recipients accept v2,
inspect/retire checked unversioned/V106/V107 recovery loops before enabling V108,
and retain V108 worker exports during rollback while its histories remain.
Additive journal schema/full dbxe.8 release proof remain required. Old histories
preserve their old webhook behavior, including the known empty-array defect;
confirmed posts must not be republished to correct those events. No full release
suite/build, paid/model/provider call, schema or live service mutation occurred.
All original SaaS/client/legal/research/security requirements and defers remain.

Next candidate: **dbxe.18**, confirm Nostr against the acknowledged signed event
ID. It remains OPEN; stop for the owner's next-stage choice.

Root review reproduced cancellation being swallowed by the new auxiliary catch.
V108 now propagates the actual SDK cancellation (direct/wrapped); both regression
cases are added. Final selected checks and bundle/replay are rerun for this source change.
