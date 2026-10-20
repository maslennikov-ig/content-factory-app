# Stable Mastra refresh and Gemini Argon handoff

On 19 October 2026 the owner requested the useful current capabilities in the same epic and
confirmed Gemini Argon is the implementation agent, not the product's selected
model. Scope remains preparation now; local implementation later; no deploy.

## Decision

Adopt the latest stable compatible Mastra family inside existing Task1, before
building its native consumers. Today npm latest is core1.78.0, versus resolved
1.71.0; alpha1.79.0-alpha.3 is not the stable target. Recheck dist-tags at actual
implementation entry and pin an explicit compatible set, preserving a rollback
lockfile. No package, lockfile, application runtime or production DB was changed
by this review. Registry peer ranges are preliminary compatibility evidence,
not an installation/build/runtime acceptance result.

## Package candidates checked against the registry

| Package | Resolved now | Latest stable candidate | Treatment |
| --- | --- | --- | --- |
| @mastra/core |1.71.0|1.78.0|Target; native scopes, queueing, tool/context and recovery fixes |
| @mastra/memory |1.32.1|1.38.0|Update with native history/attachment and memory lifecycle checks |
| @mastra/pg |1.27.1|1.31.2|Update; peer core>=1.76, atomic memory/fencing/local schema compatibility |
| @mastra/ai-sdk |1.10.5|1.11.1|Update; resumed native tool parts and client history parity |
| @mastra/server |1.21.0 resolved, not a direct dependency|1.78.0|Audit actual paths, align every used server adapter; required for new scopes |
| mastra CLI |1.3.19|1.34.2|Review used CLI scripts; compatible pinned tooling, no deploy command |
| @mastra/mcp |1.18.0|2.4.1|Major protocol migration; decision below, not a blind latest bump |
| @mastra/client-js |not resolved|1.55.0|Only if an actual consumer adopts native client APIs |
| @mastra/observability |not resolved|1.20.1|Only for the actual native tracing consumer |
| @mastra/redis |not resolved|1.4.10|Supported persistent adapter candidate; no homemade equivalent by default |

All returned engine ranges require Node>=22.13.0; repository Node22.23.2 meets
that floor. Existing root Zod3 satisfies core/server/AI SDK ranges, while memory
has its own Zod4 dependency. Test actual schema interoperability; do not upgrade
all unrelated dependencies merely because the native family has changed.
Registry responses and peer ranges are retained in `registry-packages.json`.

## Useful delta and consuming tasks

| Release | Useful change | Native integration in this epic |
| --- | --- | --- |
|1.72|Background tasks use persisted expiring ownership; streams can provide initial history and trim retained topics|Task3 leases/reconnect; Task6 native initial-history ingestion, no duplicate UI replay |
|1.73|Native tool-resumed event, default provider repair/retry pipeline, preserved resume data and resumed ToolCallFilter context|Tasks1/5 audit retry ownership; Task6 clear pending cards from native resumed parts; A15/A28 |
|1.73|Memory recall can expose actual retained image/PDF attachments|Task2 read prior media via native recall; A26 |
|1.74|Tools get read-only current conversation through context.agent.getMessages; observational history has group/record navigation|Task2 uses this before adding a custom history/evidence reader; retains authorized full source reads |
|1.75|No initial empty thread, one active model per thread, updated switching API|Tasks1/6 createInitialThread:false and ensureId at the actual send boundary; no empty chat on navigation |
|1.76|Renewed durable ownership and storage fencing; PostgreSQL atomic structured working-memory merge|Task3 must prove stale executions cannot overwrite recovered state; Task2 prove no lost concurrent fields |
|1.76|Native auto observer/reflector model resolution, unsupported-file recovery and scoped delegation metadata|Tasks2/5 meter auto roles and honor provider boundaries; Task4 scoped specialist context; no automatic new provider |
|1.77|Observational memory generation/race protection and empty structured-memory extraction no longer erases saved data|Task2 real memory/storage regression, including an empty extraction result; A25 |
|1.77|Authenticated message authors and linked spans, configurable gateway price estimates|Tasks1/5 distinguish authenticated author from untrusted text; estimates do not become confirmed invoices |
|1.78|Agent scopes, trusted MASTRA_SCOPES_KEY, resource/thread conflict refusal and resume scope protection|Task1 server-derived scopes + resource bindings; A24. Session.scope remains a different isolation concept |
|1.78|queueSignal keeps system signal type/tag/attributes when queued|Tasks3/4/6 use typed native signals for internal context, message APIs for user-authored text |
|1.78|beforeApproval can return an invalid call to the model before showing a card|Tasks1/4 reduce unnecessary prompts; still validate current rights/content/revision inside execution; A27 |
|1.78|Preserved suspended state after crash and invalid resume data does not consume the pending run|Tasks3/6 recovery/approval fixtures, A12/A28 |
|1.75–1.78|Span queries, trace token/cost aggregation, compact previews and capability discovery|Task5 use actual native query/aggregation APIs with coverage/unknown cost; no bespoke trace query engine |

The previous catalog already covered the major runtime families. Its baseline
needed this release delta and stronger explicit consumption of conversation,
attachments and native scopes. No claim that every framework extension should
be activated: external channels, arbitrary shell/Code Mode, coding agent and a
new vector platform still need a real product consumer. Conditional features
are accounted for in the original catalog; they are not hidden future epics.

## Compatibility conditions to carry into implementation

- Scope metadata is not authorization. Derive it on the trusted server, reject
  conflicting bindings, preserve the authenticated actor and recheck policy on
  recovery. A custom Nest adapter cannot rely on the old-server guard to detect
  missing integration; align used server adapters explicitly.
- Separate Session.scope (per-chat runtime identity) from Agent.scopes (run
  labels/bindings). Adopt both correctly, without accepting org/role/scope from
  a client or retrieved page. Old pending snapshots need a tested binding adapter.
- Model switching changed in1.75 to one active model per thread; do not call the
  old modeId/scope signature. Factory application mode removals are not proof
  that the generic AgentController API lost modes.
- Default retry processors and memory error processors add retry paths beyond
  maxRetries. Set one deliberate policy and account for every model call.
- Native ownership/fencing protects runtime storage, not a social provider's
  side effect. Keep committed and uncertain operation receipts and test replay.
- beforeApproval does not rerun after the person responds; a thrown hook can
  proceed to the approval gate. Return a safe explicit refusal on validation
  failure and repeat required policy/revision validation in execute.
- New native storage domains/methods may need local additive schema changes.
  Use an owned local DB, read/write a pre-upgrade native-history fixture and
  record schema diff. Do not initialize against production, drop native tables
  or replace the guarded deployment/migration procedure.

## MCP major-version decision in the same epic

MCP2.4.1 is peer-compatible with core1.78 but changes the public server protocol.
The2.0 migration switches servers to MCP2026-07-28, removes the old handshake/
standalone SSE/session behavior and changes elicitation to suspend/resume with
signed continuation state. Current product uses the1.18 MCP server and
mapAuthInfoToUser in `chat/start.mcp.ts`; native business auth must survive.

Tasks1/7 must inspect real supported client contracts and the official migration
guide. Adopt2.4.1 only with equivalent supported client, auth, input/approval,
continuation and cross-process behavior proved locally. If existing clients
require the legacy server protocol, retaining1.18 as the compatible protocol
adapter is a justified in-epic compatibility decision: its peer range already
admits core1.78. Do not silently break clients, force new production credential
wiring, invent a second agent harness or defer an unexplained protocol break to
a new epic. A required owner/client decision remains explicit if facts cannot
resolve it. MCP2's better trace/schema handling is useful only with that proof.

## Additional acceptance criteria

A23 coherent stable upgrade + existing native-data fixture; A24 trusted scopes,
authored messages and no scope widening on resume; A25 atomic memory/empty-result
and reflection races; A26 retained image/PDF reading; A27 invalid preapproval and
late policy changes; A28 native resumed/queued/history events and supported MCP
compatibility. Original A1–A22 and their boundaries remain mandatory.

## Primary evidence

- [1.72](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.72.0)
- [1.73](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.73.0)
- [1.74](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.74.0)
- [1.75](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.75.0)
- [1.76](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.76.0)
- [1.77](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.77.0)
- [1.78](https://github.com/mastra-ai/mastra/releases/tag/@mastra%2Fcore@1.78.0)
- [MCP migration](https://mastra.ai/reference/migrations/mcp-v2)
- [Core changelog at released source](https://github.com/mastra-ai/mastra/blob/6a465f9/packages/core/CHANGELOG.md)
- [MCP changelog at released source](https://github.com/mastra-ai/mastra/blob/6a465f9/packages/mcp/CHANGELOG.md)

This is a planning delta, not an executed SDK upgrade. Argon is the executor;
no Gemini product-model setting or new provider access is implied.
