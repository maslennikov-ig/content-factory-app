---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:consumer-frontend
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root-orchestrator
public_facade: generator and editor draft provenance flow
bounded_acceptance: server-issued content context and per-item citations survive generate, edit, save and rehydration with visible fail-closed states
non_goals:
  - backend-schema-live-fetch-model-publish-deploy-credentials
evidence:
  - focused-red-green
  - frontend-typecheck
  - design-and-accessibility-guards
  - deterministic-local-browser-proof
task_id: content-factory-next-9e9.consumer-frontend
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 3a9606e76b44ee624a365304c4b63f629e0be81a
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/add.edit.modal.tsx
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx
  - tests/content-intelligence.consumer-frontend.test.cjs
  - .codex/stages/content-factory-next-9e9/evidence/consumer-frontend
  - .codex/stages/content-factory-next-9e9/artifacts/consumer-frontend.md
selected_skills:
  - impeccable
  - lazyweb
  - superpowers:test-driven-development
  - playwright
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The local Playwright browser and port-4221 development server were closed after selected evidence was retained.
risk_level: medium
risk_tags:
  - api-contract
  - async-state
  - accessibility
  - responsive-design
affected_surfaces:
  - frontend
  - generator
  - editor
  - draft-save
invariants:
  - server-issued-provenance-only
  - per-item-used-citation-ids
  - draft-only-output
  - explicit-neutral-and-evidence-required-states
  - no-live-fetch-model-publish-or-persistence
verification:
  - 'Initial RED: four of five focused consumer assertions failed before provenance parsing, stream propagation, save binding and visible fail-closed states existed.'
  - 'P1 correction RED: three executable split-NDJSON cases accepted a missing final binding, malformed final binding or changed profile binding; READY/neutral production renders used inaccurate expiry/policy copy.'
  - 'P1 correction GREEN: the three split-stream failures are rejected and READY plus RU neutral render assertions pass.'
  - 'GREEN focused and UI guards: seven Jest suites passed 109/109.'
  - 'Frontend TypeScript: pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --pretty false passed.'
  - 'Browser 390x844 and 1440x900: ready, neutral and evidence-required states rendered with no horizontal overflow; Context expires replaced Fresh until and neutral contains no grounded claim.'
  - 'Browser keyboard and targets: Tab focused the first citation checkbox, Space toggled it, and both label targets measured 284x44 CSS pixels at 390px.'
  - 'Browser isolation: Playwright reported no non-static request; expected development HMR websocket retries were rejected by connect-src none.'
  - 'Whitespace: scoped git diff --check passed.'
changed_files:
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/add.edit.modal.tsx
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx
  - tests/content-intelligence.consumer-frontend.test.cjs
  - .codex/stages/content-factory-next-9e9/evidence/consumer-frontend/README.md
  - .codex/stages/content-factory-next-9e9/evidence/consumer-frontend/consumer-390-focus.png
  - .codex/stages/content-factory-next-9e9/evidence/consumer-frontend/consumer-1440.png
  - .codex/stages/content-factory-next-9e9/artifacts/consumer-frontend.md
explicit_defers:
  - manual-VoiceOver-or-NVDA-spoken-announcement-check
  - root-owned-backend-frontend-integration-acceptance
  - no-live-fetch-model-call-publish-deploy-credentials-or-production-data
---

# Summary

Generator and editor drafts now keep one immutable server-issued content
context through generation, context inspection, per-item citation selection,
save and edit rehydration. The client cannot turn a URL, provider label or
legacy research source into authority: strict parsers accept only matching
context/profile IDs, policy, status and selection hash from server responses.
Malformed, mismatched or stale bindings fail closed.

Generator consumes the early `content-context` NDJSON event and requires the
same complete canonical binding on the content-bearing final event. Equality
covers snapshot/profile IDs, resolved or neutral selection details, status,
policy and selection hash. A missing or malformed final binding and any profile
selection mismatch fail closed. Split stream chunks are buffered. Final items
must carry `usedCitationIds`, and the authenticated immutable context envelope
must recognize every selected citation before the draft modal opens.

Editor research uses the actual integration/interface language with
`POST /copilot/research?language=ru|en`. A request sequence fence prevents an
older response from replacing a newer one. New contexts clear prior item
attribution; each item then selects exact fact/evidence citation IDs. Save sends
the exact top-level snapshot/profile IDs and exact per-item citation arrays.
Only draft save remains enabled for content-intelligence output.

Edit rehydration trusts only the tenant-scoped post output context plus the
authenticated immutable context GET. It verifies nested context timestamps,
status, published/archive profile metadata, validation status and all citation
IDs before restoring state.

# User-visible states

The editor shows the applied profile label and version, context status,
validation status and exact context expiry. READY + ALLOW_GROUNDED is explicitly
grounded and draft-only. UNAVAILABLE + ALLOW_USER_ONLY is an explicit `Neutral
voice` / user-material-only fallback and never claims grounding.
`CONTENT_EVIDENCE_REQUIRED` is a visible alert and blocks save; other
unavailable or invalid context states also block save. Existing
`researchSources` remain only as a compatibility display and explicitly do not
establish provenance.

The selected Lazyweb evidence is preserved at
<https://www.lazyweb.com/agentic-search/41b95e71-68b0-4bbb-8df0-259a853dafac>.
It informed the visible voice/source/freshness hierarchy. Impeccable kept the
new surface within existing `cf` tokens, shared checkbox controls, responsive
wrapping and explicit status/error semantics.

# Verification and evidence

The focused test executes the strict store parsers and guards the production
generator, editor, modal, save and static review seams. It feeds deliberately
split NDJSON into the same production consumer and renders the production
summary component for grounded and Russian neutral cases. The high-risk async
transition is covered by the editor request sequence fence and exact generator
stream binding mismatch rejection. Browser evidence is indexed in
[`evidence/consumer-frontend/README.md`](../evidence/consumer-frontend/README.md).

Manual VoiceOver/NVDA announcement verification was unavailable. Final
backend/frontend contract acceptance remains root-owned because both streams
share the stage integration boundary. No backend, schema, unrelated route,
credential, external service, live fetch, model, publish, deploy or production
data was touched by this stream.

# Risks / Follow-ups

Manual VoiceOver/NVDA announcement verification remains a P2 follow-up. Root
owns the final cross-stream check against the delivered backend response shapes.
The review fixture is local-only and does not replace an authenticated
integration run.
