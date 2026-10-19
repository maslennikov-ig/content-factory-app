# Delta-news chat investigation — 18 October 2026

Scope: read the owner-provided conversation and its saved execution, diagnose the
ordinary prior-post/news/Telegram scenario, and create the remediation plan in
Beads. Epic: `content-factory-next-j9p5`. No implementation or live repair.
Exact authenticated conversation reference is retained in the epic metadata;
original input, account identifiers and raw snapshots are outside Git.

## What the person asked for

Collect OpenAI updates after a pasted overview covering 6–8 October, investigate
the daily-release/reset promise, create a **new** piece, and prepare content for
the person's Telegram channel. The request arrived on 18 October at 19:10:29
Europe/Moscow. The obvious search interval is 9 October 00:00 local through
that request instant, not another overview of 6–8 October. The pasted post is
prior coverage and an editorial reference, not the new factual payload.

## Evidence and actual result

[Sanitized receipt](evidence/observed.json) records the observations without
private text or continuation keys. Production image at inspection:
`ghcr.io/maslennikov-ig/content-factory-next:da82a041c623`.

| Layer | Observed |
| --- | --- |
| Request | One user message; no answer to the facts card. |
| Conductor | Loaded the content skill; called `piece_create` with `inputKind=instruction` and `research=standard`. It paraphrased the task instead of retaining it verbatim. |
| Intent | `mode=historical`, old interval 6–8 October, `priorExample=null`; the entire prior post remains inside the task. |
| Search | Standard paid web-research operation succeeded; 20 sources were retained. Search did run. |
| Digest | `found=0`, `periodStatus=empty`, three old input claims confirmed and five input claims unverified. |
| Card | “Поиск нашёл опоры. Отметьте, на чём строить заготовку.” Eight `own:` rows, zero selected defaults, zero new findings. Two rows describe the assignment/old coverage rather than news. |
| Persistence | Both native workflow snapshots remain `suspended` on that selection; workspace artifacts are empty. No new piece exists in the scoped actor/workspace time window. |
| Outcome | No final assistant text, new core or Telegram result yet. The person must answer an irrelevant card to proceed. |

The thread's `assistantExecution=settled/completed` means that the HTTP turn
settled; it does not prove the multi-step task was completed. The persisted
suspended run is the source for the outstanding choice.

The four scoped usage records (agent, intake/extract, web_research/research,
intake/review) are all marked succeeded. Their recorded total is USD0.05579114,
a journal lower bound, not proof of invoice completeness or useful output.

## Confirmed causes

1. **Task/reference separation is phrase-dependent.**
   [research-intent.ts](../../../libraries/nestjs-libraries/src/content-intelligence/intake/research-intent.ts)
   recognizes a limited set of reference labels and delta phrases. The natural
   inflection for “my previous post” and “after this very post” misses that
   separation. The first historical range in the pasted body becomes the
   requested interval. Both the original message structure and the conductor's
   rewritten argument reproduce the same wrong interval offline.
2. **The wrong intent reaches real consumers.**
   [IntakeService](../../../libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts)
   passes the resolved historical interval to search, date-aware material
   selection and digest. The stored snapshot confirms it. The provider call
   succeeds while the product solves the wrong investigation.
3. **The new-piece adapter loses the result semantics.**
   `intakePass` in
   [piece.capabilities.ts](../../../libraries/nestjs-libraries/src/chat/capabilities/catalogue/piece.capabilities.ts)
   reads all `facts` from `research-selection-required` and builds a generic
   card, discarding `summary`, `periodStatus` and `gaps`. That is why zero new
   findings become a “search found facts” card of old input claims.
   The existing saved-core research capability already handles empty periods
   and filters dated new findings; the new-creation adapter does not share
   that behavior.
4. **Evidence becomes hard to assess in the chat.**
   `factOptions` reduces each row to label/status/source host. The current
   selection card cannot show a new event's date, full source link or the
   reason a search failed to produce new findings. This makes an incorrect
   result resemble a missing search.

Five relevant local TypeScript files hash-match the deployed source archive;
the source hashes are in the receipt. A corrected diagnostic using the
repository's ES2021 TypeScript loader matches the intent recorded in production.
The [privacy-safe reproducer](evidence/reproduce.cjs) contains invented vendor
and feature names, retaining only the failing grammatical structure.

## Further acceptance obligations, not proven downstream failures

Owner clarification after the initial plan: this conversation is one example,
not a required request format. Semantic understanding and ordinary editorial
choices belong to the model. The [expanded audit](autonomy-audit.md) covers
other code constraints; the current plan has eight tasks, including context
access and bounded execution instead of artificial operation rituals.

The saved incident used `openai/gpt-6-luna` via OpenRouter for all four roles:
agent, extract, research and review. The conductor's tool argument explicitly
said “after 8 October”; code then selected the old historical interval. This
is evidence of code overriding understood intent, not proof that this model
could not understand the request. [Model attribution](evidence/model-attribution.json)
records the four historical role rows without private payloads.

The internal brief prepared questions about the desired position, audience and
meaning of resets. Those questions were not yet shown in a later interview.
Public terminology should first be investigated from sources; an already known
channel audience should be reused. A factual digest must not require invented
personal experience or a compulsory opinion. A genuinely material author-owned
choice may still require a question.

Creation, Telegram adaptation and their resumption did not run in this case.
Their correctness is unverified here. The plan includes complete-goal acceptance
instead of claiming that the Telegram provider itself failed. Existing paid
caps, native fact selection and publishing approvals remain the contract.

The captured sources contain campaign discussions and rolling pages, but their
presence alone does not prove distinct eligible new events or exhaustive
coverage. This audit does not manufacture an alternative news article or treat
community aggregation as verified first-party announcements.

## Correct experience

Resolve the anchored delta period and retain the entire requested goal. Search
for unseen changes and check the daily-release/reset promise separately. Admit
only event-dated, source-backed new findings; make incomplete or empty research
explicit. Offer a useful normal facts card, then write a coherent new digest
and prepare the Telegram variant through existing shared services. Preserve
the goal across native choices and legitimate paid-cap continuation. “Prepare”
does not authorize sending, autopilot activation or publication.

## Plan, authority and verification

[Implementation plan](../../../docs/superpowers/plans/2026-10-18-delta-news-research-and-telegram.md).
Beads contains the epic and six cohesive tasks, dependencies and acceptance
criteria; Linear is the canonical task authority through the managed bridge.
Historical `jvrq` acceptance is retained, not retroactively widened or reopened.

The audit used read-only PostgreSQL connections (including a native read-only
transaction for Mastra), scoped Prisma reads and exact Redis GET/TTL. It did
not answer the original card, rerun paid search, create content, change data,
publish source, deploy, send messages, or generate a login credential. Private
copies are mode600 outside Git; provider response headers were redacted.
An authenticated visual browser acceptance was not performed.

graph-reviewed: used focused `AgentThreadsService`, `researchForIntake` and
`resolveResearchIntent` queries against this checkout's graph, baseline
`dd67538d`; confirmed relevant source paths and the five deployed-source hashes.
Graph was used for orientation and was not refreshed for this planning audit.
