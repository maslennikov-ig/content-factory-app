# Native Stop tail persistence

Status: source and focused native checks are green; root compiled acceptance is pending. Source is frozen at 2026-10-21T13:03:18.556Z.

Actual gate5 proved that the positive Stop response and settled/interrupted domain metadata could precede the native message tail: initial HTTP reads had only the old pair. The late free focus read had four messages and unlocked the existing strict frontend guard. The frontend is unchanged by this repair.

The controller now drains its original native reader only after explicit durable Stop. It stops admission and display immediately, asks native Session to abort, then retains the existing reader until actual native FINISH/EOF after Memory flush. Internal cancellation and persisted approval/question gates keep their existing reader cancellation. The existing turn.finish/active.settled covers domain work after that boundary.

Native save errors can be swallowed, so Stop additionally requires a same-request, same-captured-run response pointer and its exact saved assistant ID from one authoritative Memory read. The pointer is read again after drain because onMessageId can still be committing. A real accepted native producer with no owned pointer also rejects503. Missing proof stays actionable; unknown capability writes and cost are not cleared.

Session.abort is void. A public Session.onBeforeAgentEnd hook is insufficient: the controlled5500ms save hold outlasts the SDK consumer abort grace. The existing native public stream waits until persistence. No new observer, polling, fixed delay, custom runtime, SDK patch, private Session method, internal workflow watch API, or frontend predicate relaxation was added.

Verification used Node22.23.2/pnpm10.6.1 with synthetic providers and actual isolated PostgreSQL/Redis. Final focused run:4suites/16testsPASS in54.372s, covering the eight tail/boundary cases,3domain-settlement cases,13identity tests and20actual-installed-useChat modes. Backend tsc and git diff --check exit0. Existing cold native service cancellation checks:4PASS/13skipped. Controlled RED and corrected GREEN cover missing tail saves, early response-pointer commit, and accepted run with failed native pointer storage. Internal reader cancellation independently finishes in18ms withcancel1 and noSession.abort.

The first fixture attempts and their limitations are preserved and separated in stop-native-tail-evidence.json. The exact application/test/SDK/evidence hashes and commands are in [source freeze](evidence/stop-native-tail-source-freeze.json). No paid call, browser action, restart, full suite, commit, push or deployment was performed by this worker. Root must run the new compiled Stop gate and final acceptance.
