# Native Stop tail persistence proposal

Status: awaiting root GO; all application and test sources remain frozen.

Actual gate5 captured running old-two-message histories and then settled/interrupted metadata with the same old two messages. The later free focus read contained the four native messages and unlocked the existing frontend predicate. No frontend guard relaxation is needed.

A synthetic actual Session/HTTP/PostgreSQL reproduction holds the public memory-store tail save. The current Stop returns positive while that save is held, and HTTP history is settled/interrupted with only the old two messages. Releasing the save produces all four messages. A 5500ms hold additionally proves the public Session.onBeforeAgentEnd hook fires too early through the SDK's five-second consumer bailout. The existing isolated native public view still waits: after the actual commit it receives abort, finish and EOF. Logs and exact inspected hashes are in stop-native-tail-proposal.json.

Run.watch/watchAsync are marked @internal in the installed declaration. Session.waitForStreamIdle is private. Neither is proposed. The native durable finalization code awaits memory flush before publishing FINISH; use that existing public stream boundary.

Proposed minimal change: retain and drain the original HTTP owner's native reader after explicit durable Stop instead of canceling it and exiting the reader loop on the abort flag. Its existing turn.finish and captured active.settled then settle after native EOF and domain work. Require one authoritative exact saved response-ID read before acknowledging Stop, because native persistence errors can be swallowed. No new observer, custom engine, poll, fixed delay or frontend uncertainty change. Focused checks must include a tail held beyond five seconds, failed tail storage, natural-finalization ordering, and parked/cold cancellation to prevent a deadlock.
