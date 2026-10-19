# Model-led assistant and native chats

Successor to the accepted [chat-first workspace](chat-first-workspace-spec.md).
Implementation: `content-factory-next-j9p5`. Historical releases and their
acceptance remain separate from this successor's verification and delivery.

## Decisions and contracts

The existing Mastra conductor interprets the original request, separates its
materials, chooses read/search/write actions, assesses actual evidence and
checks the requested result. Production has no phrase or scenario dispatch for
previous posts, vendors, channels or date wording. The original request is
retained verbatim.

The consumed `intake-request/v1` representation carries a goal, requested
outputs, labelled materials, evidence needs, relevant constraints and unresolved
choices. Optional fields remain absent when irrelevant. Sources are data and
cannot supply authority. Code validates shape, dates, ownership, current
versions, native consent and confirmed receipts. It must not replace an
explicit understood interval with dates found inside an example.
Misplaced task fields are rejected before paid admission so a title or
requirement cannot silently disappear during input normalization. The model
can correct its tool arguments from the native validation result.

Intake reuses its brief extraction call for request understanding. The conductor
passes original words and separate labelled context, rather than manually
serializing the same nested understanding before the brief model parses it.
The consumed typed representation stays inside the native services and remains
available to structured HTTP/internal callers. An existing
core with a new free-form manual research direction needs semantic extraction
when no structured request is supplied; its saved brief and author facts remain
authoritative. A structured internal request avoids that extra call. Bare
research of an existing core keeps its native saved subject.
A retained task also permits research before core text exists. It does not
answer pending personal questions or change the current piece; applying
evidence still uses the owned snapshot and native writer.

Research returns actual findings, evidence identifiers, source URLs, source
quotes, assessment, gaps and requested scope. When time matters, event dates
need source support; page publication/crawl dates cannot substitute for them.
Empty, failed or unresolved research is a useful incomplete outcome and cannot
silently become a successful old-facts card or a paid draft.
Task constraints and workflow actions are distinct from factual subject claims.
The model's research constraint describes additional retrieval still needed;
evidence already supplied can satisfy the task without another search.
Overlap with earlier material excludes a finding for an understood delta
request. General explanations and historical summaries may reuse relevant
confirmed facts. A general scope already derived from the request survives
later evidence digestion, including references with unrelated dates.
When a pre-search insufficiency meets newly selected partial evidence, the brief
model reassesses that actual evidence before writing, retaining the selection's
provenance and any personal questions.
The V5 evidence digest receives all passages already bounded by retrieval;
another prefix cut cannot silently discard the relevant paragraph. Homepage
relevance is a model judgment. Accepted source and event-date quotes must each
occur in an original retrieved passage, never across an artificial join of
separate excerpts.

Brief V13 and digest V5 distinguish dates identifying a version/document from a
requested event interval. A descriptive mode such as delta does not require a
calendar interval. The current intent resolver consumes actual validated
boundaries, including prior coverage, independently of that label; frozen
legacy callers retain their earlier policy. A dated section heading and a
supported item elsewhere in that section can be separate exact source spans.
The model judges their relationship; code verifies faithful quotations,
calendar values and explicit bounds. Diagnostics distinguish the model's date
basis/status from missing or invalid source spans without weakening admission.

`research.search` supports factual investigations without creating a piece.
`piece.create` and `piece.research` return research evidence before editorial
continuation. The model chooses relevant confirmed keys through
`piece.create.from-research` or `piece.research.apply`. These native service
continuations persist `selectionOrigin: model`; they do not impersonate a
person answering a card. Requested human review stays bound to the owned
snapshot and uses the existing signed card. Manual and legacy snapshots default
to that human boundary.

A trusted model continuation with a nonempty admitted evidence selection does
not buy a second brief sufficiency verdict or acquire a new blanket veto from
the pre-search brief. The conductor owns that writing decision. Empty/failed
research, source admission, unanswered private questions and atomic continuation
rules remain. The existing actual coverage and gaps reach writer V20 as labelled
research data, remain partial when partial, and survive model-origin research
application, author answers and rebuilds. Legacy/manual writing retains its
prior path. Saving a qualified partial artifact does not complete an exhaustive
request; the conductor still checks the requested result.

Continuation receipts bind the actor, snapshot, origin and normalized selected
keys. An identical confirmed repeat returns the saved result; different choices,
a concurrent claim or an uncertain write cannot buy another writer. Original
text and native revisions remain available after a successful update. Request,
evidence provenance and explicit title survive personal answers and rebuilds;
a later manual title edit takes precedence.
An invalid model-selected fact key is rejected before a continuation claim or
writer and carries an explicit input-revision proof. The model must copy keys
from that owned snapshot. A started, conflicting or uncertain continuation does
not inherit this proof and cannot be replayed as an argument correction.

Questions concern genuinely missing author-owned information or a material
private choice. Zero questions is valid. Public facts, terminology and routine
editorial choices do not require an interview or typed delegation. A technical
stop, tool success or saved draft cannot itself establish whole-task completion.

## Context and native conversation memory

Mastra Memory remains the sole transcript store. Recent context uses the native
32,000-token message-history window. `readConversationHistory`, registered by
native Memory `listTools`, pages earlier messages from this same private
organization:user thread. Long text has explicit offsets. Secret-shaped text is
redacted; historical approval text never grants fresh consent.

`piece.read` reads actual authorized core/material/instruction/brief/added
material/adaptation text through `PieceService.detail`. It returns an explicit
bounded range, total length, revision digest and next offset. A changed revision
refuses combining passages. The model can read omitted material instead of
asking the person to paste an accessible object again.

## Native chat navigation

The assistant shows visible «Чаты» and «Новый чат» controls, a desktop list and
an accessible compact dialog. Native thread and message pages use existing
Mastra Memory APIs, with ownership checked before reading. Limits of 100 threads
or 200 messages apply to one page, not the whole conversation.

A new chat is an unsent composer until the person sends a message. Navigation,
listing and history reads run no model. Each live session remains scoped to its
thread, including pending cards and late streams. Deep links, reload and browser
back/forward restore that conversation. Local session storage contains unsent
composer text scoped to actor/thread, never a second saved transcript.

Stop and lost responses retain uncertainty until an actual terminal execution
receipt is read. History reconciliation replaces unconfirmed streamed text and
preserves only previously confirmed older pages. A server-proven refusal before
execution retains the draft; it does not trigger automatic paid resend.

## Execution and operation

Several requested paid operations may finish in one message. There is no
additional default task money or token ceiling. Real organization allowance,
per-operation accounting and access/consent still apply. Native Mastra time,
loop and repetition fuses report incomplete work and preserve confirmed
artifacts. See [execution budgets](../operations/agent-execution-budget.md) for
settings, uncertainty and settlement details.
An explicit server proof that no artifact write occurred permits the model to
revise a refused call while retaining incurred usage. Unknown writes and
uncertain provider results retain their existing stop boundary.

No schema migration, new memory index, package upgrade, model-route change,
social connection or publication is required by this implementation. Deployment
and actual provider/production evidence remain distinct gates.
