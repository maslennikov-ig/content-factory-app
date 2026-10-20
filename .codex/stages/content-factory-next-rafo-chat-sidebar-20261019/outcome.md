# Assistant chat navigation follow-up

Task: `content-factory-next-rafo`. Branch: `codex/chat-sidebar-20261019`.
Baseline: `f1317989536c24576fd7d604c2086e4992f38e58` (delivered j9p5).

## Outcome and design

The primary sidebar's AI assistant row expands the person's chat list. A plus
at the right opens `/agents/new`; selecting a chat uses the existing native
route and closes the mobile drawer. The persistent history block above messages
is removed. The compact toolbar remains, including new chat, management dialog,
rename and guarded delete. Tablet/icon-rail access keeps the assistant link and
the toolbar's chat dialog. Long lists scroll inside the rail and retain native
pagination; they do not consume conversation height.

`AgentThreadList` is shared by sidebar and dialog. Existing SWR, native Mastra
threads/history, ownership checks and composer/session logic are reused. There
is no new transcript store, model policy, provider call or dependency. Selection
and drafts continue through the existing `AgentScreen` route handling.

Mastra's current official UI integration documents
[assistant-ui](https://mastra.ai/integrations/agentic-ui/assistant-ui), whose
[thread list](https://www.assistant-ui.com/elements/thread-list) is a ready UI
option. [UI Dojo](https://ui-dojo.mastra.ai/) shows supported UI integrations;
[Studio](https://mastra.ai/docs/studio/overview) is an agent development and
management application. These are distinct from the existing product shell.
Adding another runtime/UI dependency to move this already functioning list
would introduce unnecessary integration work; this change reuses product
primitives and Mastra's native storage.

## Verification boundary

Local implementation and synthetic browser acceptance passed. The owner's
latest instruction explicitly holds publication and deployment: continue local
testing only. This supersedes earlier release authority. Production remains
`dd89af1b4a29`; no source push, image publication or host switch occurred.
The already-started local build/suite verification is retained as local
evidence only; its results do not change the delivery boundary.

- `pnpm exec jest --runInBand --coverage=false` with the eleven targets in
  `focused-tests.log`: **11 suites / 142 tests PASS**, zero skips.
- `pnpm exec tsc --project apps/frontend/tsconfig.json --noEmit --incremental false`:
  **PASS**.
- Browser check: `browser-check.js`, actual production UI components with
  synthetic requests and CSP blocking HTTP: **23/23 PASS**, including 105-thread
  pagination, per-chat draft restoration, desktop/tablet/mobile, both themes,
  compact rail, mobile selection/plus/Escape and loading/error/retry/empty/long
  states. At1440×900, expanding/collapsing history leaves the conversation
  scroller at612.16px in both cases. Zero model calls and zero message POST.
  Exact result: `browser-result.json`; screenshots retained alongside.
- `python3 scripts/docs/check_docs.py`: **PASS**, 202 documents.
- `scripts/orchestration/run_process_verification.sh`: **PASS**.
- `git diff --check`: **PASS**.

docs-reviewed: updated — shared component inventory, native-navigation product
contract and working handoff/index reflect the moved list.

graph-reviewed: used — read-only owner graph at
`/home/me/code/content-factory-next/graphify-out/graph.json`, built from
`dd67538d`; focused `graph_context.py --symbol TopMenu --limit 6` returned no
match, so exact current sidebar/menu/assistant sources were verified directly.
The owner graph is older than the current source; no refresh or external model.

## Preserved work

Reused the existing isolated implementation worktree, with a separate branch.
Untracked j9p5 evidence remains untouched. The original checkout's width branch
and unrelated dirty handoff/index are preserved. No new subagent was created.
Temporary owned preflight helpers were hash-verified and removed; application
runtime and foreign host resources were preserved.

## Full local verification after the owner hold

All four application builds and three TypeScript checks passed. The full suite
ran all three halves: Jest699passed suites/12626passed tests (7suites/70tests
skipped), Node126passed/4skipped/0failed, then Python49passed/1failed. The
Python process-check failure was the current handoff exceeding200lines; the
first documentation correction also exposed the project index at152/150lines.
Older handoff content was archived without loss and the index was rewrapped;
no guard or application source changed. The complete Python half then passed
50/50, followed by branding, docs, process and diff checks.

Exact logs and receipts: `release/acceptance.json`, `release/check-5.log`,
`release/python-suite-corrected.log`, `release/post-correction-local-checks.json`.
The original combined release command remains recorded as failed and produced
no suite receipt. No fresh combined release receipt is claimed. The application
inputs match the earlier local build/Jest/Node/browser evidence exactly.
Image build/publication, public CI for a new push and post-switch production
checks were not performed; publication and deployment are explicitly deferred.
