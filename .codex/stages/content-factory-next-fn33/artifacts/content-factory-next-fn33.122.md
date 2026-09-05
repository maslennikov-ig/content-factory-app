---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: browser tab title
public_facade: pageTitle and PageTitleLanguage
bounded_acceptance: after the profile language is applied in the browser, the tab is renamed with the key the server used
non_goals:
  - changing how the request language is negotiated
  - renaming any title key
evidence:
  - page-title-language
task_id: content-factory-next-fn33.122
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: walker cleanup wave, language surface
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: crosses the server/client boundary, so the shape of the contract had to be chosen rather than copied
repo: content-factory-next
branch: worktree-agent-aa87be6131f0092ac
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa87be6131f0092ac
write_zone:
  - apps/frontend/src/app/page-title.ts
  - apps/frontend/src/app/page-title.contract.ts
  - apps/frontend/src/app/page-title.client.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - tests/page-title-language.test.cjs
success_criteria:
  - a key is written in one place only, the route file
  - the tab is re-resolved on i18next languageChanged
  - a page without a title key is left as the server sent it
selected_docs:
  - next@16.2.6 Metadata.other (docs-resolve l1-hit, plus the installed package types)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: walker-p3-cleanup
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state outside the worktree
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the decision is written in the two modules it spans; no repository doc states title handling
verification:
  - pnpm exec jest tests/page-title-language.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/app/page-title.ts
  - apps/frontend/src/app/page-title.contract.ts
  - apps/frontend/src/app/page-title.client.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - tests/page-title-language.test.cjs
explicit_defers:
  - none
---

# Summary

The tab was named on the server from the `i18next` cookie. A browser signing in
for the first time has no such cookie: the page went out in the browser's own
language, the profile language was applied a moment later in the browser, and
everything rendered followed — except the tab, whose title was a finished
string with no key attached.

`pageTitle` now also states the key and its English fallback in the page head
(`Metadata.other`), and a client companion, `PageTitleLanguage`, reads them back
and re-resolves the title on `languageChanged`. The route file stays the only
place a key is written: no table is copied into the browser, and a route added
later is covered without touching the companion.

# Scope / Routing

Three modules where the bead named one, and that is the deviation worth
stating: `page-title.ts` reaches `next/headers` through `getT`, so a client file
cannot import it. The shared names therefore live in `page-title.contract.ts`,
which imports nothing, and both sides read them from there.

The companion is mounted in the application shell, beside `LanguageFromProfile`,
because that is what it answers. Sign-in and public pages are not covered: there
is no profile there, so the language never changes after arrival.

`Metadata.other` was confirmed against the installed `next@16.2.6` types, which
document it as rendering `<meta name content>`; `orch-prompts docs-resolve`
reported `l1-hit`, coverage `compatible`.

# Verification

The suite fails to load without the change (`page-title.contract.ts` missing),
and the browser-level tests fail with it stubbed out. All fourteen pass after.
Frontend `tsc --noEmit` is clean.

# Risks / Follow-ups / Explicit Defers

The head-based handover is only as good as Next putting `other` in the head; the
behaviour is covered by tests at the source level and in jsdom, but not in a
running browser — this worktree has no stand of its own. Worth one look in the
merged stand: sign in from a clean context with a Russian profile and an English
`Accept-Language`, and read the tab.
