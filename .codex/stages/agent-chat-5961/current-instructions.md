# Current instructions on native resume

Task: `content-factory-next-hbe3`. Owner requests the current chat to receive
current product instructions without losing history. No paid calls.

Reuse the existing bundled-instructions `processInputStep` and the same dynamic
resolver supplied to the native Agent. Replace only the untagged system bucket
before inference; native processor-owned tags, persisted messages, task state,
approval payloads and permissions remain unchanged. Do not rewrite snapshots or
approve/resume production gates from diagnostics.

Checks: reproduce the frozen prompt with the native processor runner; check
warm and serialized lists, tagged guidance, full reply locale, unchanged history,
no duplicate instructions and once-per-request workspace reads. Extend the real
Postgres/Redis cold native Session proof to simulate old instructions and verify
the actual model prompt after explicit approval. Run focused agent/native checks
and backend typing; release checks follow only for delivery.

Documentation: official Mastra processor interface and installed core 1.78 types/
implementation. `prepareStep` closures do not survive cold resumes, so use the
registered processor. Graph reviewed: existing root graph dd67538d is stale;
focused buildConductorController lookup returned no match, exact current source
and installed SDK verified. No graph writes or external model backend.

The integration proof also exposed that core WorkingMemory renders its own
generic instructions instead of calling Memory.getSystemMessage. ConductorMemory
now adapts that public processor provider to use its existing public instruction
extension on input and per-step phases, replacing only its native memory tag.
No new store, queue, state signal, tool, model call or SDK patch is introduced.

Local acceptance: first native processor proof was red on the frozen prompt,
then warm/serialized MessageList cases passed with exact history and tagged
guidance preservation, full German reply locale, no duplication and one workspace
read per request. Four focused suites /122 tests PASS; the final real cold
Session migration additionally starts with the old default Memory processor and
proves current voice/preferences on explicit approval, unchanged user history,
zero passive model/tool calls and exactly-once stored execution. All three app
typechecks and all four application builds PASS. Delivery is pending release gates.
