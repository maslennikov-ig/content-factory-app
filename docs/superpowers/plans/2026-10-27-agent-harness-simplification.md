# Research continuation simplification

Goal: complete the owner news-writing flow through fewer adapters, without losing source evidence, task context or truthful task outcomes.
Task: content-factory-next-v8ie. Baseline: 3cf8919f6. Diagnosis: .codex/stages/honey-6013/live-research-audit-2026-10-27.md.

## Decision and boundaries

Keep Mastra Agent tool correction, structured output, Memory and native question suspend/resume. Do not add prompt-driven routers, retry loops, semantic word blacklists, mandatory interviews or automatic paid quality passes. Existing draft reviews remain advisory. One create-from-research adapter delegates to piece.create; research storage normalization belongs inside IntakeService. Native intake and standalone captures are evidence origins, not different model-facing writing protocols. Preserve original plans, author answers, owned source revisions and atomic writer claims. Existing chats and drafts are never rewritten.

## Cohesive implementation

- Normalize native and standalone owned evidence at one service boundary. Mixed selections and exact passages reach the existing writer, with original task/answers and labelled supplemental context intact. Keep access, expiry, human-choice and uncertain-write boundaries. Simplify duplicate capability routing.
- Translate server-proven preflight refusals once in the existing tool adapter. Let the native Mastra loop correct arguments; real failures and uncertain side effects must remain protected. No new outcome state machine.
- Flatten the active brief prompt to its actual request/data contract; reuse the existing schema and native structured generation. Missing irrelevant author fields stay nullable. Do not certify model semantics from offline scripted responses.
- Correct misleading source-selection copy in existing locales. No component redesign or new UI primitives.
- Root owns research/intake/prompt/copy/docs. Child preflight_recovery owns mastra.adapter.ts and native accounting regression tests (write isolation and parallel latency). Received its bounded patch and proof (3 suites/63 tests); accepted for integration, root acceptance pending. Child created no services/retained test schema and made no commit.

## Acceptance

Use sanitized frozen research with the real domain/tool boundaries and free controlled model transports. Check mixed captures, source revisions/ownership, full evidence and context at writer, private author questions and zero-question case, idempotent repeat, uncertain write and cross-instance claims, preflight correction followed by completed, fatal/Stop/receipt failure. Reuse unchanged passing checks; run affected Jest suites, backend/frontend types as applicable, docs links and diff check once after integration. No full release suite for this local change.

The existing local stand remains on localhost:4337 with configured real models. Update only owned app processes if no active work; retain all chat/task/storage and foreign services. Never trigger model/search/recovery work merely to smoke test. If pending work would auto-resume paid execution, leave the process unchanged and report that limit. No push, deploy, paid calls or production writes.

## Completion

Record exact passing checks, remaining real-provider qualification, process/data preservation and local URL in the stage artifact and handoff. Close the bug only after its affected criteria pass. Delivery remains local.

## Accepted outcome

App source 872e21cd4. Root acceptance: 16 suites/280 tests, both application type checks, three frozen actual owner inputs, no paid calls. Child adapter delivery and two bounded review findings accepted; regression coverage is in root acceptance. All 22 chats and the pending native question survive the owned backend update; original dirty work and foreign services unchanged. Details: .codex/stages/honey-6013/harness-simplification-2026-10-27.md. Real-provider/editorial qualification remains eqh5; deployment/source-fetch capability is unchanged.
