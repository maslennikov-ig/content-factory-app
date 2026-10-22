# Local Telegram comparison: Luna and MiMo, 21 October 2026

## Outcome

The two original requests were attempted on both models, using the accepted
Telegram integration at source13a97d3eb. Native original-request acceptance was
**0/4**. A separate controlled adaptation stage on shared existing Sol cores
also accepted **0/4**. Two exact-request standalone MiMo replays subsequently
returned complete first drafts. Those are diagnostic writer outputs, not native
review/save or fallback acceptance.

Editorial reading prefers Luna in case1 and slightly prefers MiMo in case2.
Neither first draft is publication-ready. These two samples show no consistent
MiMo quality advantage. At the observed four-call first-draft stage MiMo cost
about3.08times Luna; this excludes failed-call exposure and subsequent review.
No application source, production config, key limit, service model policy,
publication, push or deployment was changed.

Full private Russian report, all four unchanged first drafts, original versions,
raw requests/responses, failures and generation receipts:
`/home/me/.local/state/content-factory-next/luna-mimo-comparison-20261021/comparison.md`.
Do not copy customer inputs, author profile, env or credentials into Git.

## Method and comparability

- Both chats contain the same2,553-character original request. Case1 retains
  its11-source/56,363-character corpus; case2 its9-source/43,320-character corpus.
  No fresh search was run. The task cutoff is20October, not a current-news claim.
- Original-request runs use actual `IntakeService`, `PieceService` and
  `AgentGraphService` in a local Nest application context and ask the chosen
  model to generate the core anew. Frozen server-owned literal source passages
  are supplied through the existing research-reuse boundary.
- Separate adaptation pairs share the identical previously accepted Sol core
  for their case. They establish writer behavior only, not successful core
  generation by Luna/MiMo. Body prompts differ within each pair only by each
  model's own earlier hook; schemas and remaining message text match.
- Intended avatar, channel and frozen evidence are verified before calls.
  Prompt rules:2,000–3,500 ideal characters,4,000hard ceiling,12–35emoji,
  maximum one final link, one question, no hashtags, at most two short bold
  spans. The legacy `addressForm=ty` field is deliberately not consumed by this
  product version; do not score `vy` as a model instruction violation.
- `openai/gpt-6-luna` requests `reasoning.effort=medium`.
  `xiaomi/mimo-v2.6-pro` uses provider-default reasoning. Flex/Batch were not
  requested. Cross-model fallback and configurable retries are disabled only
  in the isolated benchmark; normal bounded structured-output retry and one
  semantic repair remain in the native path.
- Luna ran through OpenAI. Successful MiMo prefix calls used DeepInfra,
  GMICloud and Xiaomi; both completed standalone main texts used Xiaomi.
  Provider routing, reasoning semantics and cache state are confounders.
- Rubric frozen before paid calls: assignment25, evidence25, pledge/reset15,
  Telegram15, voice10, readiness10. Root Codex judged without a paid evaluator;
  this was not fully blind. One observation per cell does not establish a
  stable model ranking or equivalent internal reasoning.

## Native results and diagnostic first drafts

| Original-request cell | Observed terminal result |
| --- | --- |
| case1 Luna | `INTAKE_INPUT_INSUFFICIENT`: demanded a fuller timeline and the end of the28-day series; no core/post |
| case1 MiMo | first extract timed out around180s; no complete answer or generation ID |
| case2 Luna | regenerated core;9calls; adaptation rejected after repair for unsupported official attribution and an emoji-count finding |
| case2 MiMo | first extract timed out around180s; no complete answer or generation ID |

In adaptation-only runs Luna produced/reviewed/repaired both posts, but both
were rejected. The last case1 hook expanded the reset claim; the last case2
review demanded several directly verifiable source links despite the writer's
one-link rule. MiMo completed the first three calls for each case, then its
first body call timed out at180s in case1 and lost its connection at about119s
in case2.

The owner authorized a standalone600s deadline for those exact two body
requests. Their JSON hashes match the timed-out payloads. Responses completed
at175.1s/107.5s, with almost all prompt tokens cached. They completed below the
old180s cap on this retry, so a larger timeout alone is not proven causal.
No application timeout was changed. Each body is paired with its original
native hook using actual `withAdaptationOpening`, without editorial changes.

| First writer draft | UTF-16 characters | Editorial score /100 | First4successful calls | Main body only | Body duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| case1 Luna | 3370 | 81 | $0.00844787 | $0.00317387 | 77.3s |
| case1 MiMo | 3168 | 73 | $0.02673076 | $0.00803105 | 175.1s |
| case2 Luna | 2358 | 71 | $0.00607447 | $0.00242394 | 65.2s |
| case2 MiMo | 2987 | 74 | $0.01795844 | $0.00452717 | 107.5s |

The four-call amount includes two preparatory calls, hook and body, before
semantic review/repair. MiMo combines its successful prefix and standalone
body replay; the prior failed body remains additional unknown-cost exposure.
It is not a completed-pipeline unit price. Sum: Luna$0.01452/MiMo$0.04469.

Luna case1 is more careful about reset conditions; MiMo case1 introduces a
misleading five-resets-versus-ten-improvements count from a non-exclusive
tracker. Both overstate the official status of a community pledge rebroadcast.
MiMo case2 explains Composer/CLI better, but makes desktop-feature exclusivity
unconditional where the source qualifies it. Both case2 drafts leave the
requested reset mechanics largely unexplained, inheriting a weak shared core.
Luna case2 also exceeds the actual two-bold-span rule. Internal research-status
phrasing remains in multiple drafts. Failed automatic reviews are retained
separately from root editorial findings; neither is silently substituted for
the first writer output.

## Cost evidence and uncertainty

| Stage | Known provider cost | Calls with unknown cost |
| --- | ---: | ---: |
| Original-request runs | $0.037773344 | 2 |
| Shared-core adaptation runs | $0.070939418 | 2 |
| Two standalone MiMo replays | $0.012558212 | 0 |
| Three invalid setup pilots | $0.025458076 | 0 |
| **Total lower bound** | **$0.146729050** | **4** |

39requests were sent. All35completed generation IDs reconciled successfully
through the provider's read-only generation endpoint. Four incomplete MiMo
calls have no returned generation ID/cost; they may have been billed. Unknown
does not mean zero. API `usage.cost` and generation receipts are both retained;
the latter round to9decimal places. Shared-key balance movement was never
attributed exclusively to this task.

Three setup pilots were invalid because the harness mistakenly assigned the
text model to the image role too, making the transport take image passthrough
and omit text reasoning/headroom. The harness was corrected, actual outgoing
parameters rechecked, and all three paid pilots excluded from quality results
but included in spending. An initial explanation blaming disabled fallback
was disproved and explicitly corrected in the private diagnostic.

Cache must remain visible: MiMo replays read18,688/18,720 and13,824/13,912cached
prompt tokens. Luna adaptation calls charged cache writes; earlier pilots
warmed the first original-run input. The private report includes a catalog
input/output estimate without caching, separately labelled as an estimate
excluding cache-write charges and route differences, never an invoice.

The product ledger has13new terminal operations (3succeeded/10failed), with
four `possiblyBilled` failures and known recorded$0.10871277. It is not the full
network invoice: the standalone replays and invalid pilots are accounted for
separately. Zero new `Post` rows were saved.

## Remaining qualification and closeout

Open follow-up `content-factory-next-eqh5`: align intake completeness with the actual past-period cutoff;
reconcile semantic review with the one-link channel contract; preserve
supported statements while repairing a specific finding; qualify the native
MiMo fallback through billed-aware deadlines/routes and actual review/save.
Do not increase retries or resurrect intentionally removed address settings.
The configured Luna→MiMo policy remains unchanged, but this test does not
qualify unattended publishing or a reliable native fallback.

All8original/accepted files, source private env and both original database
pieces/derivations/posts, avatar, channel, instance/workspace settings and all
103original usage rows are hash-identical. Both shared cores in the isolated
clone also remain unchanged. Originals and all intermediates stay private.

Only the two new task-labelled Redis/Temporal container IDs were stopped after
all model work settled; their containers and both benchmark DBs were retained.
No foreign container IDs disappeared during this scoped stop. No modification
or stop targeted the active `j9p5-model-led-20261018` checkout, dependencies or runtime.

The ordinary backend build failed on TS2742 declaration portability with linked
`node_modules`. JS runtime compilation with `--declaration false --incremental
false` succeeded and supported the local calls. This is not a passing standard
build, browser/conductor proof, release verification or production acceptance.
Final acceptance is the root-owned artifact/cost/preservation and docs check,
not another release suite. Product source remained frozen throughout.

docs-reviewed: updated — this result supersedes the earlier untested-model note;
full customer inputs and model outputs remain in private local evidence.

graph-reviewed: used — focused read-only model-routing orientation used the
repair owner's graph; current files and actual payloads were confirmed locally.
No durable code change or graph refresh was performed.
