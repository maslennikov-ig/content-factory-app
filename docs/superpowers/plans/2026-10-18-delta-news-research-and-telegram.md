# Model-led request understanding, research and completion

**Goal:** the existing assistant understands ordinary requests and their
materials, chooses appropriate tools, checks their actual results and carries
the requested work through to reviewable artifacts. Epic:
`content-factory-next-j9p5`. No prior post, particular vendor, date phrase or
Telegram target is required for the mechanism to work.

**Owner clarification, 18 October 2026:** the supplied conversation is an
example of a general failure. Semantic understanding belongs to the model;
scenario dictionaries, keyword routing and special branches for that example
are not an acceptable fix. This supersedes the initial narrow framing while
preserving the same epic, original six task identities and observed evidence.
The subsequent owner direction also requires auditing and reducing artificial
execution/context restrictions; two independent tasks are added below.
The further conversation-navigation question adds a separate native-thread UX
boundary: clear creation, finding and switching of personal conversations,
with complete paged history and the existing Mastra memory as the sole store.

**State:** implementation authorized by the owner on 18 October 2026, including
native chat navigation and necessary model costs. Task state lives in
Beads/Linear. The implementation and its distinct verification/delivery gates
are recorded in the [implementation stage](../../../.codex/stages/content-factory-next-j9p5-implementation-20261018/implementation.md). Production delivery requires its own current authority.

**Evidence:** [incident audit](../../../.codex/stages/content-factory-next-delta-news-audit-20261018/audit.md),
[observed receipt](../../../.codex/stages/content-factory-next-delta-news-audit-20261018/evidence/observed.json),
[structural counterexample](../../../.codex/stages/content-factory-next-delta-news-audit-20261018/evidence/reproduce.cjs).
The [additional autonomy audit](../../../.codex/stages/content-factory-next-delta-news-audit-20261018/autonomy-audit.md)
records eight mechanisms and distinguishes live failures from source risks.
The [native conversation audit](../../../.codex/stages/content-factory-next-delta-news-audit-20261018/conversations-audit.md)
records current controls, installed-version evidence and the navigation boundary.
The [existing assistant contract](../../product/chat-first-workspace-spec.md)
and native Mastra/services remain the foundation.

## What failed in the example

The saved execution used `openai/gpt-6-luna` through OpenRouter for the agent,
extraction/brief, research and review roles. The agent's tool argument explicitly
asked for updates **after 8 October**. The deterministic `resolveResearchIntent`
function then chose the old example's **6–8 October** range. The digest found
zero new events; the new-piece adapter discarded that outcome and suspended
on a generic card of eight old input rows. The conductor received no useful
failure/empty result on which to reconsider the task before that card.

Thus the observed root cause includes the orchestration overriding the model's
understood boundary, a weak tool interface and lost result semantics. This
case alone does not establish that Luna is incapable or that swapping models
would fix the system. Initial semantic model intent was better than the
interval chosen by code. Other possible model mistakes must be evaluated
separately, with the actual inputs, prompts, tool results and role model recorded.

## Architecture and division of responsibility

The model reads the original request and available context, separates the goal
from supplied material, resolves references, determines what evidence is
needed, chooses tools and the order of work, and assesses whether the result
satisfies the request. A generic structured representation can carry goal,
requested outputs, materials with their roles/origins, constraints, evidence
needs and unresolved choices. Every field is optional when irrelevant; a
prior example, temporal interval or channel is not mandatory.

Code validates representation shape and size, parses explicit machine dates,
converts calendars/timezones, verifies permissions and tenant ownership,
enforces budget/step limits, binds cards to server state, persists confirmed
results and prevents unsafe replays. It must not infer meaning from a phrase
whitelist or silently overwrite a model-understood constraint with a date
found inside reference material. Semantic contradictions return a clear tool
result for model resolution or a material question, not silent fallback.

Reuse the existing conductor and extraction before adding another planner
call. An extra model call requires a demonstrated quality benefit within the
existing budget, not an assumption that every request needs another chain.
Do not choose a stronger model as a substitute for repairing information loss;
record model suitability as an empirical question after the tool flow works.

## General behavior and invariants

1. Retain the original request verbatim. Read relevant conversation, selected
   objects and supported supplied material as labelled context. Instructions,
   examples, evidence, author experience and quoted third-party text retain
   their different roles; source text never grants permission.
2. Let the model resolve meaning and choose the available read/search/write
   actions. A request can be a question, factual investigation, comparison,
   rewrite or multi-step production task. Tests use these examples; production
   must not route them by literal phrases or a fixed scenario catalog.
3. Search when fresh or missing external evidence is needed, honoring explicit
   no-search constraints and existing product/budget rules. A self-contained
   rewrite must not automatically become a paid news investigation. Do not
   require previous material, dates or personal experience when absent.
4. Apply only relevant constraints. Temporal research uses a trusted request
   clock, event dates and timezone; timeless explanation does not require a
   date on every fact. Given references guide scope only as the user intends.
   Contradictory or materially ambiguous constraints need model resolution or
   one specific question; lack of a matching phrase is not ambiguity.
5. Expose the actual tool outcome to the model: what ran, requested scope,
   useful results/evidence, gaps, refusal/error, incomplete work and persisted
   artifacts. A tool execution success is not task success. Missing evidence
   is not permission to invent facts or claim exhaustive coverage.
6. Before presenting the outcome as complete, the model compares it with the
   original goal and constraints. If insufficient, it may read another source
   or change search strategy within existing limits; failures and uncertain
   writes cannot trigger blind retries or duplicate spending. If still
   unresolved, explain the gap or ask the one material question.
7. The model makes routine reversible editorial decisions, including which
   relevant sourced facts to use and how to structure a draft. Do not require
   fact-by-fact manual selection or a typed delegation for an ordinary task.
   Human cards are for requested review, material author-owned choices and
   effective approvals. Model selection is recorded as model-origin, never
   forged as the person answering a pending card. Empty research cannot produce
   a successful found-facts card;
   public facts/terminology are investigated rather than delegated back to
   the person. Known preferences and channel settings are reused. Genuine
   personal decisions and autobiographical facts are never invented.
8. Preserve the original multi-step goal through pauses, answers, reload,
   Stop and actual resource budgets. Continue allowed requested steps without
   asking for the same instruction again. At real quota/time/token/cost
   exhaustion report exact remaining work and retain safe continuation. Replace the arbitrary one-operation-per-message
   rule and routine tiny step ceiling with the task execution policy in `.8`;
   do not remove actual organization allowance, billing or the emergency fuse.
9. Native artifact services and shared/manual editors remain the only writers.
   Preserve existing records/history, show confirmed saves and avoid duplicate
   drafts/variants. A requested new result never overwrites a reference by
   inference. Preparing an artifact does not authorize external publication.

## Owning tasks and dependencies

| Acceptance boundary | Task | Prerequisites |
| --- | --- | --- |
| Model-led understanding and a generic task/material contract | `content-factory-next-j9p5.1` | None |
| Evidence-seeking and result sufficiency by the actual request | `content-factory-next-j9p5.2` | `.1` |
| Complete tool feedback and honest native presentation | `content-factory-next-j9p5.3` | `.2` |
| Sufficient inputs and proportionate questions for writing | `content-factory-next-j9p5.4` | `.1`, `.2` |
| Multi-step goal execution, recovery and artifact verification | `content-factory-next-j9p5.5` | `.3`, `.4` |
| Generalization/quality evidence and authorized release | `content-factory-next-j9p5.6` | `.5`, `.7`, `.8`, `.9` |
| On-demand authorized material/history reads and goal memory | `content-factory-next-j9p5.7` | `.1` |
| Task execution budget in place of arbitrary operation rituals | `content-factory-next-j9p5.8` | `.5` |
| Discoverable personal chats and complete native thread continuity | `content-factory-next-j9p5.9` | None |

Preserve the original six identities/priorities/edges; add `.7`, `.8` and `.9` at
separate model-context, cost/recovery and human-navigation boundaries. The epic now has nine
implementation/delivery tasks. Historical `jvrq` acceptance
is related bounded evidence, not a reason to rewrite earlier results. Unrelated
client/finance/measurement gates remain outside this remediation.

## Task 1: Semantic understanding and tool input

**Files:** `chat/conductor/conductor.instructions.ts`, `conductor.skills.ts`,
`chat/capabilities/catalogue/piece.capabilities.ts`; shared work-context/intake
contracts, `content-intelligence/intake/intake.service.ts`, `research-intent.ts`
and manual adapter/DTO only where they consume the change.

Give the existing model a consumed generic representation for the goal and
material roles. Repair the interface that currently accepts one undifferentiated
text blob. Remove authoritative semantic inference by regex/phrase matching;
keep deterministic validation/calculation of explicit structured values.
A trusted clock anchors temporal requests without changing their meaning.
Optional old examples/history remain optional context, not special handlers.

**Proof:** actual model-to-tool-to-intake composition, direct/manual parity,
paraphrases and unseen subjects/materials. The original date bug is one frozen
regression. A valid model-supplied boundary cannot be overwritten by dates
inside quoted context; absent dates/prior material do not block a plain request.

## Task 2: Evidence strategy and sufficient research

**Files:** `openai/web.research.service.ts`, `openai/research-event-material.ts`,
`content-intelligence/intake/intake.service.ts`, `research-digest.v3.ts`,
`research-intent.ts`; existing source-registry and research-summary contracts.

Let the request determine evidence needs, scope and remaining questions. Return
inspectable provenance and useful findings; distinguish actual new events from
old/future/undated claims when time matters. A comparison or stable factual
question uses its own relevant sufficiency criteria, not mandatory news dates.
Allow bounded source/query refinement when insufficient; preserve source caps,
network rules, quotas, paid accounting and honest unknowns. Reuse existing
source/digest services rather than a vendor-specific search lane.

**Proof:** actual retrieval/material/digest consumers for diverse factual asks,
self-contained no-search requests and mixed/empty/partial/failed evidence.
Support primary attribution and explain remaining gaps. More source rows alone
cannot make the investigation complete.

## Task 3: Tool result feedback and native presentation

**Files:** `chat/capabilities/catalogue/piece.capabilities.ts`, `core.capabilities.ts`,
`selection.ts`; `agent-parts.contract.ts`, `question-card.ts`; existing conductor
adapter/suspension boundaries; frontend agent contract, selection card/copy and
shared intake research components.

Return a truthful useful summary and bounded inspectable evidence to the
conductor before any misleading
presentation can prevent assessment. Carry evidence, status and gaps through
native cards, history and manual/chat consumers. A human card must not be used
as a substitute for the model evaluating a tool result. Preserve server-only keys, compatible payloads, source trust boundaries and
genuine required choices. Let the model make routine supported-fact selections
through a server-validated model-choice path without pretending it is a human
resume or approval. Explicit requested review still uses the native card.
Read the component inventory and authoring rules before changing shared UI.

**Proof:** model actually receives relevant success/empty/partial/failure
information; native renderer matches it. No eight-old-rows success card for
zero new findings; ordinary rewrite/select/approval cards keep their contracts.
Cover decline, expiry, reload and safe source inspection.

## Task 4: Sufficient input and useful questions

**Files:** `content-intelligence/intake/intake.service.ts`, current brief/interview
prompt consumers; `pieces/core-write.ts`, current versioned prompt,
`piece.service.ts`; existing piece-answer/manual flows where needed.

Let the model determine whether available request/material/settings are enough
for the requested output. Ask for genuinely missing author-owned information;
do not force a fixed interview for every genre or ask for verifiable public
facts. A factual digest, rewrite and personal story have different needs by
meaning, without routing on specific user phrases. Preserve explicit titles,
source provenance, original wording/experience and native version history.

**Proof:** adequate inputs produce coherent saved artifacts; missing real
personal facts are asked rather than invented. Existing supplied answers and
settings are reused. UI/manual/API/persistence agree; no empty/stale factual
article is fabricated to conceal insufficient evidence.

## Task 5: Original goal execution and recovery

**Files:** `chat/conductor/conductor.instructions.ts`, `conductor.skills.ts`,
`agent-chat.request.ts`, `agent-threads.service.ts`, existing workspace/turn state;
native piece/core/adaptation capability/service consumers as required.

Retain arbitrary requested outputs and the completed/remaining steps through
native pauses and partial saves. The model checks actual results against the
goal and continues allowed work. Reuse existing writers; verify current targets,
role, channel mode, confirmed versions and artifact state. No fixed mandatory
research->piece->Telegram pipeline: use it only when requested. Quota or actual
approval boundaries remain explicit; uncertain writes and expired snapshots
cannot silently replay research or create duplicates.

**Proof:** single-output and multi-output requests, alternate output targets,
real resource exhaustion/next, ambiguity, Stop/reload/double answer and partial
failure. The
original Telegram example yields one requested new piece and one variant;
other requests neither require Telegram nor fabricate extra outputs. No
unapproved external send even when a target channel has autopilot configured.

## Task 6: Generalization, model quality and authorized delivery

Acceptance includes varied natural requests, not only this incident or prompt
keyword assertions. Use independent wording and supported contexts: a short
request without a prior post; context in earlier chat; a supplied link or selected
artifact; reference material containing irrelevant dates/instructions; a rewrite
with no search; a factual comparison; an ambiguous private decision; a multi-step
request with a partial/empty tool result. These are evaluation cases, never a
production dispatch table. Include cases not used to tune the prompts.
Also accept new-chat creation and personal conversation switching, a direct
conversation URL, reload/back/forward and manual-context return. A collection
larger than100 conversations and history longer than200 messages must remain
reachable through native pagination. Preserve unsent drafts and ensure late
stream/card results stay with their originating thread. UI history retrieval
and the model's context retrieval have separate acceptance evidence.

Trace what the model understood, what parameters code consumed, actual tool
results visible to it, self-assessment, next actions and saved artifacts. Record
model/provider per role and cost/latency with completeness limits. First test
with the same recorded Luna route after fixing interfaces; if semantic failures
remain, evaluate model/prompt suitability separately. No claim that a stronger
model fixes overwritten intent; no silent model switch or unauthorized paid A/B.

Implementation tasks own focused regressions and affected docs. One root-owned
epic acceptance runs `pnpm run build`, all three `pnpm test` halves,
`git diff --check`, affected docs/design checks and
`scripts/orchestration/run_process_verification.sh`. Authorized delivery uses
the canonical exact-source suite/public-tree/image/runtime evidence. A natural
paid replay requires separate current authority, an owned draft/test target,
real model-selected calls and inspectable final artifacts; no injected desired
output, forced tool script or manual date/body/title repair passes as evidence.
Personal owner acceptance stays distinct from delegated/source/runtime proof.

## Task 7: Authorized context access and retained goals

**Files:** `chat/conductor/conductor.memory.ts`, `work-context.ts`,
`work-context.resolver.ts`, `agent-threads.service.ts`; native scoped readers,
capability contracts and `piece.capabilities.ts` where needed.

A fixed ten-message tail and labelled6000-character excerpt must not be the
only context the model can use. Give it authorized paged/range reads for current
material and its own relevant conversation/history, explicit truncation with a
way to continue, and a bounded retained goal/constraint summary or references.
The model chooses what else is relevant to read within its context budget.
Do not dump an entire workspace, enable pgvector/paid memory processing by
assumption, store task history as permission-granting preferences, or weaken
thread/user/tenant ownership and source trust. Existing shared views still read
the same native records, not a second copy of content.

**Proof:** a material whose relevant requirement is after the current6000-char
cut, an earlier requirement beyond ten chat messages, and an authorized selected
object can be recovered and used. Model reports incomplete reading honestly
when unavailable. Test private-thread/foreign-tenant rejection, changed/deleted
objects, narrow read budgets and retained unsent/editor state. This boundary
can roll back independently of execution-budget changes.

## Task 8: Bounded autonomous execution, real cost controls

**Files:** `chat/capabilities/capability.context.ts`, `capability.admission.ts`;
`chat/conductor/conductor.context.ts`, `conductor.agent.ts`, `conductor.steps.ts`;
`apps/backend/src/api/routes/agent.controller.ts`; actual quota/admission owners
in `openai/ai.usage.service.ts` and configuration only where the contract needs it.

Replace the routine one-paid-operation/two-after-card message cap and forced
last-step text stop as product completion rules. Let the model sequence allowed
reads/searches/production actions to the requested result under an explicit
execution budget grounded in actual allowance, time, token/cost ceilings and
progress. A technical emergency loop fuse is still required; it must report
incomplete work and preserve safe continuation, not claim success. Bound
recovery searches and stop on lack of progress, uncertain writes, real quota
exhaustion or an effective approval requirement.

Before implementation inspect the actual billing/configuration contract. Reuse
existing documented task ceilings when available; if no bounded financial
policy exists, obtain that material owner fact before changing spending
behavior. This plan does not invent a numeric allowance or authorize live paid
calls. Meter each actual domain operation, preserve atomic concurrent admission,
Stop/abort semantics, provider timeouts, no-replay receipts and monthly quota.

**Proof:** a legitimate request can execute multiple paid domain steps with
quota remaining without a compulsory new user message. Actual quota, configured
cost/time/token emergency bounds, repeated no-progress tools and uncertain
write recovery stop correctly, preserve charges and completed artifacts, and
resume without duplication. Existing approval, role/tenant and idempotency
checks remain enforced. Record cost/latency and support scoped policy rollback.

## Task 9: Discoverable chats using native Mastra threads

**Files:** `apps/frontend/src/components/agents/agent.threads.tsx`,
`agent.screen.tsx`, `agent.contract.ts`, existing copy/translation resources,
`assistant.workspace-context.tsx` and route/session consumers only where needed;
`apps/backend/src/api/routes/agent.controller.ts`,
`libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts`.
Read the component inventory and authoring rules before changing UI.

The current plus-only new-conversation action and a list hidden behind the
current title are insufficiently discoverable to the owner. Use a visible
localized “Новый чат” action and clearly labelled “Чаты” access with the current
selection. Keep a readily accessible conversation list in the full assistant;
on narrow/contextual layouts use the existing accessible list/panel primitives
without sacrificing chat/editor space. Reuse existing rename/delete controls,
loading/empty/error states and all16 supported interface languages. Search by
title can aid large collections; it must cover more than a cached first page.

One conversation remains one native Mastra thread, owned by the existing
organization-plus-user resource. Use `getMemory()`, `createThread`,
`listThreads`, `getThreadById`, `recall`, `updateThread`, `deleteThread` and
`memory: { thread, resource }`; keep the current Postgres storage. Do not add a
parallel chat database, replacement runtime or Mastra Studio as the product
shell. Extend the existing product endpoints compatibly with native page
metadata: the current fixed first100 threads and200 messages are a first page,
not an unreachable archive. Load further pages on demand instead of sending an
unbounded history or all conversations on every open.

A new unsent chat stays local until its first message; creation/navigation
alone runs no model. Preserve deep links `/agents/:id` and `/agents/new`, reload,
back/forward, unsent drafts and native artifact references. Personal preferences
may follow the resource; another chat's transcript/task or accidental selected
artifact cannot silently become this chat's context. An intentional manual-page
context remains visible and removable. Loading pending cards restores them
without approving or replaying them; switching during an active turn must not
redirect its late events/saves to the newly selected chat. Existing execution
receipts and consent/ownership checks remain authoritative.

**Boundary:** `.9` owns what the person can find/open/recover; `.7` owns what
history/material the model can retrieve and use. They share the current native
memory service; no dependency forces unrelated model changes before making
navigation usable. Final `.6` accepts both at the product boundary.

**Proof:** a person can create a separate chat and return to either conversation
using visible controls; reopening each restores its own messages, selected
material and pending state. Include100+ threads,200+ messages, first-message
failure/retry, empty/failed list, draft/stream switching, direct links and
reload/back/forward. Check foreign-user/workspace access rejection, keyboard,
390px, desktop, both themes and the shared contextual host. Opening/switching
spends no model operation and creates no duplicate native thread. Auto title
generation is optional future work: it is currently deliberately disabled to
avoid a background model call outside admission, and is not a navigation fix.

## Risks and recovery

**GO WITH CONDITIONS:** no semantic phrase router or case-specific production
branch; generic typed validation and access/budget/approval rules remain. No
new runtime, Temporal contract mutation or schema migration is planned.

Key risks include context hidden by fixed excerpts/history, operation-count
limits misused as product completion, unexpected cost when widening execution,
and semantic intent overwritten by deterministic fallback, hidden
partial/empty tool results, unrelated mandatory interview, model claiming
completion without saved output, paid replay/duplicates after interruption and
executor overfitting the acceptance case. Each has an owning task and actual
consumer proof above; sample output alone is not sufficient.

Revert scoped behavior changes without deleting user data. Optional context/card
fields must tolerate older payloads; old cards continue safely or are refused
before new spending. For an authorized release verify the then-current explicit
rollback target, use the canonical switch on failure, preserve every confirmed
write and reconcile remaining work before retry. Never reset quotas, rewrite
customer originals or restore the whole shared database as a shortcut.

The incident remains an audit/reproducer. No product changes, model-route
changes or live acceptance are claimed by this refinement.
