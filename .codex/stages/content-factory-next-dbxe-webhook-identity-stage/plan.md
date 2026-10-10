# dbxe.17 — local publication identity in webhooks

Owner-selected bounded local stage, 10 October 2026. Baseline `76ddaa82a57efd611e2a674e0c39e6034d4ef209`.
Beads owns statuses. Only .17 is selected; epic and .8 release gate remain open.

## Original criterion (verbatim)

Different local/provider IDs yield intended tenant post URL/state in event; failed delivery is visible. Keep identifiers explicit, version workflow/activity/consumer meaning safely, retain already-running histories. Fake HTTP proof does not claim actual customer delivery.

## Specification

- Add postWorkflowV108 from accepted V107, plus new PostActivityV108 and missingPostWorkflowV108. Preserve all 31 historical workflow/activity files byte-for-byte and keep all exports/registration. Only new normal/recovery/repeat starts select V108; old USE_EXISTING histories and child targets retain their versions.
- The new webhook activity takes an object with localPostId, organizationId and integrationId. It never uses a provider receipt ID as Post.id. Add an explicitly tenant/channel-scoped Prisma lookup through PostsService/PostsRepository, including the integration's organization ownership. Keep old lookup and its legacy guard exception untouched.
- Wire schema v2 preserves the existing array and fields: id is local Post.id, releaseURL/state come from that same scoped row, and providerPostId is a separate additive field from stored releaseId. Use X-Content-Factory-Webhook-Version: 2; no envelope rewrite or secrets/journal/internal organization fields. No in-repo parser exists; external consumer acceptance is unknown and belongs to an explicitly selected release.
- Preserve org-owned active hook selection, all-integrations semantics and exact integration filtering. If there are no eligible hooks, return zero counts without reading the post. A missing/deleted/foreign/child/wrong-channel post never sends an empty or foreign payload and is visibly refused.
- Reuse the SSRF-safe dispatcher, manual redirects and the existing explicit opt-out. Use a bounded 30-second request signal and discard response bodies without reading/logging them. Only 2xx responses acknowledge transport delivery; HTTP/transport failures emit fixed diagnostic reason/status, never URL/token/content/error text.
- Return delivery counts on success; a failed batch throws a fixed non-retryable webhook failure with count-only details after all selected hooks finish. New webhook proxy has maximumAttempts:1, preserving successful sibling deliveries and avoiding automatic resend on ambiguous transport errors. V108 catches this auxiliary failure and continues automations; confirmed publication is never resent. No exactly-once promise, outbox, new UI/journal or automatic recovery.
- New recovery loop needs future deliberate retirement of old unversioned/V106/V107 loops. Rollback stops new starters but keeps V108 exports while histories remain; original journal-schema and full .8 release gates still apply. No live change or new release gate framework in this stage.

## Ownership and accepted child map

Root owns implementation, proof, documentation, acceptance and local delivery.
Accepted read-only automation_contract_map (existing Luna/max) mapped the array fields, all seven callers, org-owned hook filtering, silent failures and SSRF rails. No in-repo subscriber was found; external consumers remain unknown. Context-isolation benefit while root designed producer/query semantics. Child has no writes/resources/cleanup tails. Its suggestion to revise the old tenant exception is narrowed: preserve it for the unchanged legacy lookup; the new lookup must pass the scope guard normally. No additional reviewer.

## Cohesive implementation and acceptance

1. Save all 30 original criteria, legacy hashes and signatures; reproduce actual legacy empty payload with distinct local/provider IDs.
2. Implement the complete V108 path, scoped query and v2 consumer-facing contract; migrate future selectors and add signatures only.
3. One root risk-selected acceptance: new actual workflow/activity/repository fake-HTTP cases (payload, two tenants/channels, filtering, 2xx/non-2xx/transport, safe diagnostics, no republish); existing SSRF/tenant/fire/publication/deadline/signature rails; backend/orchestrator types; exact SDK bundle and offline replay of the seven preserved synthetic histories from .16.
4. Docs/diff and criterion-preservation review; close only .17, scoped local commit and continuation. No full suite/build/deploy, real webhook/provider/model call, customer data, schema or shared-host cleanup. Fake HTTP proves our boundary, not customer processing. Native replay is synthetic historical compatibility, not production-history acceptance.

## Technical premortem

Verdict: GO. Blast radius: future starters -> V108 webhook activity -> scoped Prisma row -> existing configured endpoint contract. Local revert is safe; future deployed rollback must retain V108 for existing histories and avoid handing pending publications to old writers.

| Symptom | Evidence / mechanism | Detection / mitigation | Disposition / owner |
| --- | --- | --- | --- |
| Empty/wrong post body | Confirmed: all old callers pass provider ID to local-ID lookup | Actual counterexample; explicit localPostId and exact body/tenant cases | preflight / root |
| Wrong tenant/channel leaks to webhook | Confirmed old lookup unscoped; new selectors could be mismatched | Scoped post and integration ownership; negative two-tenant/channel inputs | preflight / root |
| Existing history changes commands/argument meaning | Confirmed Temporal contract boundary | V108 only; 31 frozen source hashes, additive signatures, old synthetic SDK replay | preflight / root |
| Successful siblings or publication resent after failed hook | Plausible with activity retry/workflow failure | One webhook attempt, fixed non-retryable count-only error, auxiliary catch; workflow proof | preflight / root |
| Failed HTTP/redirect silently succeeds or credentials leak in logs | Confirmed status ignored/empty catch in legacy | Check 2xx; bounded signal, manual redirects/pinning, fixed diagnostics; sensitive-canary test | preflight / root |
| Consumer rejects new field or old/new recovery loops compete | Confirmed consumer unknown/old loop persists | v2 marker and compatible array; explicit future consumer/loop inspection, no live mutation | preflight at release / owner |
| Executor broadens scope/changes legacy/overstates fixture | Plausible executor error | Root-owned exact diff and evidence boundary; accepted read-only child | preflight / root |

graph-reviewed: used — focused .sendWebhooks query against stale46ec4108; relevant legacy hashes match the graph, current V107/callers verified separately. No graph refresh/external extraction/hooks.

## Acceptance findings

The legacy counterexample failed on the actual empty body, as intended. New32
webhook cases pass. First selected run caught a current-starter expectation
still naming V107 and a pre-existing stale tenant exception for credential
deduplication. The actual baseline query already scopes organization/provider
since the access stage. Removed only that obsolete exception; unchanged legacy
webhook exception remains. No integration implementation changed. The final
seven-suite acceptance is green; backend/orchestrator types and offline SDK
replay are green and unchanged by these test/docs corrections.

Root review reproduced cancellation being swallowed by the new auxiliary catch.
V108 now propagates the actual SDK cancellation (direct/wrapped); both regression
cases are added. Final selected checks and bundle/replay are rerun for this source change.
