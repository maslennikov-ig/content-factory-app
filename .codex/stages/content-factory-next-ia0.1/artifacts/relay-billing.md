---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0.1/stage-manifest.json
stream_owner: relay_billing
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner
public_facade: browser error relay POST and Stripe webhook
bounded_acceptance: focused relay and cancellation-webhook tests
non_goals:
  - landing-page design and conversion work
  - live Stripe or collector calls
  - release acceptance and Beads closeout
evidence:
  - none
task_id: content-factory-next-ia0.1.relay-billing
epic_id: content-factory-next-ia0.1
stage_id: content-factory-next-ia0.1
session_id: content-factory-next-ia0.1
milestone: relay and billing audit repair
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: bounded implementation stream inherited the root model and reasoning policy
repo: content-factory-next
branch: codex/remaining-epic-acceptance
base_branch: unknown
base_commit: 80300ed6899490dca5e0f6ec82492bbc9776828e
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/frontend/src/instrumentation-client.ts
  - apps/frontend/src/app/api/browser-errors/route.ts
  - libraries/helpers/src/errors/browser.error.relay.ts
  - libraries/nestjs-libraries/src/services/stripe.service.ts
  - apps/backend/src/api/routes/stripe.controller.ts
  - tests/browser-error-relay.test.cjs
  - focused Stripe tests
  - .codex/stages/content-factory-next-ia0.1/artifacts/relay-billing.md
success_criteria:
  - the actual browser client module builds a same-origin POST contract whose derived Origin passes the relay guard
  - no organization and no event actor are terminal after a committed billing mutation
  - organization, actor and product-event storage failures still propagate for Stripe retry
  - the fixed privacy-bounded payload and strict origin guard remain unchanged
selected_docs:
  - goal-objective.md
  - graphify-out/GRAPH_REPORT.md and focused Graphify queries
  - https://fetch.spec.whatwg.org/ sections 3.2 and append a request Origin header
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: ia0.1-implementation-streams
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
orchestrator_acceptance_notes: root inspected the bounded diff, RED/GREEN record, portable actual-client-options proof, privacy boundary, retry matrix, and durable limiter defer; accepted before the single release acceptance
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch, commit, temporary repository artifact, browser process, or runtime tail remained
risk_level: high
risk_tags:
  - privacy
  - retry
  - idempotency
  - state-transition
  - data
  - api
affected_surfaces:
  - api
  - backend
  - user-flow
invariants:
  - idempotency
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: durable product and operator contracts do not change; focused tests and this stage artifact record the repaired failure semantics
verification:
  - TMPDIR=/tmp pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (before fix): failed as expected
  - TMPDIR=/tmp pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (after fix): passed
  - TMPDIR=/tmp pnpm exec jest tests/subscription-cancel-event.test.cjs --runInBand (before fix): failed as expected
  - TMPDIR=/tmp pnpm exec jest tests/subscription-cancel-event.test.cjs --runInBand (after fix): passed
  - TMPDIR=/tmp pnpm exec jest tests/browser-error-relay.test.cjs tests/subscription-cancel-event.test.cjs --runInBand: passed
  - TMPDIR=/tmp pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (portable correction): passed without Playwright or system Chrome
  - TMPDIR=/tmp pnpm exec jest tests/error-collection.privacy.test.cjs --runInBand (release correction): passed after replacing the stale assertion that required the removed no-referrer defect
changed_files:
  - apps/frontend/src/instrumentation-client.ts
  - libraries/nestjs-libraries/src/services/stripe.service.ts
  - tests/browser-error-relay.test.cjs
  - tests/subscription-cancel-event.test.cjs
  - .codex/stages/content-factory-next-ia0.1/artifacts/relay-billing.md
explicit_defers:
  - content-factory-next-ia0.1: per-client relay budget deferred because the privacy contract deliberately supplies no stable client key; adding one would widen the product/privacy contract
---

# Summary

The browser transport no longer requests `referrerPolicy: no-referrer`. The
default Jest suite captures its exact fetch options from
`instrumentation-client.ts`, constructs a Request, proves same-origin mode and
omitted credentials, derives the matching tuple origin from that Request, and
passes it through the production relay guard. Credentials remain omitted, the
fixed payload is unchanged, and no collector call is made.

Cancellation recovery after `customer.subscription.updated` or
`customer.subscription.deleted` now treats an absent organization and an
absent internal event actor as terminal `{ recorded: false }` outcomes. Both
conditions emit an identifier-free operator warning. Failures while reading
the organization, reading the actor, or writing the product event still throw,
so the webhook remains retryable when persistence is actually unavailable.

# Scope / Routing

The code path is browser Sentry transport -> same-origin `/api/browser-errors`
POST -> relay origin/content/payload guards -> bounded Sentry forward. The
billing path is `StripeController.stripe` -> committed subscription mutation ->
`StripeService.recordCancellationFromWebhook` -> organization/actor lookup ->
idempotent product-event write. Focused Graphify queries confirmed both paths.

No route, relay parser, limiter, controller, authentication, payload or
persistence schema change was needed. The webhook remains signature-validated
at the existing controller entry point; this stream did not weaken or bypass
that boundary.

The current Fetch Standard says a non-CORS non-GET/HEAD request with
`no-referrer` serializes `Origin` as `null`; it also states that `Origin` does
not expose a URL path. Local Chrome sent the tuple origin despite the old
option, showing an implementation difference. The normative request-options
assertion therefore guards the standard contract, while the same test also
passes the captured options through the production relay without requiring a
browser runtime. The local Chromium POST remains one-time investigation
evidence only; it is not a dependency of the default Jest suite.

# Verification

Relay RED failed specifically because the request built from the real client
options had `referrerPolicy === "no-referrer"`. After removing that option, the
focused relay target passed all 7 tests, including the deterministic
actual-client-options contract and the existing payload/origin/privacy/outage
checks. The portability correction removed the ambient Playwright/system-Chrome
dependency and the same focused target remained green.

Stripe RED failed only for the two terminal cases: both formerly rejected.
After the service change, the focused Stripe target passed all 13 tests. Its
failure-path matrix proves errors from organization lookup, actor lookup and
product-event insertion still reject. The combined focused run passed 2 suites
and 20 tests with `TMPDIR=/tmp`.

No live Stripe endpoint or collector was contacted. Release-wide test, build,
docs and process acceptance remain root-owned and were not run here.

# Delivery / Cleanup

Changes are present in the shared worktree for root inspection and acceptance.
No commit, merge, push, PR, deployment, Beads close or external mutation was
performed. No child worktree or temporary repository file needs cleanup.

# Risks / Follow-ups / Explicit Defers

The process-wide 300/min application bucket and Nginx global 5r/s boundary
cannot be split per client under the current privacy contract: the request
intentionally carries no IP, cookie, user agent, arbitrary header, URL/query or
stable client identifier. Adding a random identifier would create a new tracked
field and widen the fixed public payload. Keying by stack/event fingerprint
would not isolate clients and can be varied by a noisy or hostile sender.
Therefore per-client budgeting is explicitly deferred rather than weakening
privacy or origin validation. Root should keep this defer attached to the
stage/task unless product owners later choose a privacy-reviewed anonymous
budget key.

The default Jest suite has no Playwright or system-browser runtime dependency.
The earlier one-time local Chrome observation is retained as investigation
context, not as a release-suite requirement or an optional test that can
silently skip.
