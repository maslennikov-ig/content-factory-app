# Native queued-input fixture timeout repair

Status: fixed and frozen; test helper only. No application source changed.

Root's second full-suite attempt timed out in the 60-second probe watchdog.
Its last progress line was `approval`, but the test had already passed that
phase and reached a later unlogged live-observer check.

Read-only inspection of its exact disposable schema
`cf_r5_75825_1792577178097` proved:

- The approval workflow was `success`, with one admission, two synthetic model
  calls and exactly one domain write.
- FIFO, terminal-child gap and both Stop phases had their expected native
  snapshots and counts.
- The live-observer workflow remained `running`, with one admission, one model
  call and zero writes. Its synthetic domain function was waiting for the test
  to release a barrier.

The fixture released that barrier after a spy on `agent.observe()` fired.
Production observation now correctly uses the isolated public native stream
adapter directly. The obsolete spy was therefore never called. This was a
stale fixture contract, not an approval deadlock or an insufficient timeout.

The repaired fixture waits for the actual public PubSub replay subscription to
be ready, and asserts exactly one such observer. It retains the original
one-admission/one-write and native completion assertions. A five-second local
deadline identifies a missing observer promptly; new progress messages identify
the admission-fault and live-observer phases. The existing 60-second watchdog,
90-second subprocess deadline and all semantic assertions remain unchanged.

Verification with Node 22.23.2 / pnpm 10.6.1:

- Isolated `--live-observer`: one admission, one write, observer-only replay.
- `pnpm exec jest tests/native-queued-input.test.cjs --runInBand`: **1 suite,
  2 tests passed**, 26.044 seconds. All seven crash/restart modes, four strict
  admission faults, actual approval, live observation and distinct-host Stop
  race checks ran unchanged.
- `git diff --check`: exit 0. No TypeScript source changed, so no new application
  type check was required for this fixture-only correction.

Helper SHA-256:
`5fd1c71bb07561595f96b4ec9977d5f5d2c1cc893e3ae944278d3f9935c770e4`.
Application native queued-input SHA-256 remains
`eedacbbf52642af0128a8641789d91e15f2851fe1053016684f1110455b814e3`.

The diagnostic JSON was persisted before cleanup. The failed helper PID was
absent, no PostgreSQL connection referred to its schema, the inspected native ownership
leases were inactive, and the schema held the exact synthetic audit table and
request IDs from the failed receipt. Only that approved schema and its 40
tables were removed; final inventory contains zero tables. No Redis key,
database 13, QA stand, process, foreign schema or real provider was touched.

Evidence: `evidence/native-queue-fixture-*` retains the root failure excerpt,
native snapshot/audit inventory, exact cleanup receipt and focused green log.
Root's failed full-suite receipt remains failed; this focused pass does not
replace root's next complete suite run.
