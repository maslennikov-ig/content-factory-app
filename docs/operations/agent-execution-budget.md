# Assistant execution budgets

The assistant may finish several requested paid operations in one message.
An approval answer does not grant a different numeric paid allowance. The
existing organization allowance and each domain service's admission still
apply; a turn has one `agent` ledger row and domain operations keep their own
rows. The owner confirmed on 18 October 2026 that necessary spend is delegated
to the assistant using the configured model route; there is no additional
default task dollar ceiling.

The execution mechanism is Mastra core 1.71.0 / AI SDK adapter 1.10.5. Native
`maxSteps`, `stopWhen`, `prepareStep`, `onStepFinish`, model timeout and
`abortSignal` enforce technical fuses. There is no replacement task scheduler.

| Environment setting | Default | Meaning |
| --- | --- | --- |
| `CF_AGENT_TASK_MAX_DURATION_MS` | `540000` | Shared request wall time, including approval legs. Cannot exceed this value while the existing exclusive run/thread claim expires after 600 seconds. |
| `CF_AGENT_TASK_EMERGENCY_MAX_STEPS` | `64` | Emergency native loop fuse. The final step retains its tools. |
| `CF_AGENT_TASK_MAX_IDENTICAL_TOOL_RESULTS` | `3` | Stop after the same tool, arguments and returned value provide no new information three times in this execution. Native memory and skill tool results participate. Only digests are retained. |
| `CF_AGENT_TASK_MAX_TOKENS` | unset | Optional threshold for reported prompt plus completion tokens across the conductor and nested domain operations. Reasoning and cache subcounts are not added twice. |
| `CF_AGENT_TASK_MAX_COST_USD` | unset | Optional threshold for provider-reported known USD across this execution. Missing price stops further automatic paid work only when this threshold is configured. |

All configured values must be finite and positive; step/token/time/repetition
settings must be safe integers. Invalid settings refuse execution. Increasing
the duration requires a separately reviewed claim-renewal implementation.

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
