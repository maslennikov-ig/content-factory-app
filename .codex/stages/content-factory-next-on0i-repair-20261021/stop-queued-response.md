# Queued native Stop response proof

Status: reviewed patch applied, source/tests frozen and focused checks green at 2026-10-21T14:07:12.194Z; root Gate8 is pending.

The actual native queue consumer stored a question's assistant message but never recorded that exact ID in assistantNativeRun.response. Its task has a native owner and no HTTP ActiveTurn. The strict Stop guard correctly refused503 despite a saved question, cleared pending gate and settled interrupted metadata. The public native start/step-start IDs matched the saved assistant, proving the missing adapter handoff.

The existing original child fullStream and existing child completion observer now pass native start runId/messageId to an optional scoped runtime callback. MastraService records it only for the current trusted request/resource/run and a nonstopped task. Native model initialization uses the same public metadata updater and retains proof only for the exact same request/run, preventing the startup writer from erasing it. The updater provides serialization within one storageinstance; this change does not claim cross-process PostgreSQL transaction semantics. Native workflow ownership, generation filtering and the existing Stop witness remain authoritative.

The controller, strict Stop proof and frontend are unchanged. Missing or failed proof still refuses503. No new observer, polling, fixed delay, SDK patch or private API was introduced.

Verification on Node22.23.2/pnpm10.6.1:6focused suites/19testsPASS in85.907s; backend types and git diff --check exit0. Permanent regressions use actual PostgreSQL for held-write initialization, exact native savedassistant identity, staleowner/run/stopped/settled refusal and failedproofwrite→strictStop503. Existing native queue recovery/FIFO/Stop witness and critical HTTP Stop/useChat checks passed.

Exact source/test/SDK/log hashes and commands: [source freeze](evidence/stop-queued-response-source-freeze.json). The earlier source-only RED, stage candidate and rejected alternatives remain separate evidence. No paid call, runtime restart, owner stand change, build, full suite, commit, push or deployment was performed by this worker. Root owns compiled Gate8 and final acceptance.
