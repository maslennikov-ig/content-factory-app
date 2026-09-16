# Seventh walk wave execution

Specification: docs/product/seventh-walk-wave-2026-09-16-spec.md. Beads xmfb owns status; this file records execution and acceptance evidence.

## Ownership and integration

- S1 / agent/xmfb-s1 / cf-xmfb-s1: .3, .4, .9; Sol high; extract/questions, search classifier, core stance.
- S2 / agent/xmfb-s2 / cf-xmfb-s2: .1, .2, .6, .10; Sol high; fact toggle, review, Dialog, research acceptance.
- S3 / agent/xmfb-s3 / cf-xmfb-s3: .7; Luna max; shared Th and list sorting.
- S4 / agent/xmfb-s4 / cf-xmfb-s4: .8; Sol high; key resolution, search accounting, settings/help.
- S5: .5 after S2; own worktree based on integrated dependencies.

Benefit: parallel latency and write isolation; the interacting AI/accounting streams use Sol high, bounded sorting uses Luna max per delegation guidance. Root owns integration, docs, stand, final acceptance and release. Integration order S3 -> S4 -> S1 -> S2 -> S5. Review shared intake.service.ts, web.research.service.ts and ai.usage.service.ts seams explicitly.

## Acceptance and authority

Owner explicit yes after six local scenarios is pending. Release is authorized by current order subject to this gate. No paid calls in tests. No schema changes; host <6 GB free blocks pull and requires owner action. Rollback 93aa33b85a79. xmfb.11 stays with Claude.

One full pnpm test run via record-suite-receipt.sh after source commit; three app tsc, build, process and diff checks at root. Focused stream checks do not establish live model quality.

## Evidence

graph-reviewed: existing root graph consulted read-only; GRAPH_REPORT names old 94fdcb33, so current spec/code reconnaissance is authoritative for changed seams. Refresh locally at accepted integration boundary.
Local stand preflight: cf-dev PostgreSQL/Redis present, frontend/backend not running; local InstanceAiDefaults absent and .env has no model/search keys. Live AI stand is not proven.

## Stream acceptance

S3 delivered c911427e and integrated as e59e8f8d. Root reviewed Th and URL/client sort boundary; focused worker proof 3 suites / 60 tests passed on Node 22.23.2. Accepted for integration; root final acceptance remains. Clean worktree retained until release; no destructive cleanup performed.

S3 browser proof: Windows Chrome via CDP, 1360px table and 390px cards; title asc/desc toggles persisted in URL, mobile format desc updated the same state; screenshots output/playwright/xmfb-sort-{desktop,mobile}.png. Synthetic local record only; no paid/model requests.

S1 delivered b12a3724 + 33b08ac4: model material classification, position rule, sanitized classification log, core stance prompt. Worker proof intake 35, research 55, pieces 65, intake flow 12 passed.
S2 delivered 11b41fb7: factKey toggle, review v3, failed-review quota exception, Dialog and settled thesis/ungrounded. Worker proof 12 suites / 277 tests, frontend/backend tsc passed. Root follow-up: omit semantic style rules in web prompt and validate malformed changes individually.
S5 delivered 5a701612 + 5774cadc from S2: shared depth selector, direction Dialog and versioned research preview/digest, inline retry error. Worker proof 152 tests plus 32 follow-up tests passed. ESLint config circular-reference failure is not a lint pass; root prescribed gates still pending.
Local auth preflight: NOT_SECURED client reads auth cookie to send request header; initial temporary HttpOnly cookie yielded /user/self 401. Temporary CDP login now follows local cookie convention; product auth unchanged. Stand record [Стенд xmfb] is synthetic, existing local records retained. Backend watch exceeded default V8 heap and was restarted only for this stand with 8192 MB; backend root and frontend return 200.

S4 delivered 9b938f18, integrated b0411352: root inspected credential resolution and admission lifetime; parallel fallback race fixed with in-flight per-source promises, worker proof 12 suites / 231 tests plus UI 85 and design 73, frontend/backend-library tsc passed. Premortem evidence/premortem-search-keys.md.
S1 integrated 64cd7e1d + 28b20de7, S2 6293ee84, S5 bad56fb6 + bc3d8cfe. Automatic merges preserved all shared seams. Accepted for integration with root review follow-ups; all clean worktrees retained until release, no destructive cleanup. Root final gates pending.

Root review correction: web prompt no longer receives semantic style catalogue; schema validation occurs per change so one malformed item or >200 notes does not reject the usable envelope. Focused review-v3 test log: /tmp/cf-xmfb-review-fix.log.
docs-reviewed: updated PRODUCT.md, help FAQ/copy, component inventory and project index to match the owner decisions. No lockfile or schema source changes.

Root acceptance follow-up: initial full Jest run found four failing suites. Replaced the new raw table button with shared ControlButton without expanding the exception ledger. S4 follow-up 911dd766 (integrated 1795edc2) updates three stale research/admission mocks; 3 suites / 51 tests pass and exact admission counts remain asserted. Spend confirmation now describes both quota and provider charges.
Local Windows Chrome proof: real fact PATCH returned 200 in both directions and selected=true survived reload. Research/review Dialog open/cancel issued no product POST. A synthetic non-provider Exa value was saved only in the local demo workspace (201), then removed through the per-engine UI (200); no provider call or real credential was used. Screenshot paths under output/playwright/xmfb-*.png are local only. Recorded WB/Ozon extraction/question and web review behavior are covered by tests; live model output remains unproven on this keyless stand.
graph-reviewed: local graphify update completed with 24270 nodes / 43984 edges; no external semantic backend.

## Owner amendment: onboarding and section titles (xmfb.12)

The owner extended the current unreleased wave after reviewing the stand: progress misses existing work, duplicate section headings should leave only the upper title, and the leave action should not jump to the calendar. Owner explicitly selected existing pieces -> pieces, otherwise avatar. Original acceptance criteria are preserved; an additional criterion records this amendment. Candidate feac52a8bb78 is superseded, not published/deployed. No release approval was granted by the navigation choice.

- Root owns onboarding leave link/copy/tests and final integration. Existing design primitives and navigation destinations; no schema changes. Brainstorming resolved the only product choice; no further approval loop for implementation.
- Reused S1 in isolated agent/xmfb-onboarding-progress: progress repository/adapter/hook and focused regressions, read-only production diagnosis allowed. Stop for unclear completion semantics.
- Reused S3 in isolated agent/xmfb-headings: section title duplication and related UI tests. Root retains leave-link area in shared walkthrough; S1 retains progress fields. Preserve unique subheadings/actions and accessible names.
- Parallel benefit: independent data diagnosis and UI inventory; no shared backend writes. Workers read AGENTS/design docs/graph and reuse installed impeccable. No full suites/builds in workers. Root runs one refreshed release acceptance after integration; no paid calls or production mutations.

Amendment S1 accepted: f8f4e0ad integrated e8883099. Read-only production counts confirmed the stale memory-only fact-step gate; selected facts inside CORE briefs were not counted. Root reviewed reuse of selectedFactsBrief, organization/archive filters and malformed-JSON zero fallback. Dedicated pieceFacts leaves other step semantics unchanged and supports old responses. Worker focused proof 3 suites / 29 tests passed. Clean worktree retained; no runtime/branch cleanup needed. Root integrated acceptance follows the combined amendment.

Amendment section titles accepted: S4 dcd88765 integrated d86de480; root inspected content/avatar, channels, analytics, Help and optional PageHeader title. Descriptions, actions, tabs and unique nested headings remain. Worker proof: 75 focused tests, 59 design/foundation tests and frontend tsc passed. Clean worktree retained; no destructive cleanup. Root supplied contextual exit (92fb77f4) and query-aware upper title plus standalone onboarding heading removal (41ebf0fa). The earlier S3 inventory stream produced no implementation; root and S4 own the delivered change. Owner explicitly chose pieces when present, otherwise avatar. Final combined release acceptance and refreshed stand follow; no release approval inferred.
