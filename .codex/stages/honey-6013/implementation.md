# HONEY-6013 local implementation — 27 October 2026

Task: `content-factory-next-bods`, [HONEY-6013](https://linear.app/elwork/issue/HONEY-6013).
Branch: `codex/honey-6013-20261027`; baseline `43f8607e92f15cf4adbeb96d720d2eadf862f0c9`.
Worktree: `/home/me/code/content-factory-next-worktrees/honey-6013-20261027`.
Scope: local source and offline acceptance. No paid calls, push, deployment,
production mutation, schema change or SDK patch.

## Delivered behavior

- Large research results expose a bounded useful summary, snapshot, assessment,
  totals and direct source/fact pagination. Exact full native receipts remain
  available. No fixed top-N relevance rule or paid compression call is added.
- `piece.read` adds revision-checked source/fact pages. Exact later source ranges,
  Unicode boundaries, provenance and authorization survive projection.
- Conversation-history reads retain compact tool results and authorized native
  references. Legacy `savedResultAvailable` research results recover the overview
  from their existing receipt without rewriting stored messages.
- Native user-signal messages qualify as the original authored request after
  restart; state/assistant signals do not. Exact text and owner checks remain.
- Terminal provider errors preserve only a safe code/status through native
  processors, RequestContext, TripWire, live/replayed HTTP and stored execution.
  Structured OpenRouter key-limit403 and402 use payment copy; ordinary403 remains
  rejection. Failed preflight cannot launch a routing classifier. A fresh explicit
  message clears the previous attempt's marker.
- Public Mastra output processors detect incomplete streaming tool inputs. Repair
  uses the configured budget only when no complete peer can have executed;
  otherwise the step fails truthfully. Complete peers are never automatically
  replayed. Diagnostics retain bounded call id/name, argument bytes and incomplete
  outcome, never raw arguments.
- Terminal task and matching native pointer settle together. The existing error
  card restores its reason after reload. Stop stays interrupted, including when
  the stopped reader throws. Successor ownership stays protected.
- Additional owner request: Terra6.1 medium is the primary source default; Luna
  low is the included classification default. Existing Mastra role/model resolution
  and native fallback arrays are used. Equal primary/advanced Terra profiles skip
  redundant classification. Sol fallback/tier policy and explicit operator/own-key
  selections remain authoritative. Production settings are unchanged. The owner
  authorized local Luna profile was switched through the existing settings service.

## Running API stand

[Local chat](http://localhost:4337/agents) now runs this worktree's frontend and
ordinary API backend3516. The former4316/3516 processes were already absent;
no pre-existing process was stopped. Only the task-owned synthetic frontend4337
was restarted to connect it to the real API. The old local databases/session,
Redis and uploads are reused; no chat was cloned or reset.

The existing `InstanceAiDefaultsService.update` changed the local primary and
advanced profile to `openai/gpt-6.1-terra`, with only classification on Luna.
Live `/settings/ai` readback confirms it. Other instance fields,21 threads,
58 messages, pieces, derivations, posts and usage hashes match before/after.
Native stored runs remain4 suspended,2 canceled and5 successful; no active run
was started. Private before-row/rollback and process identities remain in the
task evidence directory. Production keys/configuration are unchanged.

The preserved chat opens in the actual browser with its existing history and
composer, without page errors. Read-only inspection blocked the automatic
workspace-context PATCH; no chat message, model invocation or search was sent.
The browser's network-error console line corresponds to that intentionally
blocked write. Historical error cards remain historical; no result is rewritten
or automatically replayed. Post-startup/post-browser history and usage hashes match.

This is a configured real-API stand; no actual model/search request was submitted
by this task. Submitting a new message invokes the provider's normal billing.
Offline question/failure/recovery proofs below remain separate from live model
qualification. Do not start the historical stand manager alongside backend3516.

## Local acceptance

Final root acceptance: PASS,15 suites/193 tests in109.925s; backend and frontend
TypeScript PASS, documentation links PASS (232 files), `git diff --check` PASS.
Focused configured-chain transport, original-author, current-instructions and
additional native Stop/tail checks also passed earlier and were reused where
their relevant inputs were unchanged. Full release suite/build was not run.
Private logs and preservation
receipts: `/home/me/.local/state/content-factory-next/honey-6013-20261027`.

The integrated scenario uses real Mastra Session/DurableAgent/Memory, isolated
PostgreSQL/Redis, actual controller/capability/lifecycle paths and Prisma artifact
persistence. Search/model transports and domain generation are controlled fixtures:
50 sources, later source43, meaningful question/answer, provider402, process death,
passive reload with zero calls, explicit continuation, exactly one core, one
derivation and one Telegram DRAFT, expired evidence and Stop. This proves execution
and persistence, not live semantic quality of generated text.

Native streams separately cover unfinished input, zero/exhausted repair budgets,
invalid/unknown calls and a complete peer alongside incomplete input. The peer
executes once without model retry. Provider checks cover401/400/402/403/429,
safe replay metadata and refusal before another routing decision. Existing
instruction-refresh and native Stop/cold-tail checks are reused for unchanged inputs.

Additional UI fixture: [Russian restored error](http://localhost:4337/interface-review/agents?state=restricted&locale=ru)
or [English](http://localhost:4337/interface-review/agents?state=restricted&locale=en).
These interface-review URLs are synthetic; the normal `/agents` URL above uses
the actual API and preserved local data.
Browser: error visible after reload, zero model calls, no page error; English
390x844 has no horizontal overflow. Screenshots were visually inspected. The
fixture uses scoped canonical i18n; production locale copy is unchanged.

## Comparable native provider prompts

The comparison uses the same50-source fixture, instructions, filter window and
eight selected source reads. Choices are scripted equally except the observed
five-turn JSON-discovery detour in the baseline. Both retain the same selected
evidence and final fixture answer. The separate Terra policy change does not
contribute to the measurement.

| Component | Baseline | Candidate |
| --- | ---: | ---: |
| Native model calls |8|3|
| Raw JSON discovery reads |5|0|
| Selected source reads |8|8|
| Total serialized provider input bytes |984672|216424|
| Estimated input tokens (`o200k_base`) |197696|42993|
| Real/raw/cached provider tokens |unmeasured|unmeasured|
| Paid provider cost |0|0|

Input is78.02% smaller on this controlled path. The same system instructions
(44403 bytes) and schemas (814 bytes) remain in each call. Repeated history and
discovery turns account for the difference; source selection stays model-owned.
These numbers do not establish production latency, token usage, compatibility or
editorial quality. Per-step breakdown: `prompt-comparison.log`.

## Review, accepted child delivery and cleanup

| Stream | Delivery accepted | cleanup_status | cleanup_notes |
| --- | --- | --- | --- |
| research_projection | Bounded overview, revisioned reads and native receipt/source tests |cleaned|Shared worktree source retained; temporary test services removed |
| provider_terminal_errors | Structured safe terminal propagation and refusal distinction |cleaned|Shared worktree; no separate disposable checkout/runtime |
| research_local_flow | Native cold flow, exact Prisma writes and metrics |cleaned|Test PostgreSQL/Redis removed in harness finally blocks |
| final_correctness | Read-only review; Stop throwing-reader and mixed-call findings resolved |cleaned|No separate runtime or source checkout |

Review found unconditional failure marking after Stop. Both streamed-error and
thrown-reader paths now guard intentional abort; regression proves persisted
interrupted outcome. Mixed-call regression proves one complete effect without
automatic replay. No unresolved blocking finding remains from that review.

Accepted source/dependencies, owned frontend4337 and backend3516 stay available.
Other stands, shared caches, foreign worktrees/services and all branch refs stay.
Original dirty files are checked by SHA256 against the private pre-task inventory.
All12 protected hashes match; no task-owned test container remains. The preview
process identities match their ownership receipts. The task-owned test browser is
closed after screenshots; the user-facing API stand and foreign services remain.
One unrelated Helixa speech container was independently recreated; this task did
not stop or revert it. No broad cleanup is performed.

## Remaining limits and recovery

- No live Terra/OpenRouter inference/search/editorial qualification;
  `content-factory-next-eqh5` remains open. Catalogue metadata is not an execution
  receipt. The exact original incomplete tool output was not retained in production.
- Standalone evidence retains its existing one-hour lifetime. Expiry is explicit;
  reload never silently buys another search or recreates missing full pages.
- Existing persisted model pins remain authoritative. Apply the new policy using
  ordinary settings during a separately authorized rollout.
- Full repository suite/build/release checks were not requested or run.
- Rollback restores prior source defaults/projection/history/error adapters without
  deleting chats/captures, reversing a schema or replaying uncertain paid effects.

docs-reviewed: updated - plan, model policy, configuration, handoff and navigation.
graph-reviewed: used - read-only owner graph at dd67538d; focused native/research
queries had no match; exact source/installed Mastra1.78 declarations were checked.
No external graph extraction or refresh at this local boundary.
GitHub sync: managed Linear/Beads server owns publication; local publisher skipped.

## Owner UI follow-up: compact progress

Task `content-factory-next-g9sh`,27October. Consecutive completed tool lines are
grouped in the existing `ProgressCard`/`Disclosure`, with only the latest status
visible initially. A following active tool becomes the summary; its Stop stays
outside the disclosure. Earlier native stages and tool statuses are available
on expansion. Text, errors, questions, artifacts and stale actions end the group;
a single completed step needs no empty disclosure. No new copy or store, native
event rewrite, model call or backend change is introduced.

Verification:43 conversation-flow UI tests PASS (RU/EN, collapse/expand, preserved
expanded state during a native stage update, Stop visibility, visible error/
artifact/text/stale boundaries and unchanged messages). Frontend TypeScript PASS.
Six affected disclosure/progress-copy/foundation/design suites passed (70 tests);
matching unchanged style/token evidence was reused after the fixture corrections.
`git diff --check` and documentation links PASS.

Real local browser:1440px and390px, six earlier steps hidden by default; mouse,
Enter and Space expand/close the history. No horizontal overflow or page errors.
The inspected saved chat's messages, pending cards and execution match before/
after. All browser mutations were blocked, including the pre-existing automatic
workspace PATCH; its expected refusal can show the existing workspace error
banner in audit screenshots. This does not affect the normal user browser.
The local frontend hot-reloaded; backend and foreign services were not restarted.
Private `compact-*` logs/screenshots remain with the existing local evidence.
