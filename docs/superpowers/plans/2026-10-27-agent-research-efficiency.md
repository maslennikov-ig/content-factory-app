# Agent research efficiency and recoverable failures

**Date:** 2026-10-27

**Task:** [HONEY-6013](https://linear.app/elwork/issue/HONEY-6013), `content-factory-next-bods`, P1 bug.

**Scope:** implement HONEY-6013 through local acceptance, authorized by the owner on27October. No paid calls, push or deployment. Preserve the current chat, unrelated changes and running services.

**Implementation:** isolated branch `codex/honey-6013-20261027`, worktree `/home/me/code/content-factory-next-worktrees/honey-6013-20261027`. The original dirty checkout is preserved. [Local outcome and limitations](../../../.codex/stages/honey-6013/implementation.md).

**Additional owner direction:** Terra6.1 becomes the primary model; reasoning levels are delegated. Use Terra medium for substantive roles and Luna low only for simple classification through the existing role settings. Persisted operator/own-key selections remain explicit overrides; production settings are outside this local task.

**Source baseline:** private `origin/main` at `43f8607e92f15cf4adbeb96d720d2eadf862f0c9`, functional change `b458f7883bf18115b65dc23500337f9d79a8960a`. The original checkout remains at an older, dirty baseline; implementation must start from current main in an isolated checkout.

**Goal:** let the agent assess useful research immediately, retrieve only necessary evidence, and reach the requested saved artifacts with less repeated context and a truthful, recoverable terminal state.

## Evidence and limits of the diagnosis

A read-only audit of an owner-reported production request found:

| Observation | Measured value |
| --- | --- |
| Time before failure | about 199 seconds |
| `research_search` | one call, 60.142 seconds |
| Conductor model inference | 111.742 seconds across the recorded attempts |
| Saved-result JSON reads | five `readConversationHistory` calls |
| Retained source reads | eight `piece_read` calls, each below 0.11 seconds |
| Search result | 50 sources; full projected-result receipt about 97,000 characters |
| First model-visible research result | `summary: { savedResultAvailable: true }` |
| Agent ledger input tokens | 401,251 aggregate, including repeated input; 194,829 cached |
| Final failure | provider API-key total spending limit exhausted |
| Saved requested artifacts | no new piece in the inspected turn window |

The search succeeded. Its assessment was partial; 50 sources do not mean 50 verified findings. Source reading was fast; each subsequent model decision cost roughly 11–16 seconds. The provider limit caused the final failure, not the preceding 199-second duration. The recorded model cost in that interval was about USD 0.366; the reported USD 9.01 was cumulative key usage.

Confirmed mechanism: `projectNativeToolResult` reduces individual strings but retains all arrays and machine identifiers. If the result still exceeds 32,768 UTF-8 bytes, its final fallback removes the useful research summary, assessment, `snapshotKey`, and direct read instructions from `summary`. The native receipt survives, but the model must recover meaning from serialized JSON. The five JSON reads are observed; their complete causal contribution to every model decision is not proven.

The 401,251 tokens also include instructions, tool schemas, history, and other context. Do not attribute the whole amount to research or promise a specific latency improvement before measuring those components. Provider latency, search latency and application overhead are separate measurements.

Private originals, full source captures, chat identifiers and provider details remain outside Git. Evidence manifest: `~/.local/state/content-factory-next/research-efficiency-20261027/manifest.private.json`. The original audit is frozen; no production retry, paid inference, settings change or chat mutation was performed.

### Additional incident — continuation without an executed tool

A fresh read-only audit of the next explicit continuation found a different
failure boundary on the same deployed version. The trace ran for 563.835 seconds.
Luna first read conversation history in 0.014 seconds, then spent 546.138 seconds
in one inference, predominantly its tool-call stream. That inference reported
24,576 output tokens and `finishReason: tool-calls`; no subsequent tool execution,
new piece or usable assistant answer was recorded. The saved execution is failed,
while its native pointer still says running. No provider-limit error was recorded
for this continuation, so the previous spending refusal must not be presented as
its proven cause.

The Memory token limiter removed the prior author/assistant rows from the active
prompt. The explicit history read recovered the original author text, but its
text-only view exposed the previous tool-only assistant response as empty; it did
not recover the saved research references. This is a second continuation case to
cover, distinct from retaining a suspended checkpoint.

The exact generated tool name/arguments and terminal parsing/validation outcome
are absent from the persisted diagnostics; the native replay and completed
workflow snapshot were already gone. Whether the call was truncated, invalid,
unavailable, or lost at a later adapter boundary remains unproven. The reported
output also exceeds the span's requested 16,384-token parameter. Local transport
inspection confirms its existing 8,192-token reasoning headroom makes that
visible budget24,576 on the wire. The actual original request body was not
retained, so this arithmetic alone does not prove the exact production cutoff.
Do not infer a successful tool from finishReason.
Private evidence: `~/.local/state/content-factory-next/chat-audit-latest-20261027/summary.json`.

## Decision and alternatives

Use the existing Mastra model-output and history processors. Return a domain-aware bounded research overview before the generic byte limiter, retain exact evidence in the existing authorized capture/receipt paths, and preserve the terminal provider category through native error metadata.

| Alternative | Decision |
| --- | --- |
| Domain-aware `toModelOutput`/summary, structured evidence reads, existing `ToolCallFilter` | Recommended: removes the confirmed discovery failure without another inference layer or executor. |
| Raise the generic payload/context limit or retain full pages on every turn | Reject: repeats the material, adds memory/cost, and postpones the same overflow. |
| Add a paid summarizer, forced top-N source selector, or a new research workflow | Exclude from the first implementation: existing research already produces a summary/assessment, and semantic selection belongs to the model. Reconsider only with measured evidence of a remaining gap. |

Mastra `@mastra/core@1.78.0` already exposes `createTool.toModelOutput`, display/transcript `transform`, `ToolCallFilter({ filterAfterToolSteps, preserveModelOutput: true })`, `processLLMRequest`, and processor `abort(..., { metadata })`. The application already uses these APIs. `transform` affects display/transcript; `toModelOutput` is the model-facing boundary. Do not confuse the two or introduce a replacement execution system.

Documentation checked through Context7 on 27 October and confirmed against installed 1.78 declarations:

- [Mastra tool outputs and transforms](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/reference/tools/create-tool.mdx).
- [Native tool-history filtering](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/reference/processors/tool-call-filter.mdx).
- [Processor abort metadata](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/reference/processors/processor-interface.mdx).

The owner Graphify map was queried read-only for `NativeToolResultPromptProcessor` and `researchSearch`. It is based on `dd67538d` and has no matching nodes. Current source, not the stale graph, establishes the boundaries below. Graph review is complete for this planning change; no refresh or external extraction is required.

## Intended data flow

1. The existing research service searches and stores an authorized capture as today. Use its actual summary, source/date assessment and gaps; generating another summary is not a mandatory extra model call.
2. The research capability supplies a compact model view containing outcome, `snapshotKey`, level, a useful summary, assessment/coverage state, source/fact totals, and enough source-linked entries to decide the next action. Clearly distinguish captured passages, assessed claims and selected facts.
3. Bounds apply to serialized UTF-8 bytes and list cardinality as well as prose. Mandatory control fields and the summary survive even with 50+ long URLs, revisions and multilingual titles. Optional detail is paged explicitly, with totals and a usable next reference; it is never silently presented as the complete evidence set.
4. Read sources, facts and detailed assessment through existing `piece.read` by snapshot, source index/URL, fact key, revision, `find`, or range. Add a small structured index/page option to that same scoped read capability if the compact overview cannot expose the complete index within budget. Preserve existing inputs; do not add a second generic JSON-query tool. No normal flow should require JSON string offsets merely to discover the research id, summary, or source index.
5. Keep raw/full results and native committed receipts intact. `toModelOutput` and the existing transient filter shape outgoing prompts only. Historical messages, cards, pending input and approvals are unchanged. The existing provider-boundary processor continues to prevent duplicate model/display/transcript payloads.
6. Once the model has sufficient evidence, continue the original request through `piece.create.from-research` and the existing adaptation flow, passing the original `requestMessageId` and owned evidence references. Confirm saved results by reading them. A new search is justified by an actual evidence gap; source reading is justified by a claim to verify. Do not impose a fixed number of reads or a scenario-specific completion detector.

Keep the existing 32,768-byte ceiling as a technical serialization guard, not an editorial sufficiency gate. Do not increase it as the repair. Inspect actual prompt composition before changing the existing filter window, tool-discovery scope or per-step budget. Do not shorten the original request, remove relevant author instructions, alter chosen models, or change research depth defaults to obtain an artificial speed result.

## Failure and continuation contract

- Native retries stop on a real non-transient provider refusal as today. Carry a sanitized structured category/status through serializable processor state and TripWire metadata, rather than keeping only `error.message`. Do not put provider key URLs, raw responses or stacks into browser events.
- Map a payment/key-limit refusal to the existing `AI_PROVIDER_PAYMENT_REQUIRED` presentation. Authentication, temporary overload, content refusal, timeout and user Stop stay distinguishable. A spending refusal must not look like secret detection, generic failure, overload or success.
- Include the actual provider's structured key-limit refusal: the initial incident used HTTP 403 with `limit_source: openrouter_key_limit` / `scope: key_limit`, not HTTP 402. Preserve this classification in the provider adapter; do not interpret every 403 as a spending failure or match arbitrary user prose to decide it.
- After a terminal refusal, do not try another model or launch a paid routing/classifier/goal-check request merely to explain the failure. Use native lifecycle callbacks and existing error presentation. No additional model is needed to word a known infrastructure error.
- Reconcile task state to its actual terminal outcome; absence of a workflow snapshot is not success. Reload and observe perform no model/tool work. The settled execution must govern the UI even if an old native pointer says `running`.
- Explicit continuation after the provider problem is resolved uses the same history, original request, confirmed artifacts and still-valid evidence. Confirmed writes are not repeated. Unknown write outcomes require receipt reconciliation, not a retry.
- A tool-only prior assistant response must retain a useful compact recovery view through native model-output/history APIs even when raw old messages leave the active prompt. Incomplete/invalid tool calls must produce a truthful terminal outcome or the existing bounded native repair path, never a silent empty finish. A model finish label is not a tool-execution receipt.
- Existing standalone captures expire after one hour. A cold restart within their lifetime must read the same authorized evidence. After expiry, do not promise that a receipt of compact previews recreates every original page. Return a precise unavailable/expired state and retain confirmed results; do not silently repurchase search on a reload. Indefinite research retention or a new storage service is outside this task. A separate retention decision is necessary if the owner later requires continuation beyond the existing lifetime.
- Questions continue via native suspend/resume, with original options/custom answers/decide-for-me behavior. Preserve current per-step instructions and trusted interface locale. Infrastructure copy must respect all supported UI locales without changing the language of the requested post.

## Implementation plan

This is one root-owned task. The following are cohesive implementation parts, not a new epic or independent proof-only tickets.

### Part 1 — Useful bounded research and prompt context

**Files:** `libraries/nestjs-libraries/src/chat/capabilities/catalogue/{research.capabilities,research-evidence,material-read.capabilities}.ts`, `chat/capabilities/mastra.adapter.ts`, `chat/conductor/{native-tool-result,conductor.agent}.ts` under the same shared library. Touch generic projection only for common structural safety; research semantics stay in its capability.

- Capture a before/after prompt-size breakdown with the same current instructions, models, tool configuration and evidence. Attribute system instructions, schemas, history, source bodies, metadata duplication and raw/compact outputs separately. Record aggregate/cached input and inference count separately.
- Fix the large-result fallback so the first model response remains useful and directly readable. Preserve all sources through explicit pages/references instead of hiding a tail or keeping all rows until the summary disappears.
- Reuse native model views and transient filtering for obsolete detailed tool outputs. Selected supporting passages, original request and completion receipts remain usable. Keep exact source revisions and untrusted-data wrappers.
- Read independent selected sources in the same native model step when appropriate. Do not globally raise tool concurrency: the current serial executor also owns writes, permissions and approval ordering. Batched existing native calls avoid extra inference cycles without changing side-effect contracts.

**Proof:** extend `tests/agent-native-output-projection.test.cjs` and its real native helper, plus affected capability adapter/research tests. Cases include 50+ sources, many identifiers, Cyrillic/non-Latin data, oversized assessment, empty/partial/conflicting evidence, a useful source beyond the first page, later source paragraphs, storage failure, foreign owner and stale revision. The complete source body remains exactly readable, and discovering the summary/id/index requires zero raw-result JSON reads.

### Part 2 — Actionable terminal errors and safe continuation

**Files:** `libraries/nestjs-libraries/src/openai/ai.native-retries.ts`, `chat/conductor/{conductor.errors,native-session-stream,agent-threads.service}.ts`, `chat/mastra.service.ts`; existing frontend agent error/state consumers and locale files only as required by the reproduced boundary.

- Preserve the safe terminal category across native error/replay boundaries and prevent post-refusal paid classification. Keep existing retry/fallback behavior for genuinely transient errors.
- Ensure the saved task/UI state survives reload, Stop and process restart, with the true reason and confirmed results. Use the existing Mastra Session, DurableAgent, native receipts and lifecycle callbacks; no manual production metadata edits.
- Continue the original saved-artifact path after an explicit authorized continuation; distinguish missing/expired evidence from failed effects and ambiguous writes.
- Reproduce the additional continuation boundary with test-only incomplete/invalid tool-call streams and available native history. Use existing tracing for bounded diagnostic attributes: tool name/id, argument byte count, parsing/validation outcome, native finish category and delivery/execution status. Do not log raw arguments, user content or full model output. Determine the missing boundary before choosing a repair; no new observability framework or paid reproduction is necessary.

**Proof:** extend relevant existing native retry, HTTP/cold-session, Stop, current-instructions and UI suites. Inject a test-only provider 402 after successful research, then prove: no fallback/classifier after refusal; payment copy without secrets; no inference on GET; intact history and approvals; one explicit continuation; exactly one confirmed piece/adaptation write; truthful expired-evidence behavior. Test transports belong only to test infrastructure and are not product model substitutes.

### Part 3 — One integrated local acceptance and measurements

**Files:** reuse the affected native probe helpers and existing scenario fixtures; add one small research-efficiency fixture/report helper only if current helpers cannot record comparable prompts. Avoid a new benchmark framework, persistent payload telemetry, or prompt snapshots containing private originals.

- Run one local native Session + isolated PostgreSQL/Redis flow using a sanitized 50-source fixture, the original request constraints, meaningful question/answer, source selection including a later page, saved core plus Telegram draft, simulated refusal/restart, explicit continuation and Stop.
- Capture a native 402-to-UI event path; testing `conductorErrorCode` alone does not prove the producer or adapter preserves the error.
- Also cover structured key-limit 403 versus ordinary authorization 403, and a continuation whose model stream ends with an unexecuted tool call. Preserve useful compact research references after Memory trims raw tool history. Verify the outcome through native execution and persisted state, including after replay has expired.
- Compare baseline and candidate on identical chosen evidence and model decisions. The first useful research result stays within the existing byte guard; there is no JSON discovery detour; total serialized provider input and estimated input tokens are lower on the comparable path, with a per-component explanation. Fewer bytes alone do not prove end-to-end model speed or editorial quality.
- Report source-search duration, model time, model steps, payload bytes, raw/cached input, known cost and application overhead separately. Show any remaining cost of instructions/schemas; do not hide it behind cached-token totals. Do not adopt a hard task timeout, compulsory reread count or new quality blocker to meet a target.

**Focused commands on the implementation baseline:** use Node 22.23.2 / pnpm 10.6.1; invoke the actual Jest config with exact changed suites via `pnpm exec jest --runInBand --runTestsByPath ...`; include `tests/agent-native-output-projection.test.cjs`, `tests/agent-native-retry-routing.test.cjs` and `tests/agent-native-conversation-flow.test.cjs`, then add only touched lifecycle/UI suites. Run backend TypeScript and frontend TypeScript only if that surface changes. Reuse unchanged native cold/Stop evidence; rerun it when relevant lifecycle inputs change. Finish with `git diff --check` and scoped document/link checks. Full builds/suites and process verification belong to a separately authorized release gate.

## Acceptance ledger

| Criterion | Owner / evidence |
| --- | --- |
| First research response retains meaningful summary, status, snapshot and direct reads within the byte limit | Part 1; actual native tool/model output with the adversarial large fixture |
| All sources remain discoverable; exact later-page passages retain provenance and access checks | Part 1; structured read and native receipt round-trip |
| Old detailed results do not inflate every prompt or destroy original instructions/history | Parts 1 and 3; native provider-boundary prompt comparison and exact history readback |
| Search can lead to the requested saved core and Telegram draft, through a real question/answer | Part 3; local native flow and artifact readback; no social publication |
| A 402 is actionable, does not retry/classify, and remains terminal after reload | Part 2; produced native events through actual UI consumer |
| Stop, restart, explicit continuation and expired evidence are truthful and do not duplicate writes | Parts 2 and 3; cold lifecycle, GET-zero-call and committed-receipt checks |
| Measured comparable input/steps improve without dropping required evidence or changing models | Part 3; before/after breakdown with unchanged scope |
| Actual production latency and editorial quality on configured providers | Separate owner-authorized paid qualification, not claimed from offline fixtures |

## Boundaries, rollback and remaining gates

Implementation and offline local acceptance are authorized. Paid acceptance, push and production release remain separate, unauthorized steps. No production budget/key/model/search settings, provider wiring, foreign edits, existing chats or saved artifacts are changed. The new UI preview is task-owned; other services stay running.

Do not hardcode a chat, vendor announcement, topic, domain, date, source order or output text. Do not add a planner/router/executor, automatic quality blockade, paid compression loop or parallel ledger. Source relevance and evidence sufficiency remain model assessments; exact identity, access, receipt, byte and citation checks retain their technical purpose.

Prefer additive read/projection changes with legacy input support. Existing native receipts and old suspended runs remain readable. No schema migration, SDK upgrade/patch, or Temporal workflow contract change is planned. Rollback restores the prior projection/filter/error adapters without deleting history or captures. Search providers and selected production models remain as configured. The separately requested Terra/Luna default policy is local source/configuration work; applying it to an existing persisted instance requires its ordinary settings update at an authorized rollout.

Related open work `content-factory-next-eqh5` qualifies provider/editorial behavior and is not completed by this task. `content-factory-next-ij4n` addresses false research date warnings; preserve its honest gap semantics. Closed `content-factory-next-hbe3` owns current resumed instructions and is a regression constraint, not a task to reopen.
