# Task 6 local domain/native fixture

Owner: research_recovery. Delivery accepted separately from root final browser acceptance.

## Runtime

New files:

- `tests/helpers/agent-chat-domain-runtime.cjs`: real Nest `ApiModule`, authentication middleware, policy guards, `AgentController`, `AgentThreadsService`, `MastraService`, native durable agent, real `IntakeService`, `PieceService`, `AgentGraphService`, Prisma repositories, domain question/application/adaptation handling. Real loopback PostgreSQL product database and separate Mastra database; real Redis. No fake domain store, controller or native runtime.
- `scripts/development/agent-chat-local-fixture.cjs`: prepare owned synthetic databases/data and serve the actual local backend on 3496. No schedule modules or Temporal worker registration. Command-mode Temporal client points at unreachable loopback port 1.

Only external inference/search boundaries are frozen: `ai.clients.getChatModel` structured outputs, Mastra SDK `MockLanguageModelV3` provider streams, `WebResearchService.research` external-research result. The real adaptation generator runs, including source-context construction, citation validation, coverage review and actual draft persistence. The frozen structured model returns actual supplied citation IDs. Direct external `fetch` and HTTP(S) are refused. Synthetic example sources are retained without a network fetch. No real provider key, source organization, social token or production data was copied.

Owned prepared stand: `/tmp/cf-chat-5961-uVDCMK/stand.json` (private 0600, directory 0700). Private frontend variables `/tmp/cf-chat-5961-uVDCMK/frontend.env` include a synthetic session token for the existing local auto-login path, loopback frontend 4296/backend 3496 and isolated storage. Browser storage state is alongside it. Do not commit or print tokens.

Commands (repository Node 22.23.2 / pnpm 10.6.1):

```bash
node scripts/development/agent-chat-local-fixture.cjs prepare
node scripts/development/agent-chat-local-fixture.cjs serve /tmp/cf-chat-5961-uVDCMK/stand.json
```

The preparation uses `prisma db push --skip-generate` only on the newly created owned synthetic product database; Mastra uses `PostgresStore.init()` on its separate owned database before background recovery starts. It never targets the deployed/shared product schema.

Prepared databases: `cf_chat_5961_20261024_f091aa8f` and `_mastra`; Redis loopback 6380 database 15 with synthetic actor/native namespaces. No Redis flush or broad cleanup. An initial seed typo (`planningMode` instead of actual `planMode`) left an incomplete owned pair `cf_chat_5961_20261024_9c84f557` / `_mastra`; these are retained for explicit safe cleanup, no existing data was removed.

## Deterministic scenario

Fixed original request in exported `REQUEST` and private `stand.request`: confirmed updates 9–23 October 2026, old post only a reference, saved piece plus Telegram draft, questions in chat and automatic continuation. Two synthetic official-shaped sources support Alpha on 9 October and Beta on 23 October. Daily release claims remain explicitly unconfirmed.

The frozen conductor obtains the actual user-authored request from the native prompt before calling `piece.create`; it does not relax original-author validation. It performs research, creation, domain questions, saved core read, adaptation, saved adaptation read and completion. All tool outputs/state are actual product results. Questions use actual original producer normalization (maximum 3 options / 200 characters / question 400); production limits are unchanged.

Separate long canonical source scenario: authorized local-only `GET /__fixture/seed-question-case?pieceId=<owned saved core>` uses actual `PieceRepository.createCore` to seed a distinct synthetic saved question source with 7 exact long labels, >400 character wording, single/multiple selection and 4 questions for choice/custom/multi/delegation. This is explicitly synthetic stored source data, not a claim that the current model producer emits 7 choices. It clones an actually generated core and keeps the original producer unchanged. The endpoint requires the fixture actor's real auth and organization headers.

Seeded canonical piece: `4d4e3a9d-9b03-4698-b0bc-5043bbeb793a`. Private `canonical-case.json` contains its exact separate conversation request. The `canonical-question-case` scenario invokes actual `piece.answer`, persists all answers with the existing domain service and reads the saved core; its final text reports only that result.

## Proof performed

- Backend boot and actual authenticated HTTP chat returned 200 and suspended on the authoritative native piece questions.
- Main HTTP smoke thread `a5aa7695-7cac-4760-a322-d146f239ab22`, native run `4bcf4426-ec49-411a-8c3b-8c516f222d42`: research → real persisted piece → partial custom answer → next question → delegated editorial choice → real adaptation questions. Same source and run survived stopping/recreating only this fixture's own backend process.
- After cold resume, real AgentGraph citation validation initially caught an incomplete frozen provider response, with no adaptation saved. Fixture external response corrected to echo only actual context citation IDs and valid coverage verdict; actual generator and guards stayed active. The same retained native run then saved one actual Telegram draft and read saved core/adaptation before terminal `stop`.
- Saved core: 257 characters, open questions 0, custom thesis recorded `origin:person`; delegated position `origin:model` with empty author text (no invented personal fact). Both selected research facts remain verified with original source URLs and date provenance. Saved adaptation read: 290 characters, fixed date window, exact supported topics, explicit unsupported daily-release gap, links. Readback persisted privately in `domain-readback.json`.
- Source syntax: both new CJS files pass `node --check`; `git diff --check` passed.
- Root browser main thread `d8f020d2-fb2d-4aca-ae3d-82ea93f6d4b5` was parked after its first custom answer and reload. Root requested a further restart of this fixture's own backend to load the controller answer-claim fix and exercise browser cold recovery; same databases/source retained. Root owns its browser completion/result-panel proof.

## Limits

No paid provider/search calls, production mutation, live social connection/publication, credential wiring, push or deployment. Frozen editorial text proves engineering flow only. Root owns final union of focused checks, browser accessibility/responsive scenarios, duplicate/reconnect claims and acceptance; this fixture report is not their replacement. No whole repository suite/build was run. No shared work staged or committed; no DB/service belonging to another task stopped or removed.

Root integration acceptance (24 October): fixture delivered and accepted for
combined acceptance. Root verified fresh-browser automatic sign-in, real native
manual-question card, exact authored request enforcement, custom draft reload,
first accepted answer and question2 after backend restart. Final browser/DB
checks remain in the root acceptance record. Fixture/shared worktree and owned
databases are retained for the requested local preview; no safe cleanup applies
until the owner is finished testing. No production/provider credentials used.

### Prompt-projection compatibility correction

Root's memory fix removes duplicated internal `providerOptions.mastra` metadata from outgoing prompts. The original frozen-provider fixture incorrectly inferred previous progress from nested `.capability` metadata; after the product correctly removed it, the fixture repeated research instead of continuing. The native finite-progress guard stopped the repeated equivalent results. This was a fixture defect; saved pieces and historical evidence were preserved.

`collectNativeToolResults(prompt)` now consumes only actual AI SDK `role:tool`, `type:tool-result`, `toolName`, `output:{type:json,value}` parts and maps the six fixture tool names to their known product capabilities. It neither requires nor walks internal provider metadata. A deterministic direct assertion proved all four research/create/read/adapt states without any internal metadata and ignored an assistant metadata duplicate. Syntax/diff checks pass. Root owns backend restart and a fresh browser run with the combined current source; prior pre-projection flow proof is not substituted for that acceptance.


## Root integration acceptance — final functional source

Completion event accepted by root at source `36c4ae749` (implementation
`d93fa1bce`). The latest affected set has 32 suites / 700 passing tests, zero
skips; the final pinned SDK compatibility subset passed 13 suites / 37 tests.
The real browser and saved-data proof at `browser-proof.json` includes exact
questions, human/custom and delegated answers, reload, a real owned backend
restart, lost accepted HTTP 200, automatic next-call recovery and one saved
Telegram draft shown on the right. Canonical seven-option/multiple/confirmation,
RU/EN, keyboard, 390/1440 and stale/Stop cases are separately recorded there.

This accepts this child stream's delivered implementation and local functional
integration. The epic still requires the separate strict resource gate and
canonical task closeout; see `memory.md` and `acceptance.md`. Safe-only cleanup:
retain the owned worktree, private fixture data and preview for owner review;
no foreign runtime, source, data or private incident evidence was removed.
