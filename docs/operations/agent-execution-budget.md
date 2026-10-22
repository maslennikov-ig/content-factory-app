# Assistant execution budgets

The assistant may finish several requested paid operations in one message.
An approval answer does not grant a different numeric paid allowance. The
existing organization allowance and each domain service's admission still
apply; a turn has one `agent` ledger row and domain operations keep their own
rows. The owner confirmed on 18 October 2026 that necessary spend is delegated
to the assistant using the configured model route; there is no additional
default task dollar ceiling.

The execution mechanism is Mastra core 1.78.0 / AI SDK adapter 1.11.1. Native
`maxSteps`, `stopWhen`, `prepareStep`, `onStepFinish`, model timeout and
`abortSignal` enforce technical fuses. There is no replacement task scheduler.

Owner direction on 20 October: Luna remains the primary model. Poor results
require checking task/source handoff and channel rules before considering a
more expensive route. The local Sol diagnostic override was removed after the
Telegram repair; its accepted Sol outputs are not evidence of repaired-chain
Luna quality. After the local comparison, the owner21October replaces MiMo
with **GPT-6.1 Sol, medium by default**, for complex service-managed work.
`content-factory-next-x9q2` changes the shared fallback and owned local instance
setting to `openai/gpt-6.1-sol`; production has not been changed. Included
OpenRouter text defaults to Luna, then Sol6.1 through the existing ordered
fallback mechanism. Our Sol6.1 attempts are **Flex-only**, including native
fallback entries whose ordinary Flex switch is off. They pin `openai/flex`,
disable provider fallback and never add a Standard Sol attempt.
A confirmed failure can advance within the existing
allowance. This does not authorize replaying an uncertain provider response.
Code and editorial review can happen in the existing Codex conversation without
an extra application-key model call. Explicit operator overrides remain in
force. Own-key workspaces keep their own primary/role models and fallback
settings, including explicit empty chains and an explicitly selected MiMo
single-model fallback. They do not inherit this service-managed fallback.
This change does not install an automatic quality-escalation loop.

For important work the owner permits discounted **Flex**, or **Batch** for
asynchronous work. The installed route is Flex; Batch remains an uninstalled
alternative. Luna remains primary. This does not authorize silently moving a
discounted Sol call to Standard. Default reasoning is explicitly medium;
existing explicit caller reasoning settings remain authoritative.

Current official OpenAI documentation confirms that
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
supports medium reasoning, and that both Batch and Flex token rates are50%
below Standard in the [direct API pricing](https://developers.openai.com/api/docs/pricing).
[Batch](https://developers.openai.com/api/docs/guides/batch) uses asynchronous
jobs with a24-hour completion window.
[Flex](https://developers.openai.com/api/docs/guides/flex-processing) trades
latency and capacity availability for Batch-rate tokens. These are alternative
processing modes, not two discounts to stack. Context tier, cache writes and
actual token consumption still affect the bill.

The21October local comparison confirms four Sol6.1 writer calls returned
`service_tier=flex` through OpenAI, with generation receipts and actual costs.
The compiled native single-model transport also returned and parsed a synthetic
tool call on that route, without executing the tool. Actual local settings,
configuration and SDK readback confirm Luna primary and Sol6.1 fallback.
Full conductor/intake/review/save qualification is not established by these
targeted calls; earlier semantic-review defects stay open in
`content-factory-next-eqh5`. The transport does not submit Batch jobs.
Preserve uncertain-response/retry guards; direct OpenAI pricing alone never
proves an OpenRouter discount.
For direct GPT-6.1 Sol tool calling, the model documentation requires Responses;
Chat Completions supports it without tools. Provider/API compatibility must be
qualified for the actual caller. The targeted OpenRouter SDK tool-call probe
qualifies that narrow compatibility boundary; it is not direct OpenAI Chat
Completions tool support or a full agent-flow acceptance. Credentials and key
allowance are unchanged. See the
[local Sol comparison and limits](../reports/benchmarks/2026-10-21-luna-sol61-telegram.md).

| Environment setting | Default | Meaning |
| --- | --- | --- |
| `CF_AGENT_TASK_MAX_DURATION_MS` | `3600000` | Shared request wall time, including approval legs. Active run/thread claims renew while work is in flight; the maximum technical fuse is `86400000` (24 hours). |
| `CF_AGENT_TASK_EMERGENCY_MAX_STEPS` | `64` | Emergency native loop fuse. The final step retains its tools. |
| `CF_AGENT_TASK_MAX_IDENTICAL_TOOL_RESULTS` | `3` | Stop after the same tool, arguments and returned value provide no new information three times in this execution. Native memory and skill tool results participate. Only digests are retained. |
| `CF_AGENT_TASK_MAX_TOKENS` | unset | Optional threshold for reported prompt plus completion tokens across the conductor and nested domain operations. Reasoning and cache subcounts are not added twice. |
| `CF_AGENT_TASK_MAX_COST_USD` | unset | Optional threshold for provider-reported known USD across this execution. Missing price stops further automatic paid work only when this threshold is configured. |

Each native model answer, including structured tool arguments, requests at most
16,384 visible output tokens. A smaller configured remaining total token
threshold reduces that per-call ceiling. This does not create a total task
allowance or change observed prompt/completion accounting. The shared transport
still adds its existing reasoning headroom and applies model output limits.
An omitted per-call ceiling could reserve the provider's whole output window
and reject an affordable short answer before generation started.

The generation graph also bounds its small structured helper answers: category
and topic each request 512 visible tokens; the one/two-sentence hook requests 2,048.
The complete post retains its independent core/format-aware output allowance;
these helper ceilings do not truncate the supplied source corpus or replace
the channel's character limit and semantic completeness review.

All configured values must be finite and positive; step/token/time/repetition
settings must be safe integers. Invalid settings refuse execution. The duration
cannot exceed 24 hours; the existing active-claim renewal remains required.

Native task text calls share that remaining time, including nested domain
calls and own-key/OpenAI clients. The legacy 25/60-second soft fallback waits
do not prematurely turn a healthy native model wait into an uncertain failed
task. Cached SDK clients use a stable task ceiling; each call still inherits
the remaining task signal, and direct SDK text options use the remaining time.
Outside this task scope, standalone transport deadlines remain unchanged.
An actual lost response or task expiry keeps its uncertainty and is not
automatically replayed.
The shared SDK transport also applies the task signal and pre-call admission
to non-chat endpoints such as image generation. They retain their own domain
usage accounting and do not enter the text retry chain.
An image refused by the server preflight before HTTP (including the SDK's
wrapped error) adds no phantom possibly-billed attempt. Already incurred
prompt charges remain; a lost response after the image request was sent
still retains uncertainty and blocks automatic replay.

The optional dollar and token thresholds are observed thresholds, **not**
prepaid hard caps. Provider prices and maximum output limits are not configured
for every model/engine. An admitted operation can contain several provider
calls and may cross a threshold before its usage arrives. The next provider
attempt is refused once the threshold is observed. Tavily credits remain
credits; missing USD is never treated as a reported zero. Provider retries and
fallbacks retain their existing persistent accounting.

A lost provider response sets `possiblyBilled` and prevents automatic fallback
or replay of that uncertain work. A definitive pre-work refusal releases the
in-flight domain permit. A started paid operation returning failure without
that proof stops automatic paid replay. Successful empty/partial research
remains an ordinary result for the model to assess and refine.
The intake may also return `canReviseInput: true` for a definitive refusal
before the artifact write. That proof permits revised arguments in the same task;
it does not erase already incurred extraction/search charges. The adapter
forwards only the server's exact boolean, and a prior uncertain-provider stop
still wins. Missing proof or a thrown persistence error stops automatic replay.

The web request shares one atomic in-flight paid-domain permit, while native
tool concurrency is one. Settling an operation releases the permit for the next
requested operation. Another call cannot release an owned permit. Monthly
included admission remains the existing serializable count-and-insert; BYOK
and explicitly unlimited organization modes keep their configured semantics.
Search in this trusted task scope uses the actual source-aware AiUsage
admission rather than the legacy monthly placeholder counter of 20/10/3
searches. The scope marker is internal and requires the active execution
budget callback plus the real admission method. HTTP/tool arguments cannot set
it. Legacy/manual search retains its existing counter; failing the actual
allowance still refuses before an outbound request.

On a technical stop the result is incomplete, with a reason, preserved
confirmed results and remaining work. The controller must record a failed or
interrupted terminal receipt, not `completed`. Stop/timeout cannot undo a
persisted write or cancel every service promise: the existing lifecycle still
waits for real capability promises and keeps uncertain outcomes guarded. A
continuation must read those receipts and existing artifacts before acting.
A user Stop is interrupted; a failed late service write remains failed. An
exact pre-write revision proof does not permanently fail an otherwise
successfully recovered turn. An unknown refusal or exception still does.

Changing these settings or reverting the policy source needs no database
migration. Existing operation ledger rows, approval fingerprints, native
suspended runs and thread history stay intact. Never replay an uncertain write
as a rollback or budget reset.
