---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-saas/stage-manifest.json
stream_owner: ui_error_guards
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner and public SaaS launch flow
public_facade: public routes, synthetic demo, email-first registration, and anonymous growth events
bounded_acceptance: focused routing, demo, registration, telemetry, design and foundation checks
non_goals:
  - landing-agent auth layout or workflow surfaces
  - backend, schema, real publishing, AI, Temporal, OAuth, credentials, pricing or deployment
  - browser acceptance, full build or broad suite
evidence:
  - lazyweb-growth-report
task_id: content-factory-next-saas.public-ux
epic_id: content-factory-next-saas
stage_id: content-factory-next-saas
session_id: content-factory-next-saas
milestone: public SaaS shell, safe demo and registration handoff
milestone_status: accepted
agent_type: frontend_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: bounded frontend implementation stream assigned by root
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/frontend/src/app/(public)/**
  - apps/frontend/src/components/public-saas/**
  - apps/frontend/src/proxy.ts
  - tests/public-saas*.test.cjs
  - .codex/stages/content-factory-next-saas/artifacts/public-ux.md
success_criteria:
  - unauthenticated users can reach only the five explicit public routes
  - the synthetic plan-to-schedule demo performs no tenant, AI, Temporal, OAuth or publishing work
  - email remains in React memory and the second step uses the existing registration endpoint and auth-header wrapper
  - only blank is forwarded as a starter intent; unsupported ids are dropped
  - public copy is authored in Russian and English with English fallback for other interface languages
  - anonymous telemetry sends only the fixed coarse contract to the configured backend origin
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-saas/spec.md
  - .codex/stages/content-factory-next-saas/plan.md
  - .codex/stages/content-factory-next-saas/stage-manifest.json
  - docs/design/component-authoring-rules.md
  - PRODUCT.md
  - DESIGN.md
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - impeccable
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cloud-saas-growth-writers
depends_on_streams:
  - auth-metrics fixed POST /public-growth-events and blank starter-template contracts
parallel_decision: shared worktree with corrected write isolation from landing-owned auth and locale files
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no browser, server, external account, temporary worktree or runtime resource created
risk_level: medium
risk_tags:
  - public-api
  - privacy
  - authentication
  - accessibility
  - responsive-ui
affected_surfaces:
  - ui
  - user-flow
  - api
invariants:
  - privacy
  - state-transition
  - test-matrix
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: stage contract already describes this temporary public surface; implementation details remain in this handoff
verification:
  - RED routing/public copy: 2 focused suites failed because public routes and local RU/EN copy did not exist
  - RED registration: focused suite failed before the local second step, legal state, newsletter consent and allowlisted payload existed
  - RED telemetry: focused suite failed before backend-origin anonymous events and lifecycle hooks existed
  - RED demo event idempotence: focused demo test observed duplicate demo_started after reset
  - RED high-zoom reflow: focused routing/UI guard failed before PublicHome grid children could shrink below min-content width
  - RED intrinsic text reflow: focused routing/UI guard failed before the hero heading and workflow labels allowed anywhere wrapping at 195 CSS px
  - GREEN TMPDIR=/tmp pnpm exec jest tests/public-saas*.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs --runInBand: 7 suites and 60 tests passed
  - git diff --check on owned production and test files: passed
  - root Playwright on localhost:4218: public routes rendered with zero product console errors; 1440/1024/768/390 and 720/512/384/195 CSS-pixel reflow matrix had no horizontal overflow after the focused fixes
  - root Playwright: demo advanced Plan -> Draft -> Review -> Schedule, reset became available, RU and EN authored copy rendered, keyboard focus traversed every public control, and reduced-motion reported zero animated main descendants
  - root Playwright: email remained off URL/storage, step two exposed password/workspace/legal/newsletter/auth-option boundaries, /auth rendered separately, and a synthetic auth cookie reached the protected /launches workspace route without tenant data
  - root review correction RED then GREEN: activation-required registration follows backend `activate: true` to `/auth/activate`; the focused public-registration and AI-usage pair passed 14 tests
  - root release correction: SyntheticDemo uses the shared Button primitive and PublicInfoPage uses a typography token; raw-control, typography, branding, SSRF, branch-pin, demo and AI-component focused checks passed 7 suites / 97 tests
changed_files:
  - apps/frontend/src/app/(public)/layout.tsx
  - apps/frontend/src/app/(public)/page.tsx
  - apps/frontend/src/app/(public)/product/page.tsx
  - apps/frontend/src/app/(public)/security/page.tsx
  - apps/frontend/src/app/(public)/docs/page.tsx
  - apps/frontend/src/app/(public)/demo/page.tsx
  - apps/frontend/src/components/public-saas/public-copy.ts
  - apps/frontend/src/components/public-saas/public-shell.tsx
  - apps/frontend/src/components/public-saas/public-home.tsx
  - apps/frontend/src/components/public-saas/public-info-page.tsx
  - apps/frontend/src/components/public-saas/synthetic-demo.tsx
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - apps/frontend/src/components/public-saas/public-telemetry.ts
  - apps/frontend/src/proxy.ts
  - tests/public-saas-routing.test.cjs
  - tests/public-saas-demo.test.cjs
  - tests/public-saas-registration.test.cjs
  - tests/public-saas-telemetry.test.cjs
  - .codex/stages/content-factory-next-saas/artifacts/public-ux.md
explicit_defers:
  - browser screenshots, responsive browser proof and built-route verification remain root-owned by assignment
  - content-factory-next-or3.2 retains the real starter-template catalogue; blank is the only current idempotent no-op
  - configured OAuth providers remain on /auth; the public registration step links there instead of duplicating credential logic
completion_event: 1d49a21d-8209-4dfd-bfa6-e6715d9e679f
supersedes_completion_event: e71c6ee1-46be-45dd-b348-ebb15483a782
---

# Summary

The public SaaS surface now has an isolated shell and exact unauthenticated
routes for `/`, `/product`, `/security`, `/docs`, and `/demo`. It reuses the
Desert Lab tokens, Content Factory mark, platform badges, and visible AGPL
Source link. Product copy separates available behavior from roadmap; security
copy names tenant isolation, encrypted workspace AI keys, operator-owned
backup/recovery, deletion/export state, and current limitations without making
certification claims. Docs content is user workflow guidance rather than an
operator deployment guide.

The demo is a local React state machine for plan, draft, review, and schedule.
It uses native buttons, an accessible named region, an announced changing
panel, and responsive grids. It never calls tenant or content-mutation APIs,
AI, Temporal, OAuth, publishing, or paid providers. Its only network activity
is the allowlisted first-party aggregate telemetry contract; lifecycle events
are idempotent for the page mount and use only the fixed anonymous coarse
vocabulary.

# Registration and privacy boundary

The first registration step stores email only in component memory. The second
step submits the compatible `/auth/register` payload through the existing
`LayoutContext` fetch wrapper, so the configured backend origin and auth/showorg
response headers retain existing behavior. It includes password, optional
workspace name, optional policy-gated newsletter consent, configured legal
links or an honest unavailable state, and a link to configured sign-in options
on `/auth`. Only `blank` can cross as `starterTemplate`; any other value is
dropped.

Public copy lives inside the isolated public component directory to avoid the
landing stream's shared locale ownership. Russian and English are authored;
every other current interface language receives English fallback. No email,
URL, referrer, user agent, raw viewport width, visitor id, cookie or storage key
is included in telemetry. The four allowed events post with
`credentials: 'omit'` to the configured backend URL.

# Verification and handoff

Focused TDD covered route allowlisting, local copy, high-zoom grid and intrinsic text reflow, the demo state machine and
event idempotence, registration payload/routing, legal/newsletter UI, starter
intent filtering, and telemetry serialization. The final assigned command
passed 7 suites and 60 tests under Node 22.23.2, pnpm 10.6.1 and `TMPDIR=/tmp`.
Design guard, contrast guard, foundation guard, and owned-file whitespace checks
also passed.

No browser server, screenshot, broad suite, build, commit, merge, push, PR,
deploy, production action, credential access, paid call, or Beads mutation was
performed. Browser proof remains explicitly root-owned.

Root accepted completion event `1aba6a3e-13b3-4f7f-be1e-a1bba0fc7138`
after rerunning all seven assigned suites (59/59 passed) and the v3 artifact
validator. Cleanup remains not applicable because the stream created no
isolated runtime or temporary resource.

The accepted stream was then corrected twice from real-browser reflow evidence;
the final event is `1d49a21d-8209-4dfd-bfa6-e6715d9e679f`. Root reran the exact
195 CSS-pixel check (390 px at 200% zoom), the route/demo/registration/telemetry
focused suites, and the responsive/keyboard/reduced-motion browser matrix. The
local browser used synthetic data and a synthetic auth cookie only; it did not
call a live backend, provider, tenant, or paid service.

Root review then found and corrected one integration defect: the public form
had handled administrator approval but not email activation. It now uses the
same `/auth/activate` handoff as the existing registration surface before any
workspace navigation.

The first root release run also exposed native-button and typography-ledger
violations that the assigned subset had not included. The demo now uses the
shared Button primitive and the public information CTA uses `cf-label-md`; no
exception ledger was widened.

# Risks / Follow-ups

The selected Lazyweb evidence remains available at
https://www.lazyweb.com/report/lazyweb/a83eee9e-70e3-49d4-b8bc-998b4dfcbab9/?source=create.
The root still needs browser proof for responsive layout, both themes, keyboard
navigation, and built route rendering. The real starter-template catalogue
remains deferred to `content-factory-next-or3.2`; this stream emits only the
accepted `blank` no-op.
