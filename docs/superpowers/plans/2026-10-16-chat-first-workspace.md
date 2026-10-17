# Chat-first workspace implementation plan

**State:** owner-authorized implementation on16 October2026; local integration verification in progress. Beads remains the status source. No production release is claimed.
**Epic:** `content-factory-next-jvrq`; T1–T8 correspond to `content-factory-next-jvrq.1`–`.8` in order.
**Goal:** make the existing AI assistant the primary way to create and refine content while manual sections use the same actions, editors, saved objects and visual language.
**Spec:** [chat-first workspace](../../product/chat-first-workspace-spec.md). Read it before executing a package.
**Approach:** reuse the existing Mastra conductor, capabilities and embedded editors; establish one typed object-context boundary, then adopt it in both entry points. Keep dated-change research in the common intake/research pipeline.
**Non-goals:** another assistant backend, Mastra upgrade, replacement CRUD forms/calendar, new publishing automation, historical thread migration, altered external/MCP acceptance, billing or role redesign.

Beads owns the actual task IDs, status, dependencies and completion evidence. The sections below define stable work packages and their acceptance ownership, not a second status ledger. Runtime delivery and external/owner acceptance stay separate.

## Scope mapping

| Spec criteria | Owning package |
| --- | --- |
| A2; existing implementation and reproducible gaps | T1 |
| A1, A6; primary navigation, split/collapse and mobile shell | T2 |
| A4–A5; private continuity, context validation and one piece consumer | T3 |
| A3–A4, A6, A9; same artifact/editor state in both entrances | T4 |
| A3–A4, A9; contextual manual chat and shared interview/selection controls | T5 |
| A7; dated-change retrieval and empty result semantics | T6 |
| A8; observable run lifecycle and honest recovery | T7 |
| A3, A10 and final cross-package A1–A9 evidence | T8 |

## T1 — Establish the existing AI assistant baseline

**Boundary:** diagnostic of current behavior, before changing its entry points. Explicitly requested by the owner who has not tested the AI assistant workflow. This independent uncertainty boundary is why it is a separate package.
**Files:** `apps/frontend/src/components/agents/`; `tests/agent-scenarios.test.cjs`; `tests/helpers/agent-scenarios.cjs`; `tests/helpers/agent-scenarios.runner.cjs`; selected `tests/agent-screen.*`, `agent-threads*` and existing stage evidence.
**Outcome:** a compact capability/parity matrix and reproducible gaps for existing conversation, artifacts, manual changes, reload and permissions. Reuse matching current-source historical evidence with its limits. Browser/recorded source checks are clearly distinguished from real model/owner behavior. Missing live evidence is explicitly unknown, not a failed or passing model result.
**Verification:** selected existing model-free scenario/browser checks once; any current model/provider replay requires its own authority and is reserved for T8 if unavailable. Do not change the historical suite's acceptance thresholds or open a new fix wave outside the epic.
**Dependencies:** none.

## T2 — Make the conversation the primary workspace

**Boundary:** navigation and responsive page shell; no domain writes.
**Files:** `apps/frontend/src/components/layout/top.menu.tsx`; verified post-auth/default-entry routing; `agents/agent.screen.tsx`, `agent.panel.tsx`, `agent.threads.tsx`, `agent.copy.ts`; existing layers/choice/focus primitives; `libraries/react-shared-libraries/src/translation/locales/*/translation.json`; `tests/assistant.i18n.test.cjs`.
**Outcome:** first «Работа с ИИ / ИИ-помощник» block, retained manual sections/deep links, useful empty conversation, configurable split, hide/restore/expand controls, compact Chat/Material switch and explicit workspace browser. Preserve validated return destinations and role restrictions. Panel preferences are user/workspace scoped and must not overwrite saved editor drafts.
**Localization:** use the owner-selected visible title «ИИ-помощник» / “AI assistant” and localize the shared `assistant_*` workspace chrome across all 16 shipped languages, including RTL `he` and `ar`.
**Verification:** navigation/return-destination regression plus deterministic browser states at the four spec widths, both themes and keyboard; focused translation coverage for all 16 shipped locales, including RTL. Update component inventory for any new shared splitter/host chrome. No model call is needed to accept layout behavior.
**Dependencies:** T1.

## T3 — Bind private conversations to validated work context

**Boundary:** server identity, memory/persistence and the immediate piece-screen consumer. Context/persistence can roll back without rewriting saved product records.
**Files:** `libraries/nestjs-libraries/src/chat/conductor/{agent-chat.request,conductor.context,agent-threads.service,conductor.instructions}.ts`; `chat/capabilities/{agent-parts.contract,capability.context}.ts`; relevant catalogue readers; `apps/backend/src/api/routes/agent.controller.ts`; `apps/frontend/src/app/(app)/(site)/layout.tsx`; `agents/{agent.contract,agent.transport,agent.handoff,agent.screen}.tsx` or their existing `.ts` counterparts; the piece consumer.
**Interfaces:** versioned typed target/reference, explicit user/org/thread identity, bounded server-reconstructed current content, revision, persistent artifact references and last target. Confirm exact existing storage APIs before choosing metadata versus a minimal product-owned association. Mirror shared contract changes through the repository's existing contract mechanism; do not create a parallel API.
**Outcome:** a manually created piece can be discussed with correct current text/task/evidence; the target is visible and removable; reload and back/forward restore it. Old/forged/missing/foreign targets, hidden history and late cross-session events are handled without disclosure or mutation. No secret/raw prompt in URLs; opening never sends a message.
**Verification:** two users/two organizations, same shared entity with private threads, long context, stale revision, deleted target, reload and thread/workspace switch. First complete vertical slice is piece → open its chat → ask about its current text → retain the same piece; real-model usefulness remains T8's separate gate.
**Dependencies:** T1.

## T4 — Share the artifact/editor host and live data

**Boundary:** reuse adapters and state synchronization across existing object screens; no duplicate editors or database models.
**Files:** `agents/agent.panel.tsx`, `agent.cards.tsx`, `agent.piece-data.ts`, `agent.revalidate.ts`, `agent.contract.ts`; `content-intelligence/pieces/piece.container.tsx`; `brand-voice/voice-avatar.screen.tsx`; `channels/channel-screen.tsx`; existing ideas/facts/media and listing adapters.
**Interfaces:** shared host with page/panel modes and suppressible contextual-chat chrome; stable artifact identity and data keys, explicit selection, dirty/removed states. Plan/adaptation records resolve the exact existing piece/variant/time.
**Outcome:** the same avatar/channel/piece/variant is editable in the panel and the section. Tool completion and manual saves revalidate the same scoped SWR keys. Distinct objects appear in the conversation's artifact picker; repeated updates do not duplicate them. Manual edits do not get replaced by automatic focus or stale snapshots. Workspace browsing shows actual bounded records and statuses.
**Verification:** each supported artifact's page/panel save/read equivalence, stale proposal, unsaved work, removed item and zero-call object browsing. Current role and admission checks stay authoritative. Register any extracted shared host in the inventory.
**Dependencies:** T2, T3.

## T5 — Bring the same conversation into manual work

**Boundary:** adoption in manual workflows and common interview/selection UI, using T3/T4's facade.
**Files:** `agents/{agent.conversation,agent.composer,agent.interview-card,agent.selection-card,agent.handoff}.tsx` or existing `.ts` counterparts; `content-intelligence/pieces/{piece.container,piece-core-tab,core-edit}.tsx`; existing intake/question controls; `brand-voice/voice-avatar.screen.tsx`; `channels/channel-screen.tsx`; shared headers of content/avatar/channel lists and `launches/launches.component.tsx`; existing ideas/facts/media hosts; relevant copy files and shared component inventory.
**Outcome:** manual creation/editing exposes «Обсудить с ИИ» with the exact current object; lists, calendar, ideas/facts/media use the actual validated section/filter context. Existing personal linked conversation resumes without auto-send; site-level session continuity survives manual navigation, and embedded routes do not recursively mount assistants. Questions, selection, approvals, drafts and validation use the same components. Remove early «Дописать материал» duplication; keep clear secondary raw-material input and direct manual edit/version restore after a text exists. An edit instruction cannot become an asserted source fact.
**Verification:** manual → chat → accepted edit → manual equality for a piece; corresponding avatar/channel adoption; unsent draft, reload, back/forward and AI-unavailable manual operation. In-scope UI states and localization are part of this package, not a later polish backlog.
**Dependencies:** T3, T4.

## T6 — Retrieve new events within the requested period

**Boundary:** common intake/research intent and provider-supported constraints; separate retrieval rollback/test boundary from the page shell.
**Files:** `content-intelligence/intake/{intake.service,research-digest}.ts`, current prompt contracts and successors as needed; `pieces/{piece.service,piece-research.contract,core-write}.ts`; `openai/{web.research.service,ai.clients}.ts`; relevant existing reader/source date helpers; callers' DTO/contracts and period presentation.
**Interfaces:** versioned research intent with anchored clock/timezone, new-task versus old-example separation, coverage boundary and event interval. Preserve provider-specific options in provider implementations, existing quota/search fallback and explicit-selection rules. Existing source-admission logic must distinguish source-publication, retrieval and event-effective dates.
**Outcome:** the owner-reported old-overview case resolves to later events through the actual current instant. Old news is excluded from new findings; rolling sources and retrospective pages can support dated events. Historical requests remain historical; ambiguous boundaries ask one question; empty/unknown results are honest and retain the draft. Both UI entrances use the same logic.
**Verification:** frozen 16 October regression with selected old/new/no-date/rolling sources, timezone boundary, explicit historical interval and no matching results. Pin time; inspect behavior, not merely the presence of a date in a prompt. Do not use paid searches for ordinary regression. A bounded actual search belongs to T8 only with current authority.
**Dependencies:** T1.

## T7 — Make ongoing work and interrupted results recoverable

**Boundary:** existing chat transport, run claim/cancellation lifecycle and operation UI. Do not introduce a second stream protocol or rewrite Temporal contracts.
**Files:** `agents/{agent.conversation,agent.transport,agent.cards,agent.copy}.*`; `chat/conductor/{agent-chat.request,agent-run-claims,conductor.steps,agent-threads.service}.ts`; existing NDJSON/AI SDK bridge and usage integration only where affected.
**Outcome:** show real active work, personal question/acceptance waiting and saved results; Stop/Retry explain their real effect. Recover an interrupted/uncertain write before any resend, preserve late saved results and old text, isolate session switches, keep explicit approvals. Zero-cost UI reads and one conductor admission plus actual action accounting remain.
**Verification:** existing recorded streams and deterministic tool interruption at before-call, in-flight, after-save and reconnect boundaries; stale acceptance, permission loss, quota refusal and AI unavailable. Real provider cancellation semantics stay unproven unless separately observed and recorded.
**Dependencies:** T2, T3, T4.

## T8 — Accept the complete workflow and deliver under explicit authority

**Boundary:** one root-owned integration/release acceptance, then separately authorized owner/provider/production gates. This is the external delivery boundary, not another implementation-only test package.
**Files:** existing agent scenario fixtures/runners, targeted browser fixtures/evidence under `.codex/stages/`, relevant docs and standard release scripts; app fixes return to their owning package.
**Outcome:** every A1–A10 criterion has matching evidence. A fresh owned scenario goes through avatar, channel writing settings, piece, personal answers, adaptation and reserve; a manually created object makes the return trip with identical records and versions. The original news-period example, old conversations, roles, approvals and unavailable AI are covered. No real social connection or publication is needed for a reserve-only acceptance.
**Verification:** scoped checks during implementation; here run `pnpm run build`, all three halves of `pnpm test`, `git diff --check`, and `scripts/orchestration/run_process_verification.sh`. Use the standard exact-HEAD suite receipt if publishing an image. Confirm graph/docs relevance at integration; refresh only at an accepted relevant boundary. Record live model, user acceptance, source delivery and runtime deployment as separate evidence. Actual live/paid checks, source push and deployment need their explicit current delivery step; absent authority leaves that gate open without replacing it with fixtures or HTTP success.
**Dependencies:** T5, T6, T7.

## Execution order and preservation

Start T1; then T2, T3 and T6 can run independently where ownership allows. T4 adopts the shell/context; T5 and T7 consume that accepted facade; T8 integrates the complete flow. Each package includes its own meaningful focused regression, state coverage, documentation and component-inventory changes. Do not split those into ceremony-only tasks or rerun broad suites at every local step.

Preserve all earlier kcxz/0qgn/2q28/m0iy criteria, owner decisions and external defers. Related historical epics are references, not blockers for this scoped product improvement and not automatically closed by it. Do not copy the owner's screenshot, account details or private generation history into Git. The prototype uses synthetic copy and does not prove AI capability.

## Authorized #1094 repair and successful original-overview acceptance

Owner explicitly requests the fix, production delivery and paid original9–16October replay, carried through to a working saved overview. This continues T6/T8 and task `content-factory-next-jvrq.9`; no acceptance waiver or parallel tracker.

1. Reproduce retained-source admission with one bounded native paid reader diagnostic, using existing role routing/admission/account and no content writes. Capture precise rejection reasons locally; preserve private material outside Git. This is diagnostic evidence, not the required UI acceptance.
2. Correct temporal search: bounded rolling/release-note companion independent of locale pair and page-publication restrictions; fair relevant contiguous event material within the existing quotas. Preserve ordinary research, source/SSRF guards and strict event provenance.
3. Correct common dated digest/admission only from demonstrated failures. Keep bounded stage/rejection counts without raw source/account data. Empty/clarification chat outcomes must state period/gaps without offering old facts as new findings.
4. Freeze the integrated source, run one root-owned configured release acceptance and exact suite receipt; publish the prepared public tree/image and deploy through digest/capacity/schema/health/source/Mastra/rollback safeguards.
5. Actual original-context chat search for9–16October: inspect official supported dated new facts, explicitly select, finish rewrite, verify saved body and prior body in revisions plus exact manual editor equality. No social publication/adaptations/images. Reconcile terminal usage before any retry; retain original on uncertainty. A completed search alone cannot close this task.

Root owns intake/digest/provenance/integration/release/paid browser and final acceptance. Isolated `research_material_budget` owns web research material/query helpers and tests; `research_empty_outcome` owns the existing capability/selection outcome and focused tests. Child changes are accepted centrally before source freeze; no child model/provider/host delivery or broad-suite duplication.

The first corrected live search found two dated official events, then actual save inspection exposed missing revision append in `acceptCoreResearch`. The same #1094 acceptance requires the existing `withRevision`/CAS path; root reproduced it, corrected it, recovered the exact original through the manual UI while preserving the intermediate, and repeats exact-source release plus paid original-period control. A successful search or changed body alone does not close this gate.


## One-request period refresh and exact proposal preview (jvrq.10)

Owner requires a single natural request to update the overview without repeating dates or sending a separate editorial rewrite. Existing fact/proposal selection remains the person's UI choice.

1. Reproduce negated prior-period ambiguity and stale saved-result prose from retained real-UI evidence; fix bounded grammar and explicit final tool outcome.
2. Route temporal research acceptance through a versioned standalone-period writer mode in the same native draft call, retaining personal stance/actual observations, only selected dated confirmed new events and official links. Keep ordinary enrichment unchanged, original revision and CAS atomic, no hidden extra paid step.
3. Show full exact before/after and reasons through one shared manual/chat preview component; optional safe view fields only, private tokens/snapshots server-side. Localize all16 languages; check keyboard, wrapping, themes.
4. One root exact-source release acceptance, public archive/image/CI and canonical production rollout with rollback/Mastra/foreign-service safeguards.
5. Paid original9–16Oct UI control starts from the preserved earlier original via normal reversible UI history, after fresh identity/body CAS check. Send one ordinary request mentioning desired and excluded prior dates, no known-answer event/URL injection, accept normal cards only. Require coherent saved new overview without date clarification or separate rewrite message, original in history and shared/fresh-manual equality; all usage terminal and no publication. Preserve current successful850char version in history.
6. Close only .10 after canonical acceptance. Broader original epic/.8 avatar/channel/owner gates stay open.


## Automatic title with the refreshed overview (jvrq.11, owner17Oct)

The title must follow the newly accepted period overview without a second command or a manual title edit. Use a versioned V18 extension of the native event writer; the same draft response returns a single-line title (1–120 characters) and body in the existing content language. Ordinary V16 schema/prompts and released V17 remain intact. Existing title/body/brief CAS saves the pair and prior body revision atomically.

1. Reproduce body-only success and add focused RU/EN paired-output, invalid/missing title, repair-pair and concurrent-title regressions. Preserve empty/declined research, original body/history, ordinary enrichment and accounting.
2. Return and validate title with the selected body in the same model operation. Invalid first title or provider refusal keeps both stored fields/history unchanged; invalid repair keeps the entire valid first pair. No extra title model call or schema migration.
3. Freeze a clean exact source and run the root release acceptance once; overlap independent public-tree CI where possible, gate image push on exact suite receipt and production switch on accepted CI/image/schema/capacity/rollback proofs.
4. Native paid original9–16Oct chat replay: privately back up current state; restore the preserved original body and seed its old title through normal UI before the request, retaining the current body in history. Send one ordinary refresh request, accept normal dated fact card, require automatic new title plus coherent body, exact prior history, shared/fresh manual title/body parity and terminal usage. No title edit after the request, no social publication/adaptation/quota/account changes.
5. Record actual production and canonical task acknowledgement; close only .11. Broader epic/.8 owner gates remain open.

Technical premortem: GO WITH CONDITIONS. Blast radius is temporal research acceptance → native core writer → single existing repository CAS → shared/manual artifact. Confirmed previous failure was saved.title reuse; paired V18 output fixes that in one call. Plausible mixed repaired-title/body, partial update on invalid title and overwriting a concurrent human title are blocked by pair-selection tests, strict title validation and unchanged atomic CAS. Empty/declined research must bypass generation. Executor error (wrong source/interval, manual post-fix title, premature suite claim) is checked by SHA-bound receipt, historical9–16Oct request, raw UI timeline and all three test summaries. No schema/auth/Temporal migration. Recovery: retain current production as rollback, canonical image switch back on runtime failure; failed writer/CAS writes neither generated field, original body remains in native history after successful acceptance.


The17October title release exposed a full-suite CI budget blocker: two fresh hosted attempts reached the30-minute job limit; the first had passed all677Jest suites but never completed Node/Python. Increase only that job budget to45 minutes, retain the whole pnpm test command/pipefail/three-halves guard and every required check. Freeze and test the new source normally, publish its matching archive/image; old98d/3166 and interrupted jobs stay historical and cannot authorize the new source. No product/schema/model-route change or acceptance waiver.
