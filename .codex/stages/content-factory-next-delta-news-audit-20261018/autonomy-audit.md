# Model autonomy and code constraints — 18 October 2026

Owner direction: audit other places where code blocks reasoning or substitutes
semantic decisions. Let models do more of that work. This extends the incident
review into a general assistant audit; it is not authorization to remove access
or consent checks, change live models, spend on replay, or deploy.

## Finding classification

Confirmed mechanisms below were read in the current source. The historical
wrong-period/empty-card failure is also proven from the original stored run.
Other live user failures are not inferred from source alone. Synthetic
counterexamples are labelled accordingly; a guard's existence is not by itself
proof that every use is defective.

| ID | Mechanism and source | Effect / evidence | Remediation owner |
| --- | --- | --- | --- |
| A1 | `intake/research-intent.ts:87–187`: phrase matching chooses task/reference and requested dates | Confirmed live: the model asked for events after 8 October, code chose 6–8 October from the reference. Structured meaning must not be overwritten by text matches. | `j9p5.1` |
| A2 | `capabilities/capability.context.ts:43–44,109–127`, `capability.admission.ts:169–175`, `agent.controller.ts:226–227,309`: one paid operation per normal message, hard maximum two on an approved continuation | Confirmed source-enforced stop, distinct from the actual organization allowance. A multi-action request can stop while funds/quota remain. The original failed run did not reach this stop. Replace the routine semantic stop with a measured task execution budget; retain true quota/billing guards. | `j9p5.8` |
| A3 | `conductor/conductor.context.ts:33`, `conductor.agent.ts:164–166`, `conductor.steps.ts:71–91`: seven total steps, last step forces `toolChoice=none` | Confirmed source rule; only six tool-capable steps in the ordinary path. Skill loading/reads consume that space too. Keep a technical loop/time/cost fuse, but do not use a fixed tiny count as the definition of task completion or force unnecessary user messages. | `j9p5.8` |
| A4 | `conductor/conductor.memory.ts:75–85`: only ten recent messages; semantic and observational recall disabled; working memory holds preferences rather than a task summary | Confirmed context boundary; risk of losing earlier requirements in a long conversation. Not a cause of the original two-message incident. Provide scoped on-demand history/goal retrieval within the model's context budget; no automatic pgvector migration or extra unbilled memory calls. | `j9p5.7` |
| A5 | `conductor/work-context.ts:145–175`: each text at most6000 chars, total string budget10000, arrays12; JSON overflow becomes first7000 chars. `piece.capabilities.ts:632,645–669` returns metadata/questions, not the core text | Confirmed source behavior. Truncation is labelled, which is good, but that does not give the model missing evidence. Supply an authorized paged/range read so it can inspect the relevant rest, rather than raising every limit or pretending it read all material. | `j9p5.7` |
| A6 | `piece.capabilities.ts:181–193,368–373`, `core.capabilities.ts:224,258–319`: search rows become a mandatory human choice, while model-facing research is counts-only | Confirmed mechanism; in the incident summary/empty status is discarded and the human receives old rows. Model cannot assess/choose routine relevant findings with information it never receives. Allow model editorial selection with explicit model provenance; show human selection only for a real choice or requested review. Do not forge a human answer or effective approval. | `j9p5.3` |
| A7 | `intake.service.ts:1306–1337` injects a foreign-post position question even if the model produced zero questions. `pieces/core-questions.ts:246–287` chooses the stance options; `finish` at893–896 defers writing whenever open questions remain | Confirmed conditional workflow. Most intake questions are already model-generated, so claiming a universal hardcoded interview would be wrong. The foreign-post override can force an irrelevant opinion for factual reuse. Preserve non-invention of personal views, but let the model decide whether one is needed for this task. | `j9p5.4` |
| A8 | `intake/research-intent.ts:195–205` interprets metadata/future wording and quote/date arrangements as rejection rules; `research-digest.v3.ts:44–83` removes rejected findings | A local counterexample admits “we launched Alpha” with its date, but adding a neighbouring sentence about Beta's future retirement changes the same known release to `unknown_date`. This is a synthetic false-negative mechanism, not proof that this exact text occurred in production. Let the model interpret event/announcement/date context with source spans; keep source-existence/quote-fidelity and explicit interval validation. | `j9p5.2` |

## Target responsibility split

The model resolves user intent, context roles, relevance, evidence sufficiency,
what to read/search next, what facts to use, draft structure, useful questions
and whether the requested result has actually been reached. It can make routine
reversible editorial decisions without a compulsory fact-by-fact manual gate.
Explicit user review/selection requirements and personal/external decisions
remain real constraints.

Code exposes faithful readable inputs and actual tool results, performs the
chosen typed operations and checks identity, tenant/role, ownership, explicit
external-action consent, real quotas/accounting, quote/source integrity,
concurrency/version checks and idempotency. These are execution invariants,
not a dictionary of allowed ways to ask for work. Source text remains untrusted
data even when the model may reason about it.

No unlimited execution is proposed. Replace the one-operation ritual and a
tiny task-semantic step ceiling with an explicit bounded execution policy tied
to the real allowance, elapsed time, tokens/cost and progress. Retain an
emergency loop fuse and honest recovery when it fires. The exact budget policy
must be grounded in the existing billing/configuration before implementation;
no new numeric spending allowance is invented by this audit.

## Plan and proof

The [same plan](../../../docs/superpowers/plans/2026-10-18-delta-news-research-and-telegram.md)
and epic retain the original six task identities. Two material independent
boundaries are added: context access/memory (`j9p5.7`) and execution-budget
policy (`j9p5.8`). Both feed the final varied natural-request acceptance.
Original history, native cards and existing working workflows are regression
requirements, not reasons to preserve a proven semantic failure.

The exact incident model is documented in
[model-attribution.json](evidence/model-attribution.json):
`openai/gpt-6-luna` through OpenRouter in all four recorded roles. No route was
changed. Model capability after repairing interfaces remains an empirical
quality question; this failure does not justify blaming or replacing it alone.

The [local counterexamples](evidence/autonomy-counterexamples.cjs) make no model
or provider calls. They demonstrate the slot stop, last-step tool disablement,
labelled context loss and event-quote rejection in isolation. They are audit
diagnostics, not a passing product regression suite or a production quality claim.

graph-reviewed: focused admission, steps, open-question and event-admission
queries oriented this review; exact cited code was then read in this checkout.
The graph was not rebuilt and no application source was modified.
