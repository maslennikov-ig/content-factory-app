# Chat-first Content Factory workspace

**Document state:** accepted target, implemented locally on16 October2026; final integration verification in progress. Deployment, paid provider quality and owner acceptance are separate gates.
**Epic:** `content-factory-next-jvrq` (eight execution packages, `.1`–`.8`).
**Task truth:** Beads owns execution status and dependencies; see the implementation plan linked below.
**Owner direction:** chat is the primary creation workflow; section pages remain a complete manual workflow. Both use the existing Mastra agent, product services, components and saved objects.
**Design reference:** [interactive layout study](../design/chat-first-workspace/prototype.html).
**Implementation:** [bounded plan](../superpowers/plans/2026-10-16-chat-first-workspace.md).

## 1. Problem and current evidence

The owner has not yet personally tested the current AI assistant workflow. Historical engineering acceptance is not owner acceptance of this new workflow. The 16 October screenshot shows a narrow conversation and a dominant, unclosable empty panel titled «Что есть в пространстве», with five onboarding steps marked complete before a conversation starts.

Current source confirms:

- `apps/frontend/src/components/layout/top.menu.tsx` places `/agents` in `secondaryMenu` under «Ещё».
- `agents/agent.screen.tsx` gives the conversation a fixed 520 px desktop width. Its active artifact is local React state; without an artifact it mounts `WorkspaceSteps` in the wide panel.
- `agents/agent.panel.tsx` implements that overview using onboarding completion signals. It is a setup checklist, not a browser of the workspace's actual objects. The panel already embeds real `PieceContainer`, `VoiceAvatarScreen`, `ChannelScreen`, ideas, facts and media views.
- `agents/agent.handoff.ts` passes a post-editor request through same-origin `sessionStorage`, never automatically sends it, and removes it after reading. This is a useful existing boundary, not a replacement for durable object context.
- `chat/capabilities/catalogue/core.capabilities.ts` already implements `piece.rewrite`, `piece.research`, `piece.material.add`, `piece.core.rebuild`, review acceptance and core versions. `piece.open` exposes metadata and questions to the conductor while the text stays on the visual card. A visible editor is not sufficient model context.
- `pieces/piece-core-tab.tsx` shows `AddMaterial` whenever a core object exists, even while the core text is empty. Appending material and rebuilding the text are separate actions.
- A read-only investigation of an owner-provided piece on 16 October found that a request for news after a 6–8 October example reused sources published on 6–7 October. The existing intake sends the full input to research with language/level but no enforced requested interval. Relevant deployed source hashes matched the checkout. Private source text, original screenshot, account identifiers and database payloads are not copied into this design.

The local Graphify map is useful orientation but its baseline is `5cdd9002`, older than `ade39a851`. Relevant source locations were confirmed directly. Planning does not refresh the graph.

## 2. Scope and invariants

**Owner-selected name:** «ИИ-помощник» in Russian and “AI assistant” in English. Use the natural localized equivalent as the visible product title in all 16 shipped interface languages: `en`, `he`, `ru`, `zh`, `fr`, `es`, `pt`, `de`, `it`, `ja`, `ko`, `ar`, `tr`, `vi`, `bn`, and `ka_ge`. The set includes both right-to-left locales, Hebrew (`he`) and Arabic (`ar`). Shared chat/workspace chrome uses stable `assistant_*` translation keys. Internal routes, identifiers and historical records retain their existing names.

One product object has one service implementation, one editor implementation and the same permissions regardless of entry point. The conversation orchestrates the existing services. Mastra remains the existing runtime, memory and tool layer; this epic does not replace it, upgrade its packages or introduce another assistant backend.

In scope: personal conversations; avatars; channels and their writing settings; intake; pieces; adaptations; research; reviews; versions; plan reservations; existing ideas, facts and media entry points. Existing supported capabilities remain reachable. Plan results may open the existing piece/variant editor and a link to the exact calendar item; a second calendar editor is unnecessary.

Billing, membership/roles, credential entry, social connection, publishing and provider actions retain their existing dedicated surfaces and authority boundaries. Existing web-only approval/secret cards stay out of model text and ordinary chat input. No new automated publishing, new multi-agent network, public MCP expansion, or historical-data migration is implied.

Saved product records remain authoritative. Personal chat history is never made workspace-wide just because its objects belong to the workspace. Existing conversations, original material, versions, pending approvals and unrelated Beads criteria remain intact. This successor changes the future UI direction of the [original agent specification](agent-harness-spec.md); it does not rewrite its accepted history or close its external acceptance gates.

## 3. Navigation and first entry

- Put «ИИ-помощник» in a separate first block, «Работа с ИИ», at the top of the sidebar. Preserve its route `/agents` and old conversation deep links.
- Put «С чего начать», «Аватары», «Каналы», «Контент», «Календарь», «Аналитика» below, in «Разделы». Setup help stays accessible but is no longer the obligatory main workflow.
- Default fresh approved product entry without an explicit destination opens the AI assistant. Preserve validated return destinations, pending approval/auth states and deliberate section navigation; do not redirect a person away from a manual page.
- Existing entitlement, role, superadmin, localization and hidden-menu rules still apply. Moving navigation must not reveal hidden/admin features.
- A new conversation is an unsent composer until the person sends a message. Opening, resizing or switching the page costs no model operation.

## 4. Conversation and artifact layout

### Desktop

Without an active artifact, the conversation fills the work area, with readable content centered at approximately 720–800 px. Show a short invitation and two or three useful starter actions; no permanent checklist or decorative empty panel.

With an artifact, use a flexible split. At 1440 px including a roughly 220 px sidebar, target a 480–600 px conversation and the remaining usable width for the editor. Neither surface keeps a hard 520 px width at every desktop size. A keyboard-operable divider adjusts the ratio within tested minimum widths. When both surfaces cannot fit, switch to the compact layout instead of crushing either editor.

The right header names the current object and its actual state, with «Артефакты», «Открыть в разделе», «Развернуть», and «Скрыть». Hiding returns the space to the conversation. «Артефакты» or the corresponding result row restores it. Collapse, resize and expand never mutate data or run a model.

Newly produced artifacts open automatically if the panel was not explicitly hidden and its current editor has no unsaved work. Explicitly hidden panels stay hidden; show an unobtrusive new-artifact count. An explicit object selection opens the object. If an automatic change would replace dirty work, keep the editor and offer the new artifact without moving focus. Restore the last valid active artifact when reopening its conversation; explain deleted/unavailable objects and offer removal from the conversation's artifact list without deleting the entity.

### Compact and mobile

At widths where two editors do not fit, use «Чат / Материал» switching for the same work session. Show the selected object's name on the material control. Navigation, history and workspace browsing use existing accessible layers. Keep the composer usable with the on-screen keyboard and dynamic viewport, preserve the conversation scroll anchor and editor draft, and return focus after closing a layer. Test 1440, 1024, 768 and 390 px, both themes, keyboard, reduced motion and 200% zoom.

### Workspace and artifact lists

«Артефакты» lists the distinct objects involved in this personal conversation, by stable type/id, with a readable name and live status. One entity updated repeatedly is one entry; independent adaptation variants remain distinct. The active result can expose versions inside its existing editor.

«Пространство» opens a compact, searchable, role-scoped object browser on explicit request. It lists existing avatars, channels, pieces and plans with real statuses, not a five-step completion certificate. Selecting an existing object only opens it and establishes context. Creation is an explicit action; no automatic send or model call. Empty, loading, no permission, deleted, many-items and recoverable error states are designed. Reuse existing listing APIs and bounds rather than loading every object into a permanent panel.

## 5. Shared context and conversation continuity

Introduce one narrow, versioned product work-context contract and host facade, with the piece screen as its first consumer. It identifies the target by kind and stable id, with optional piece/channel/adaptation selection and the observed revision. Display the active target next to the composer. A person can deliberately remove or change it.

The server checks organization, acting user, role, object existence and current revision before reconstructing the context. An arbitrary URL, pasted title, client-supplied prompt or resource id never supplies authority. User text, old example, foreign source, current text, personal answers, current question state and research evidence remain distinct labelled data. The conductor receives enough current content to discuss the requested edit; tools still use the authoritative service read and compare-and-set before accepting a change. Long contexts are bounded by relevance and size; disclose omissions instead of silently losing the requested passage or original goal.

Conversations keep the existing organization-plus-user ownership check. A private conversation may reference several shared product objects. A shared object does not grant access to another user's conversations. Artifact references and last selection are stored as validated conversation metadata or a small product-owned association through the existing storage boundary; decide the smallest compatible persistence after checking current storage APIs. Do not invent Prisma tables for Mastra's schema or change runtime ownership.

From a manual object page, «Обсудить с ИИ» opens the same chat components beside that object. Reuse that person's existing linked conversation when unambiguous; otherwise show a small choice or start a new conversation with the target attached. Lists and aggregate surfaces (content, avatars, channels, calendar, ideas, facts and media) attach a validated section scope and optional selected record/filter instead of inventing an entity id. A calendar scope can carry the visible date interval and authorized channel selection; it cannot schedule anything by being opened. A common authenticated site-level session host preserves an ongoing chat during manual-route navigation without mounting independent assistants. No message is sent by opening. Reload, back/forward, switching object, conversation, or workspace cannot leak history, apply late results to another entity, or reset unsaved text. Links never carry raw content, secrets or arbitrary system instructions.

## 6. Manual and chat parity

The right panel and standalone route use the same artifact/editor host. Keep existing embedded modes and shared services. The host controls surrounding chrome and contextual-chat entry; embedding a manual page inside an AI assistant panel must not recursively mount another assistant.

The facade shares the conversation, composer, upload, question, selection, approval, operation-state and error components. Do not write second miniature avatar, channel, intake, research or rewrite forms. Scene-specific layouts may differ while their actions, validation, saved fields, meaning and messages remain the same.

| User goal | Shared action/data owner | Both entry points must show |
| --- | --- | --- |
| Create or refine an avatar | Existing voice service and avatar editor | Same fields, measured/proposed/manual values, draft and activation consent |
| Set up channel writing | Existing channel service/editor | Same writing profile, avatar binding, schedule and plan mode; real connection consent unchanged |
| Create a piece and answer questions | Intake and piece services | Same task, personal answers, factual supports and resulting piece; questions use shared controls |
| Refine text by instruction | `piece.rewrite` and existing review accept path | Current text, proposed changes, explicit acceptance and retained old version |
| Supply extra facts or own experience | Existing append/answer service, followed by explicit intended rewrite | Words retained as material, no invented personal experience, clear pending/applied state |
| Search and check facts | Existing research/review services | Same period/source selection, spend limits, proposal and stale-result behavior |
| Adapt and reserve | Existing adaptation and plan services | Same variant, channel, draft/reserve state and exact date/time; publishing never inferred |
| Inspect ideas, facts or media | Existing shared views and list readers | Same records and restrictions; no model required just to look |

Before the first text, remove the competing «Дописать материал» block; answers and new context belong to the interview/conversation. After a text exists, the primary path is an instruction such as «Сократи вступление» or «Добавь мой пример». A secondary «Добавить исходные материалы» action may remain for deliberate raw input, clearly distinct from an edit instruction. Do not silently append editorial commands as factual material. Keep direct manual text editing, source inspection, version restore and channel adaptation available.

## 7. Research periods and change-only tasks

Both intake paths consume the same versioned research-intent contract. It distinguishes the new task from an old example and records a concrete clock anchor, timezone, requested event interval, prior coverage boundary and exclusions. Use existing role/config routing and web engines; no extra paid planner chain is required by this design.

For the frozen regression: as of 16 October 2026 in Europe/Moscow, a previous overview covering 6–8 October and the request «что произошло после» means events after that coverage boundary through the current instant on 16 October. Do not substitute a rolling seven-day window or silently choose a newer source-publication date as the event date. If a noncontiguous previous post makes the boundary materially ambiguous, ask one specific question.

An explicit new interval such as «за 9–16 октября; не повторяйте прежний обзор» keeps those requested dates even when the old example has no clear coverage. Exclusion wording does not replace the interval. A range ending today stops at the current instant. Chat and manual research share a 2000-character direction limit throughout validation, search and digest; invalid arguments reserve no paid action slot.

Pass supported publication/date constraints to the provider, then check event-effective dates and prior coverage in the common source-selection/admission layer. Rolling release notes and later retrospective pages can support events in the interval; a recent crawl alone cannot. Older sources may be context but not new events. Preserve date provenance and honest unknowns; do not invent precise event dates. An explicit historical request must not be rewritten to today.

Temporal retrieval reserves one bounded rolling/release-note companion independently of the locale pair. That companion has no page-publication window: the downstream event interval remains authoritative. Select existing contiguous dated sections before sharing the established source/text budgets; one locale or early long page cannot consume all reading material. Quote/source aliases and punctuation use the same established normalization when attaching event provenance. Keep finite reader/admission rejection counters for diagnosis without author text or source passages.

No matching verified events produces a useful empty result that names the searched period and gaps, with the old draft retained. It must not recycle old news as a successful new digest. The composer/panel shows the resolved period so the person can correct it. Replay tests pin the clock; production uses the caller's timezone and real current instant.

In chat, empty or clarification outcomes return the period and gaps without an old-fact selection card. A matched-period card offers only new confirmed selected findings with event provenance and displays their event date; source restrictions and the existing explicit selection/rewrite boundary still apply.

## 8. Progress, errors and recovery

While working, show the active operation and its real result: e.g. searching, asking for a personal answer, proposing changes, saved draft. Use existing streamed progress and transient operation parts, not a fake percentage or a global «5 из 5». Keep previous successful results visible.

Use the existing transport's cancellation/recovery and backend claims. «Остановить» stops the current response where cancellation is supported; it never claims to undo a persisted write or a provider effect. A late saved result must be read back and reported. An interrupted or uncertain write is reconciled before any retry; never introduce transparent duplicate paid calls or publishing attempts. Retry is an explicit intended action with the same existing quotas, claim and authorization checks. Opening/reloading/panel controls spend zero; one conductor turn retains one `agent` admission and separate existing paid action accounting.

Questions, factual selections, edit acceptance, irreversible approval and secret entry retain distinct types. A natural-language «да» does not bypass the existing explicit consent path. Manual editing makes an old proposal stale; reject or refresh it without losing either draft. Busy states disable only conflicting actions. Roles or AI unavailability leave the permitted manual read/edit path understandable and useful.

## 9. Visual direction and reusable building blocks

The daily editor works for sustained sessions in an existing Content Factory workspace. Preserve the current dark-first Desert Lab identity and its light theme, typography and semantic `cf` tokens; use a restrained accent for active actions. The owner references the familiar Mastra conversation pattern: conversation first, meaningful working object beside it, visible work and recoverable actions. Existing Content Factory forms and the accepted assistant/artifact pattern are the other anchors.

Use `Button`, `Textarea`, choice primitives, `Disclosure`, `WorkingLine`, `OpeningBand`, skeletons, `Popover`/dialog/sheet and focus management already in [the component inventory](../design/component-inventory.md). Follow [authoring rules](../design/component-authoring-rules.md). Share an accessible splitter if no suitable one exists; register any added/reworked reusable component in the inventory in its implementation commit. No new color system, hand-drawn controls, card grid, independent assistant theme or developer-console UI.

The [prototype](../design/chat-first-workspace/prototype.html) is a local interactive layout study, not a working product: synthetic content, local state and existing design tokens. It demonstrates empty chat, a working piece, object switching, a collapsible panel, workspace browsing and the manual entry. No models, services, real records or production changes are used. It is not evidence that assistant operations succeed.

## 10. Acceptance scenarios

| ID | Scenario and required evidence | Owning work package |
| --- | --- | --- |
| A1 | Approved new entry opens the primary chat; deliberate manual/deep links still work; zero model spend on opening | Navigation and shell |
| A2 | Existing AI assistant baseline distinguishes actual source/browser observations, recorded model-free scenarios, historical provider proof and untested owner behavior | Baseline diagnostic |
| A3 | From an empty owned workspace: avatar → channel writing settings → piece → personal answers → adaptation → reserve, with identical service records and no accidental publication | Shared host, manual bridge, final acceptance |
| A4 | Open a manually created piece in chat; give a refinement; inspect/accept changes; reopen the section and see the same text and version. Repeat parity for avatar and channel | Context, host, manual bridge |
| A5 | Reload/switch conversations; artifacts, target and private history restore correctly; other users/workspaces and forged or deleted targets are refused | Context and persistence |
| A6 | Empty chat has no giant checklist; hide/restore/resize artifact; object switch preserves drafts; compact/mobile controls, focus and scrolling work | Navigation/shell, shared host |
| A7 | Frozen old-overview regression selects 9–16 October events; rejects recycled 6–8 October news; handles rolling sources, historical request, timezone edge and empty result | Period-aware research |
| A8 | Real progress, interrupt, uncertain write reconciliation, explicit retry, denied role and unavailable AI retain data and do not double spend or repeat side effects | Run lifecycle |
| A9 | All shared surfaces pass RU/EN, dark/light, 1440/1024/768/390, keyboard/zoom/reduced-motion, long content, permission and stale-version checks | Each UI package and final acceptance |
| A10 | Existing frozen A1–A5 and unrelated acceptance criteria remain; one root-owned release set and separately recorded actual owner/provider/deployment evidence | Final acceptance |

## 11. Delivery and open authority

On16 October2026 the owner authorized implementation of this epic and selected «ИИ-помощник», localized across all16 shipped languages. Local source, design, tracker and verification work are included. Paid/live model/provider checks, real social-account changes, publishing, source push and production deployment remain separate current-authority steps. Earlier releases do not grant new authority or prove the new scenario.

The implementation reuses the existing Mastra/AI SDK runtime, private organization:user threads and shared product editors. The installed metadata APIs, native resource-memory behavior and bounded context/storage contracts were checked. Exact local acceptance and remaining owner/provider/release gates are recorded in Beads and the current implementation-stage outcome; the planning prototype remains design evidence.

Research acceptance preserves the exact previous core text in the existing bounded revision history in the same compare-and-swap write as the replacement. Existing revisions, author provenance and pending-material state survive; an empty result, failed generation or stale snapshot cannot replace either text or history.


### Completing an overview update in one request

A desired event interval remains authoritative when the same request excludes prior dates. Negated prior ranges are exclusions, including ordinary Russian/English wording before or after the dates; genuinely competing positive periods still ask one question. A latest clarification is passed without reintroducing discarded intervals.

After the person selects research findings, a temporal update writes a standalone overview in the same native draft call. The previous core supplies the author’s stance and actual observations; its old event narrative is replaced. Only selected confirmed dated findings support new events, with their supplied source links; no new personal experience is invented. Ordinary non-temporal enrichment retains its existing preservation behavior. No separate editorial message is required to finish the period update. The exact original/revision CAS and empty/failure safety above still apply.

A proposed text change shows complete exact before/after paragraphs and its reason in the shared manual/chat preview, expanded before acceptance and collapsible with the keyboard. Only public preview fields cross the wire; the signed proposal and private continuation stay server-side. Acceptance sends selected ids, not replacement text. A completed research save reports a final applied state with zero waiting choices; the assistant acknowledges the saved result rather than asking for the same selection again.


### Accepted period overview title (owner17October2026)

Accepting selected dated research refreshes the overview title and body together in the existing content language, within the same native draft operation and atomic save. The title names the selected period and substantive supported events, stays within the existing120-character title field, and remains manually editable. No second editorial command or manual title update is required. Empty/declined research, invalid generation or a concurrent title/body/brief edit leaves the existing fields unchanged; successful updates retain the exact previous body in native history. Ordinary non-period enrichment keeps its current title behavior.

### Live acceptance fixture clarification, 17 October 2026

For the requested complete fresh walkthrough, the owner designated the already
connected Telegram test group and authorized its use. Actual provider acceptance
uses a new personal conversation, new avatar, channel writing setup, new piece,
personal answers, adaptation and reserve on that existing native connection.
This does not claim a new real-social connection or an empty production
organization. The original empty-workspace model-free scenarios and all other
A1–A10 criteria remain recorded separately. The owner delegated this execution;
a technical walkthrough does not claim their personal clicks or unrelated
client/provider acceptance.
