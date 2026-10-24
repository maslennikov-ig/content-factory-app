# Pinned dependency patches

## @mastra/core 1.78.0 — completed native output lifetime

`@mastra__core@1.78.0.patch` fixes a reproduced native memory retention defect.
The stream/resume/recover/generate methods forwarded cancellation through an
anonymous upstream AbortSignal listener. Its lexical scope retained completed
model output, buffered chunks and durable messages. On Node 22.23.2, composite
signals with listeners remain rooted in the runtime's persistent signal set.
Some native Session paths dispose registry entries directly, bypassing the
returned stream's cleanup. Detaching only in that returned cleanup was
insufficient, including an older suspended segment after a successful resume.

The patch gives forwarding a small file-scope closure and removes its listener
through both existing stream cleanup and compositional registry-entry cleanup,
including recovery setup failures. Existing cancellation forwarding, permission
checks, native fences, pending question payloads and stored data remain intact.
The native `untilIdle` wrapper also detaches its abort forwarder when it
actually closes; a completed wrapper must not retain its buffered response.
An idle thread subscription releases its consumed run, final chunk and initial
transferred record after reader cleanup. The native Session's live subscription
consumer also releases each consumed chunk before awaiting another event.
Live subscriptions, queued runs and suspended
snapshots remain available; no session eviction is used to hide retention.
Both distributed CJS and ESM entrypoints are patched. No private SDK runtime
override, second execution engine, memory-limit increase or data purge is used.

The affected non-`ee` Mastra source is Apache-2.0 according to the pinned
package's `LICENSE.md`; attribution and original package notices remain in the
dependency. This patch can be distributed with the AGPL-3.0 product.

Regenerate with `pnpm patch @mastra/core@1.78.0`, edit the extracted package and
`pnpm patch-commit <directory>`; commit the patch, manifest and lockfile together.
Never edit another worktree's shared `node_modules`. Installation is enforced
by `pnpm.patchedDependencies` and the lockfile's patch hash. Remove or replace
this patch only after the listener lifecycle regression and the native 512 MiB
memory/history/reconnect probe pass on the replacement SDK without it.

Implementation evidence and exact local measurements:
`.codex/stages/agent-chat-5961/memory.md`. The original production incident's
allocation owner remains unknown; the reproduced local defect and measurements
do not retroactively establish that historical cause.
