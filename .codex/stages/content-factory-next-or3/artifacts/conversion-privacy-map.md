---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:conversion-privacy-map
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: content-factory-next-or3.8 implementation and root acceptance
public_facade: public SaaS conversion funnel and super-admin reporting
bounded_acceptance: one privacy-preserving aggregate report plus focused mutation browser and database evidence
non_goals:
  - widening the public event allowlist or its coarse dimensions
  - recording visitor IDs IP addresses referrers user agents emails or arbitrary properties
  - exposing a public read endpoint or raw trusted receipts
  - changing registration activation OAuth publishing or deployment behavior
  - production database mutation credentials paid calls push PR or deploy
evidence:
  - local_code_map
task_id: content-factory-next-or3.conversion-privacy-map
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: public conversion funnel with privacy-safe aggregates
milestone_status: mapped
agent_type: explorer
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: local code and test-contract mapping only
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md
success_criteria:
  - exactly six named funnel events remain the only recorded conversion vocabulary
  - public collection remains write-only coarse and rate-limited
  - registration and workspace activation remain server-trusted and deduplicated
  - reporting reads daily aggregates only and calculates fixed ratios without raw identifiers
  - focused tests prove public mutation browser lifecycle and database persistence boundaries
selected_docs:
  - AGENTS.md
  - .codex/next-goal.md
  - docs/product/cloud-saas-growth-spec.md
  - docs/architecture/data-model.md
  - docs/operations/saas-readiness.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: content-factory-next-or3-mapping
depends_on_streams:
  - content-factory-next-saas.2
  - content-factory-next-saas.5
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted read-only map; no runtime, external resource, child branch, or worktree required cleanup
risk_level: high
risk_tags:
  - privacy
  - public-api
  - auth
  - data
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - privacy
  - compatibility
  - idempotency
  - test-matrix
verification:
  - focused Graphify query completed before repository inspection
  - repository map completed against current source and focused tests; no product code was changed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md passed
changed_files:
  - .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md
explicit_defers:
  - production abuse-budget and operations acceptance remains owned by content-factory-next-saas.5
  - pricing trial card and billing-entitlement decisions remain outside content-factory-next-or3.8
---

# Summary

`content-factory-next-or3.8` is largely implemented locally. The closed conversion vocabulary is already split correctly:

| Funnel event | Current source of truth | Persisted form |
| --- | --- | --- |
| `landing_view`, `demo_started`, `demo_completed`, `signup_started` | browser helper plus public POST | coarse `PublicGrowthDaily` row |
| `registration_completed` | committed local/provider registration service | HMAC receipt plus daily row |
| `workspace_activated` | successful channel-added path | HMAC receipt plus daily row |

The missing acceptance criterion is reporting the funnel. The existing `/admin/product-events` endpoint and Product Events screen report the separate authenticated `ProductEvent` journal; they do not query `PublicGrowthDaily` and cannot report these six aggregate events. There is no public read endpoint, which is correct and must remain so.

The narrow implementation boundary is therefore:

1. Add one super-admin-only aggregate-report read path under the existing authenticated `/admin` controller and a small repository/service seam over `PublicGrowthDaily`. It returns only a bounded date-range total for the six fixed names and fixed, zero-safe funnel ratios: demo started per landing view, demo completed per demo started, signup started per landing view, registration completed per signup started, and workspace activated per registration completed.
2. If a UI is required for the criterion, extend the existing admin reporting surface with those six totals and ratios. It must use the established design system and fetch only the protected relative endpoint; do not add a public client read route or expose dimensions/receipts.
3. Do not alter `POST /public-growth-events`, `PublicGrowthEvent` parsing, the four public names, the two trusted names, or the bounded dimensions. Reporting must group/sum existing `PublicGrowthDaily` rows through Prisma and must never read or join `PublicGrowthTrustedEvent`.

This boundary adds no personal-data field, no persistent visitor key, no arbitrary payload, and no new public capability.

# Current Evidence

## Public collection and minimization — present

- `PUBLIC_GROWTH_EVENT_NAMES` permits only the four browser names; `TRUSTED_GROWTH_EVENT_NAMES` permits only `registration_completed` and `workspace_activated`.
- `parsePublicGrowthEvent` refuses unknown keys and unbounded values, including email, `properties`, visitor ID, IP, referrer, and user agent.
- The sole public receiver is `POST /public-growth-events/`, returns `202`, invokes only `recordPublic`, and has a distinct 120-per-minute `ThrottlerGuard` bucket. Its tracker is an HMAC over a minute bucket and normalized ingress address; raw address and user agent are neither returned nor logged.
- Browser telemetry posts first-party JSON with `credentials: 'omit'`, uses a fixed UI version and coarse width bucket, and catches delivery failure. Current sources wire all four public lifecycle events.

## Trusted server events — present

- Registration calls `recordTrusted('registration_completed', 'registration_completed:<organization>')` only after organization creation; failure is best-effort and cannot roll back the account.
- Channel activation calls `recordTrusted('workspace_activated', 'workspace_activated:<organization>')` only after `channel_added` persists. A stable HMAC of that internal key is the receipt key.
- `PublicGrowthTrustedEvent` stores only name, HMAC and timestamp, has a unique constraint, and is transactionally paired with the daily aggregate. The cleanup operation removes receipts after 90 days while retaining anonymous daily aggregates.

## Persistence — present

- `PublicGrowthDaily` has UTC day, fixed event name, four bounded dimension columns, count, and a composite unique key. Public writes use upsert with bounded conflict retries.
- Trusted writes create the receipt and increment the same daily aggregate in one transaction. Tests cover duplicate recognition, P2002/P2034 retry limits, rollback, HMAC-key refusal, and schema constraint alignment.

## Reporting — absent

- No repository/service/controller queries `PublicGrowthDaily` for a report.
- `/admin/product-events` is super-admin protected, but its `ProductEventsService.getAdminReport` queries a different table with user and organization identifiers. Reusing it for conversion data would break both semantic and privacy boundaries.

# Existing Focused Tests

- `tests/public-growth-event.test.cjs` checks the closed names and payload parser, coarse upserts, trusted HMAC receipts, retry/rollback behavior, transient tracker privacy, 120/minute guard behavior, and controller rejection of trusted names.
- `tests/public-saas-telemetry.test.cjs` checks the helper payload and source wiring for four public events.
- `tests/public-saas-demo.test.cjs` is a jsdom interaction test proving one `demo_started` and one `demo_completed` across navigation paths.
- `tests/registration.growth-event.test.cjs` covers local/provider registration, returning providers, and a caught metrics outage using service doubles.
- `tests/workspace-activation.growth-event.test.cjs` covers post-write ordering, retry/deduplication intent, and retained retry state using controller/service doubles.
- `tests/saas-retention.test.cjs` covers the receipt-only 90-day retention command and explicitly excludes `PublicGrowthDaily` from raw deletion.

# Missing Proof and TDD Boundary

Start each item RED, then add the smallest production code needed for GREEN. All database proof uses an explicitly local disposable test database; it must never target a deployed database.

1. **Aggregate report contract and access mutation.** Add a focused backend test for a non-super-admin rejection and super-admin success. Seed daily rows for all six names, multiple days, and irrelevant dimensions; assert a fixed response with six totals and only the five zero-safe ratios. Assert no receipt, organization ID, user ID, dedupe key, IP, referrer, UA, or arbitrary dimension value appears. Add the protected admin report service/repository only after this RED test.
2. **Public receiver mutation proof.** Exercise the real Nest route/guard boundary, not a direct controller method: valid payload returns `202`; an extra key and either trusted name return `400`; the 121st same-bucket request returns standard `429`; the warning contains only the route. Inspect the persisted daily row to prove request metadata is absent.
3. **Trusted-path persistence proof.** With real Prisma transaction semantics, prove one committed registration and one post-channel-add activation each make one daily increment and one HMAC-only receipt; repeat the same organization-derived trigger and prove count remains one. Prove an aggregate failure leaves no receipt. Do not log or assert raw derived IDs.
4. **Browser lifecycle proof.** Render the real public home, synthetic demo, and email-first signup boundaries with a fetch spy. Assert exactly four possible browser event names, the landing event fires once under effect replay, demo start/completion fire once each despite backtracking, and a non-empty email advances signup while the network body contains no email. This closes the current gap where home/signup are source-text checks rather than rendered interactions.
5. **Admin report browser proof, only if the report is surfaced in UI.** Render the new/extended super-admin report state with a mocked protected response; assert six labelled totals, fixed ratio labels, zero-denominator display, loading/error/empty states, and no raw-identifier column. Keep this separate from the product-events UI tests.

The targeted acceptance set after implementation is the new report test, `tests/public-growth-event.test.cjs`, `tests/public-saas-telemetry.test.cjs`, `tests/public-saas-demo.test.cjs`, `tests/registration.growth-event.test.cjs`, `tests/workspace-activation.growth-event.test.cjs`, `tests/saas-retention.test.cjs`, plus the new local-database and browser tests. Root should run one minimal integrated acceptance after the changed streams land.

# Verification

The artifact passed `python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md`. This was a read-only mapping stream: no product source, database, browser session, credentials, or external system was changed.

# Risks / Follow-ups

- The rate limiter is privacy-safe in repository code, but production effectiveness depends on the trusted-ingress and abuse-budget readiness work in `content-factory-next-saas.5`. This task must not claim that operational acceptance without its evidence.
- The HMAC key is deliberately stable for the receipt-retention window. Key rotation remains an operational migration concern, not a reason to store source identifiers or weaken deduplication.
- Dimensions are legitimate coarse aggregates but are not required to calculate the five funnel ratios. The first report should total fixed names only, avoiding unnecessary high-cardinality breakdowns.
- No owner decision is required for the proposed scope: it fulfils the stated “report counts core ratios” criterion while preserving the current public write-only surface.
