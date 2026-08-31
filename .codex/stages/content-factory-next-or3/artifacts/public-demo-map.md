---
schema_version: orchestration-artifact/v3
artifact_type: gap-map
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:public-demo-map
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: content-factory-next-or3 root acceptance
public_facade: public routes and anonymous synthetic demo
bounded_acceptance: code-boundary review, focused guards, locale inventory, browser and request-proof gap identification
non_goals:
  - implementation changes
  - public claim expansion
  - live deployment
evidence:
  - source_review
  - graphify_review
task_id: content-factory-next-or3.public-demo-map
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: v3 public-route and synthetic-demo gap map
milestone_status: returned
agent_type: explorer
subagent_model: gpt-5.6-terra
reasoning_effort: medium
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - .codex/stages/content-factory-next-or3/artifacts/public-demo-map.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: read-only mapping accepted; no server, browser, external account, temporary runtime, branch, or worktree required cleanup
risk_level: medium
risk_tags:
  - ui
  - privacy
  - localization
affected_surfaces:
  - ui
  - user-flow
  - api
invariants:
  - privacy
  - state-transition
  - test-matrix
verification:
  - graphify check-update and three focused graph queries located PublicShell, public routes, proxy allowlist, SyntheticDemo and public telemetry contract
  - pnpm exec jest tests/public-saas-routing.test.cjs tests/public-saas-demo.test.cjs tests/public-saas-telemetry.test.cjs tests/cloud-saas-contract.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs --runInBand --coverage=false passed 6 suites and 161 tests
  - no committed public interface-review scene, public-header review test, HAR, or request ledger exists in the current tree
changed_files:
  - .codex/stages/content-factory-next-or3/artifacts/public-demo-map.md
explicit_defers:
  - owner decisions on pricing, trial, card requirement, provider, data region, legal model and production readiness
---

# Summary

`or3.5` and `or3.6` are code-complete for the scope stated in their Beads
descriptions. Commit `1ab0c619` is merged into the current public-funnel base;
rebuilding the accepted public surfaces would be duplicate work. The remaining
work is a narrow acceptance-evidence seam, not a new public product claim.

| Area | Already satisfied in the current tree | Remaining gap |
| --- | --- | --- |
| `/`, `/product`, `/security`, `/docs` | Public route group, common shell, responsive navigation, AGPL Source footer, sign-in and sign-up paths, and demo CTA exist. `PUBLIC_PATHS` is an exact allowlist and its test protects anonymous access. | Browser proof of all four routes at the required widths/themes; no code change is indicated. |
| Claims | Product page distinguishes available work from roadmap. Security page states boundaries and limits. Claim guard rejects pricing, price, trial, no-card and self-hosting language; tests also forbid certification/availability-style unsupported claims across locale and legal surfaces. | Do not widen copy. Re-run the existing claim guards as part of final acceptance only; no new guard is required unless copy changes. |
| `/demo` | `SyntheticDemo` is versioned `public-demo-v1`, uses React-only state, carries visitor text through plan → draft → review → schedule, requires approval before scheduling, and labels its result as demo data. Focused tests cover all four named stages and approval/calendar gates. | A request ledger must prove this in a real browser: zero tenant/data-mutation, AI, Temporal, OAuth, publishing, paid-provider or account requests; the sole permitted request is the fixed anonymous first-party growth POST. |
| Route and side-effect boundary | Proxy protects non-allowlisted pages; public telemetry is fixed to four anonymous event names and `credentials: omit`. Source-level tests verify payload shape and lifecycle hooks. | Source and mocked-fetch tests are not a browser network capture. Capture and preserve the actual request set for the complete walkthrough. |
| Locales | All 16 bundles have the same 1,481 keys and 169 `public_saas_*` keys. RU and EN public copy is authored; key-set and non-Latin translation-ledger guards pass. | Browser screenshots must show RU and EN without truncation/overflow. The automated ledger cannot judge semantic quality of Latin-script translations, so do not claim human translation review beyond the existing guard. |
| Interface-review seam | `docs/design/component-authoring-rules.md` is represented in the public components: `cf-*` tokens, shared controls, visible focus classes, and current design/foundation guards. The old SaaS artifact records a historical local browser pass. | The planned `tests/interface-review-public-header.test.cjs` and public `/interface-review` scenes under `apps/frontend/src/app/(stand)/` are absent at this tip. This is missing current, reproducible browser evidence, not a defect in the shipped header. |

## Exact acceptance work still required

1. Add or restore a development/test-only public interface-review scene and a
   focused public-header check. It must exercise the real public shell and
   routes, rather than duplicate markup. Its scope is visual/reflow/focus
   evidence only.
2. Drive `/`, `/product`, `/security`, `/docs`, and `/demo` in Chromium at 390
   and 1440px, in light and dark themes, with RU and EN. Record screenshots and
   a concise result for visible focus, keyboard path, reduced motion and
   page-level horizontal overflow.
3. During the `/demo` walkthrough, record a request ledger/HAR and run an
   offline inspection. Assert the exact negative set above and allow only
   `POST /public-growth-events` with the fixed coarse payload. Do not include
   request headers, cookies, visitor values or any sensitive payload in the
   committed summary.
4. Link the resulting evidence and exact commands from the root stage artifact,
   then run the existing focused route/demo/telemetry/claim/locale suite. No
   public page rebuild, claim change, locale-key expansion or backend contract
   change is warranted by this map.

# Verification

Graphify was used before source inspection. Focused queries resolved the
public routing boundary (`PUBLIC_PATHS` and `proxy`), the component chain
`DemoPage → SyntheticDemo`, and the public-event vocabulary. Exact local files
then confirmed the graph results.

The following focused acceptance set passed:

`pnpm exec jest tests/public-saas-routing.test.cjs tests/public-saas-demo.test.cjs tests/public-saas-telemetry.test.cjs tests/cloud-saas-contract.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs --runInBand --coverage=false`

Result: 6 suites, 161 tests passed. This proves the current code guards and
locale-key ledger; it deliberately does not substitute for a browser request
ledger or current screenshots.

# Risks / Follow-ups

The only functional risk to close is an unobserved browser seam: static tests
cannot prove that the actual page issues no disallowed network request or that
the rebuilt header reflows at the required widths and themes. Treat a ledger
showing any tenant, mutation, AI, Temporal, OAuth, publishing or paid-provider
request as a stop condition for `or3.6`, not as permission to relax the guard.

Keep the claims boundary unchanged. Pricing, trial, card requirement,
self-hosting, provider, data-region, legal-model and production-readiness
decisions remain owner-owned and are outside `or3.5`/`or3.6`.
