# Queued native Stop response proof

Status: read-only diagnosis confirmed; application/test source remains frozen pending root GO.

The failed suite is a real adapter omission. The native queue starts runtime.agent.stream with untilIdle and consumes its existing fullStream directly. Unlike the HTTP adapter, this consumer never records the exact native assistant message ID in assistantNativeRun.response. At its persisted question gate the actual Memory assistant ID matches native start and step-start payload.messageId, but pointer.response is missing. There is an original native owner and no HTTP ActiveTurn. Native Stop clears the pending gate and settles interrupted, but the exact response pointer remains absent and the strict Stop guard correctly returns503.

The single authorized scripted-provider actual PostgreSQL diagnostic and its source hashes are recorded in stop-queued-response-proposal.json. It used only the existing original producer consumer and no new observer. The untilIdle wrapper and inner stream share one run/ID; the pass-through instrumentation logs both layers. Fixture finally completed cleanup.

Proposed bounded change: add an optional runtime onMessageId hook to the existing child queue reader/child completion observer; record the public native start runId/messageId through MastraService's scoped atomic metadata updater. Only the current trusted request/run and a nonstopped marker may accept it. Preserve a newly written response when native model admission initializes the exact same request/run; never carry it across owners. Keep the HTTP drain, strict saved-ID proof and frontend unchanged. Failed proof persistence stays actionable.

Focused validation should cover all existing queued approval/question/Stop ownership scenarios, failed proof persistence, late wrong request/run/stopped writers, native queue basics, and existing HTTP Stop failure guards. No source edit is authorized by this artifact itself.
