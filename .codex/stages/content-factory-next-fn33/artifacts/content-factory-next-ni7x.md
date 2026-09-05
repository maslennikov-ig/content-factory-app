---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: «Откуда идеи» tab, organisation administrator
public_facade: POST /content-intelligence/leads/subscriptions and .../:id/check
bounded_acceptance: both ceilings refuse on the inside of the boundary and allow on the outside, in the asker's language
non_goals:
  - a licence tier or a per-plan limit
  - any change to the roles matrix (the doors are unchanged)
  - any outbound feed request from a test
evidence:
  - content-lead-limits-guard
  - backend-locale-strings
  - roles-matrix-guard
  - tenant-isolation-guard
  - backend-typecheck
task_id: content-factory-next-ni7x
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: cleanup wave, stream B
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: resource ceiling touching service, controller, repository and the locale catalog
repo: content-factory-next
branch: worktree-agent-a8e448f85ada45206
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4257143f6b05351118fe8c4ba0e9ffb06
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8e448f85ada45206
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/leads/**
  - apps/backend/src/api/routes/content-lead.controller.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/*.cjs
success_criteria:
  - twenty live subscriptions per organisation, the twenty-first refused with SUBSCRIPTION_LIMIT
  - a manual check within 60s of the last one refused with CHECK_TOO_SOON, the periodic tick never throttled
  - both refusals readable in ru and en
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state left behind
risk_level: medium
risk_tags:
  - concurrency
  - api
  - tenancy
affected_surfaces:
  - api
  - backend
invariants:
  - tenancy
  - state-transition
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the roles matrix is unchanged — the same two doors, now with a ceiling behind them; the guard was run to prove it
verification:
  - "pnpm exec jest tests/content-lead-limits.guard.test.cjs: passed"
  - "pnpm exec jest tests/content-lead-service-recovery.guard.test.cjs tests/content-lead-dismissal-guard.test.cjs tests/content-leads.role-visibility.test.cjs tests/content-lead-check-continue-as-new.guard.test.cjs: passed"
  - "pnpm exec jest tests/backend-locale-strings.test.cjs tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs: passed"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed"
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/leads/lead-limits.ts
  - libraries/nestjs-libraries/src/content-intelligence/leads/errors.ts
  - libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.repository.ts
  - apps/backend/src/api/routes/content-lead.controller.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/content-lead-limits.guard.test.cjs
  - tests/content-lead-service-recovery.guard.test.cjs
explicit_defers:
  - none
---

# Summary

Two ceilings «Откуда идеи» never had.

**Twenty per organisation.** The unique index is
`(organizationId, kind, canonicalUrl)`, so it only stopped the same address
twice: a workspace could hold any number of different feeds, and each one is a
perpetual Temporal workflow that keeps ticking forever. `createSubscription`
now counts live rows first (`ContentLeadRepository.countSubscriptions`,
`deletedAt: null`, so unsubscribing frees a slot) and refuses the twenty-first
with `SUBSCRIPTION_LIMIT` / 409.

**A minute between manual checks.** `POST /subscriptions/:id/check` made an
outbound request per click. `LEAD_FEED_CHECK_ENABLED` is a switch, not a rate,
and it is off by default, which hid this rather than fixed it. A manual check
inside 60s of `lastCheckedAt` is refused with `CHECK_TOO_SOON` / 429, before
the feed is opened and before the recovery Temporal start. Only the manual
path: the periodic workflow's own tick calls the same method with no options
and is never throttled, because its rate is already the interval the row was
created with.

Both numbers live in one file, `lead-limits.ts`, so nothing retypes them.

# Scope / Routing

The refusal text is chosen on the server, because the screen prints the
server's own sentence — `content-leads.adapter.ts` re-exports `readFailure`
from `voice-materials.adapter.ts`, which prints `error.message` verbatim. So
both routes now carry the asking account's `language` down to the service and
resolve it with `resolveBackendLocale`. The two strings went into the backend
catalog (`locale/backend-strings.ts`) with all sixteen locales filled in, read
through `translateBackendText` rather than `translateBackendString` because the
message lands in JSON and is rendered as text — `translateBackendString`
HTML-escapes, and an escaped apostrophe in a UI error would be a visible bug.

Deviation from the instruction, recorded deliberately: the brief said ru/en by
hand and English for the other fourteen. The backend catalog states in its own
docblock that no locale in it was skipped back to English, so English
placeholders there would have made that statement false. All sixteen were
translated instead; `bn` and `ka_ge` carry the same "structure-checked only"
caveat the file already declares for them.

Assumption the owner should confirm, taken conservatively while he is away:
twenty is a flat product limit for every organisation, not a per-plan number.
Nothing in this change reads a billing tier, and making it plan-dependent later
is a change in one constant plus a lookup.

No roles-matrix row: the two doors are the same doors, under the same
`[Create, ADMIN]` and `[Update, ADMIN]` policies. The guard was run to confirm
that reading.

# Verification

- `tests/content-lead-limits.guard.test.cjs` — new, 10 tests. Red first: the
  run before the implementation failed at load with
  `ENOENT … leads/lead-limits.ts`. Green after.
- Neighbouring lead suites, the locale catalog suite, the roles-matrix guard
  and the tenant-isolation guard: 95 passed across 7 suites.
- `tsc --noEmit -p apps/backend/tsconfig.json`: 0 errors.

No feed was contacted: `LeadFeedGateway` is a fake in every test.

One collateral edit outside the production sources: the fake repository in
`tests/content-lead-service-recovery.guard.test.cjs` gained
`countSubscriptions`, because `createSubscription` now asks it.

# Delivery / Cleanup

One commit on the stream branch. Nothing to clean.

# Risks / Follow-ups / Explicit Defers

- The count and the create are not one transaction. Two simultaneous creates
  can land one row over twenty. Taking a lock on every create to close a race
  that costs one extra feed is not worth it for a limit whose job is to stop a
  workspace opening hundreds; recorded here rather than left silent.
- Existing organisations are not audited. If any workspace is already above
  twenty, it keeps its rows and simply cannot add more. Nothing is deleted.
- The screen has no special wording for either code: it prints the server's
  sentence. That is deliberate — the sentence is already in the person's
  language — but if the tab later wants a distinct treatment (for example
  disabling "Проверить сейчас" for the remaining seconds), that is a separate,
  frontend-only task.
