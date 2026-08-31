---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ry5.4/stage-manifest.json
stream_owner: errors_sdk_worker
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root acceptance for content-factory-next-ry5.4
public_facade: backend, orchestrator, and Next.js server/edge error collection entrypoints
bounded_acceptance: pinned GlitchTip-compatible SDKs with fail-closed payload minimization and DSN-off no-op behavior
non_goals:
  - Live collector, network call, server access, production action, deploy, push, merge, commit, or Beads mutation.
  - Error-collector compose, operator runbook, environment templates, source-map upload, alerts, or retention enforcement.
  - Full suite, workspace build, or release acceptance owned by the root.
evidence:
  - focused-red-green
  - installed-package-exports-types-source
  - focused-format-and-diff
task_id: content-factory-next-ry5.4.sdk
epic_id: content-factory-next-aay
stage_id: content-factory-next-ry5.4
session_id: goal-content-factory-next-aay
milestone: private SDK and payload boundary
milestone_status: accepted
agent_type: worker
subagent_model: inherited
reasoning_effort: inherited
model_reasoning_rationale: delegated implementation of a bounded SDK and privacy stream
repo: content-factory-next
branch: work/own-error-collection
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-own-error-collection
write_zone:
  - package.json
  - pnpm-lock.yaml
  - apps/backend/src/main.ts
  - apps/orchestrator/src/main.ts
  - apps/frontend/src/instrumentation.ts
  - apps/frontend/src/sentry.server.config.ts
  - apps/frontend/src/sentry.edge.config.ts
  - libraries/nestjs-libraries/src/sentry/initialize.sentry.ts
  - libraries/helpers/src/errors
  - tests/error-collection.privacy.test.cjs
  - tests/external-services.purge.test.cjs
  - .codex/stages/content-factory-next-ry5.4/artifacts/sdk.md
success_criteria:
  - Only @sentry/nestjs and @sentry/nextjs 10.70.0 return, pinned exactly.
  - Missing DSN, missing or mismatched allowed origin, and SDK initialization failure cannot interrupt product startup.
  - Events are rebuilt from a strict positive allowlist; only fixed generic exception types and numeric frame coordinates survive, while messages, code identifiers, requests, users, breadcrumbs, arbitrary metadata, AI content, attachments, and source context are absent.
  - Backend, orchestrator, Next server, and Next edge entrypoints collect exceptions without browser delivery, logs, sessions, tracing, replay, profiling, AI integrations, metrics, or source-map upload.
  - Existing third-party purge guard remains strict outside a narrow file and dependency allowlist.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-ry5.4/plan.md
  - .codex/stages/content-factory-next-ry5.4/design-evidence.md
  - installed @sentry/nestjs 10.70.0 exports, types, and CommonJS SDK source
  - installed @sentry/nextjs 10.70.0 exports, types, and server/edge SDK source
selected_skills:
  - superpowers:test-driven-development
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: ry5.4-sdk-and-collector
depends_on_streams:
  - none
parallel_decision: parallel with disjoint collector-deployment write zone
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Direct shared-worktree delivery; no temporary branch, process, server, collector, database, or external resource was created.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - privacy
  - external-service
  - supply-chain
  - startup-availability
  - next-server-runtime
affected_surfaces:
  - backend-entrypoint
  - orchestrator-entrypoint
  - next-server
  - next-edge
  - dependency-lock
invariants:
  - positive-allowlist-payload
  - no-dsn-no-op
  - collector-failure-isolated
  - no-user-or-model-content
  - no-tracing-or-session-products
docs_impact: stage-artifact-only
docs_reviewed: yes
docs_review_notes: Versioned behavior was checked against the installed packages after the official-document fallback recorded by the root; operator configuration belongs to the parallel collector stream.
verification:
  - 'Initial RED: Node 22.23.2, TMPDIR=/tmp, exact focused command; 2 suites failed, 5 expected feature failures, 29 baseline tests passed.'
  - 'First GREEN after implementation: exact focused command; privacy suite passed, external guard exposed one overly broad localhost URL assertion, corrected to inspect collector configuration files only.'
  - 'Availability RED: exact focused command; Next entrypoint leaked an SDK init exception, 1 failed and 34 passed.'
  - 'Second GREEN: exact focused command; 2 suites passed, 35 tests passed.'
  - 'Own-infrastructure RED: arbitrary DSNs and a separate attachment still passed the pre-origin/attachment contract; the Next client did not name a separate allowed origin.'
  - 'Final GREEN: exact focused command; 2 suites passed, 37 tests passed, including exact-origin mismatch/downgrade rejection and a real SDK in-memory transport proof with no network.'
  - 'Installed package inspection: nestjs exposes init plus SentryGlobalFilter through @sentry/nestjs/setup; nextjs exposes init, captureRequestError, and captureException.'
  - 'Installed source inspection: ambient SENTRY_SPOTLIGHT, SENTRY_TRACES_SAMPLE_RATE, and SENTRY_DEBUG bypassed omitted options before beforeSend; explicit false/zero settings now override all three.'
  - 'Focused Prettier check and owned tracked-path git diff --check: passed after final GREEN.'
  - 'Root acceptance: repeated the exact focused pair on Node 22.23.2 with TMPDIR=/tmp; 2 suites and 37/37 tests passed, then git diff --check passed.'
  - 'Independent privacy RED: identifier-shaped content survived as exception/function/module names, direct browser delivery exposed IP/User-Agent at ingress, Spotlight created a second sink, and debug logged the raw message before beforeSend.'
  - 'Root privacy GREEN: fixed generic exception types, numeric-only frames, server-only delivery, explicit Spotlight/debug/tracing blocks; exact privacy target passed 10/10 with a real SDK transport and no network.'
changed_files:
  - package.json
  - pnpm-lock.yaml
  - apps/backend/src/main.ts
  - apps/orchestrator/src/main.ts
  - apps/frontend/src/instrumentation.ts
  - apps/frontend/src/sentry.server.config.ts
  - apps/frontend/src/sentry.edge.config.ts
  - libraries/nestjs-libraries/src/sentry/initialize.sentry.ts
  - libraries/helpers/src/errors/create.error.collection.options.ts
  - libraries/helpers/src/errors/sanitize.error.event.ts
  - tests/error-collection.privacy.test.cjs
  - tests/external-services.purge.test.cjs
  - .codex/stages/content-factory-next-ry5.4/artifacts/sdk.md
explicit_defers:
  - Live DSN and exact allowed-origin creation and wiring remain owner-only deployment work outside this epic.
  - Browser collection through a first-party relay or proven privacy-safe ingress is content-factory-next-ry5.10.
---

# Summary

The product now has a first-party error path for the backend, orchestrator, and
Next.js server/edge runtimes. Both SDKs are pinned to 10.70.0. A DSN is accepted
only when its normalized scheme, host and port equal a separately configured
allowed origin; an arbitrary SaaS DSN, protocol downgrade, path-bearing origin,
or either value missing leaves collection off. Initialization and filter setup
failures are swallowed without logging or changing product startup.

`beforeSend` never returns the input event. It constructs a new bounded object
containing only an opaque event id, timestamp, level, sanitized environment,
release and service tokens, one of eight fixed generic exception types, and at
most 50 stack frames with numeric coordinates. Messages and exception
values, URLs, headers, cookies, bodies, users, breadcrumbs, arbitrary tags and
contexts, code identifiers, local variables, source lines, attachments, and AI
content have no path into the returned event. `beforeSend` also clears attachments from the SDK
hint before transport. Malformed events and throwing accessors return `null`.

All default integrations are disabled. Nest uses the package's catch-all filter
after the existing specific filters. Logs, metrics, browser sessions,
breadcrumbs, tracing,
OpenTelemetry setup, ESM loader instrumentation, replay, profiling, AI
integrations, and build-time source-map upload are absent.

# Package inspection

The installed 10.70.0 packages were inspected instead of relying on recalled
API. `@sentry/nestjs` exports `init`, but its Nest filter is the
`SentryGlobalFilter` subpath export; there is no root `setupNestErrorHandler`.
The Next package exports `captureRequestError` for the instrumentation hook and
uses conditional server/edge exports in this branch. Its direct browser path is
intentionally absent because connection metadata would disclose IP/User-Agent.

The installed core source showed that omitted options are not neutral:
`SENTRY_SPOTLIGHT` adds a second envelope sink, `SENTRY_DEBUG` logs the raw
exception before `beforeSend`, and `SENTRY_TRACES_SAMPLE_RATE` enables tracing.
The implementation explicitly sets Spotlight/debug off and sampling to zero;
server OpenTelemetry setup remains skipped, so no trace is emitted.

# Verification

The delegated prescribed command passed 37/37 tests across both suites, and the
root privacy correction target passed 10/10 on Node 22.23.2 with
`TMPDIR=/tmp`. Earlier runs recorded the missing-feature RED, a
startup-isolation RED, an own-origin/attachment RED, and ambient/privacy REDs
before their minimal fixes. A real 10.70 Nest client used an in-memory transport: the SDK supplied
the event id and timestamp before `beforeSend`, the event survived sanitation,
the secret message and attachment did not reach the envelope, and no network
was used. The SDK adds only its own name/version provenance metadata after
`beforeSend`; all other event keys matched the allowlist. No full suite or build
ran in this delegated stream.

# Risks / Follow-ups

Root should retain the workspace build/type gate because this stream inspected
the installed conditional exports but intentionally did not run the build.
After a separately authorized collector deployment, allowed-origin and DSN
wiring, trigger one synthetic `TypeError` in each server-side runtime and inspect the
collector event JSON: it must contain only the allowlisted fields above plus the
SDK name/version provenance added by 10.70 after `beforeSend`. Repeat with both
DSNs absent, with a mismatched origin, and with the collector unreachable; the
product must start and serve normally.

Direct browser collection remains deferred as `content-factory-next-ry5.10`;
it needs a first-party relay or a proven privacy-safe ingress because payload
sanitization cannot hide network-layer IP/User-Agent. No network request,
collector, server, production database, deploy, push, merge, or commit was
performed. Root recorded the browser relay deferral in Beads.
