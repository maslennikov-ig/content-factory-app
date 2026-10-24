# Build CI follow-up — HONEY-5962

Owner explicitly requested waiting for Build CI and repairing failures without
paid calls. Original public source: `4ba4c5a44225c4353255c4ab445fd3ab1e000c7f`,
Build run `40097185744`.

The application build and required Docker proofs passed. The shifted-calendar
job failed two native subprocess suites with a circular worker error. The full
job hit its 45-minute wall-clock limit after 754 completed files and no reported
test failure; Node/Python never received a complete acceptance opportunity.
The earlier overall `in_progress` summary missed that an individual job had
already failed. The follow-up checks every job and all three suite halves.

## Reproduction and correction

Unmodified affected suites pass serially with the calendar +400 days: 18/18,
195.975 seconds. With two Jest workers pinned to one CPU, the unchanged Stop
batch times out after 30.118 seconds. An external diagnostic captures actual
`ETIMEDOUT`, SIGTERM and `error.error === error`; Jest loses that cause while
serializing the synchronous child error. The native integration suite passes
in that constrained reproduction; its original CI error is masked, so its
exact original child error code cannot be recovered from the old log.

- Keep all 20 Stop scenarios and their assertions, grouped into four five-case
  child runs with the same existing 30-second child and 35-second test limits.
- Execute each independent native recovery scenario with its own existing
  200-second child budget, retaining all membership, no-duplicate-write,
  bootstrap-latency, Stop-latency and metadata assertions.
- Serialize child diagnostics as a fresh error with bounded text and primitive
  code/status/signal. Real success/timeout/exit regressions cover the helper.
- Give the whole full-suite CI job 60 minutes based on the observed 45-minute
  cutoff. Individual probe and production runtime limits remain unchanged.

Corrected focused verification: +400 days, two workers, one CPU: 3 suites /
24 tests PASS, zero skipped, 317.397 seconds. Workflow/time-travel guard checks:
2 suites /24 tests PASS. Git diff check PASS. The first repaired CI run `40101372436` subsequently
failed; final GitHub acceptance is pending.

## Follow-up failure and deterministic runtime regression

The first repair's calendar job exposed a reused Jest worker reaching about
3.95 GiB of its 4 GiB heap after 19 minutes. The attributed routing suite passes
in isolation on exact Node 22.23.2 (3 tests, 346 MiB reported heap). Installed
Jest 29.7 supports idle worker recycling, now limited to 1 GiB retained heap
between suites. The exact accumulation source is not established; the active
suite and production heap limits are unchanged. Read-only delegated diagnosis
was accepted; it made no working-tree or runtime changes.

The same CI run exposed a real queued-availability handoff race. A deterministic
2.5-second successor-start delay reproduces it: the reader's 1-second idle check
cannot see a workflow lease yet and settles the task failed; the already accepted
successor then sees that terminal marker and aborts. The new native regression
fails before the correction with the same suspended/settled-failed state.

The existing liveness check now also recognizes Mastra's public exact
thread/resource/run reservation, which exists before the first workflow lease.
This retains the original admission across slow native handoff, while missing
native ownership still suspends uncertain outcomes. Read-only source review
confirmed the exact public reservation and unchanged Stop/uncertainty gates;
the delegated review is accepted and left no owned processes or working edits.
Like a live workflow lease, a live local native reservation remains positive
liveness evidence; this change does not add a separate watchdog for a wedged
SDK startup promise. No retry, claim-stealing,
new queue, timeout increase or synthetic success is introduced. The new delayed
case retains all five-call/one-write/one-admission/completed assertions.

The constrained integration set then exposed a cold queued-Stop status race:
a pending continuation can retain an earlier failed observation marker. Cold
recovery checked that terminal marker before the original immutable queued-child
Stop witness. The explicit saved-Stop guard must precede that terminal-marker
shortcut, as the existing `stopRequested` guard already does. A deterministic
prior-failed-observation case is added alongside the original running case;
all no-provider/no-successor-checkpoint assertions remain mandatory.

## Approval event/admission race

Private `4e50deb25efe` / public `2eb9a58667b1` passed all nine local release
checks: Jest 772 suites/13,484 tests, Node167, Python50, types/build/docs/process.
Its calendar CI passed 763 suites/13,401 tests; build, Docker and Code Quality
also passed. Full CI `40104708199` exposed one additional Session-owner race
(`agent-native-session-owner`): a third admission was opened even though the
resumed provider retained ledger `[0,1,1]` and the committed domain write stayed
single. That CI run is failed and is not accepted for deployment.

Read-only delegated diagnosis reproduced the exact assertion without changing
repo files. Hold the queued Session's native `tool-call-approval` delivery until
the answer reaches owner lookup: persisted approval is visible, `armed=false`,
but the exact queued owner, scope and registry are all live. The cached `armed`
condition incorrectly falls through to a fresh admission. Removing that
condition passes the same controlled ordering with two admissions and one write;
`scope.active()` remains unchanged because no defect in it was demonstrated.

A root-owned native regression now controls that event delivery with promises,
without sleeps/retries or weaker assertions. Both original HTTP/queue cases and
the new held-delivery case retain original-ledger, live-execution, exact target,
one-write and terminal-state assertions. Exact admitted owner controls the join;
the existing adapter selects the live or persisted native gate response.
Fresh focused/full/CI acceptance and release remain required for this source.

## Application and delivery boundary

The initial test-only publication was private `19e27e183` / public `f7fb7794c`.
Its Build `40101372436` failed and is not accepted. The deterministic follow-up
now changes the native queue adapter; it requires exact-source release checks,
a new copied public tree/image and a guarded production update under the owner's
standing Push, Merge, Deploy instruction. Production remains `4ba4c5a44225`
until those gates pass. No paid calls, provider policy, credentials, schema or
foreign-service changes are authorized. No green receipt is invented.

Detailed private evidence:
`~/.local/state/content-factory-next/release-agent-chat-5961-20261024/ci-repair-20261024/`.
