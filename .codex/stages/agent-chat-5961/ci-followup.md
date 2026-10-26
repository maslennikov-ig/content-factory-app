# Build CI follow-up — HONEY-5962

Owner explicitly requested waiting for Build CI and repairing failures without
paid calls. Original public source: `4ba4c5a44225c4353255c4ab445fd3ab1e000c7f`,
Build run `40097185744`.

Final delivery: private `48e6c53fcde02695b3aa869116f33d5b937c245a` / public and
production `2c25a3d13bb7958b68ba789d237a7378a1054c2a`. All four Build jobs and
Code Quality are green. The original failed run remains historical; the repair
is accepted by [Build 40108822348](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40108822348)
and [Code Quality 40108822396](https://github.com/maslennikov-ig/content-factory-app/actions/runs/40108822396).
[CI proof](ci-proof.json), [production proof](ci-production-proof.json).

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
failed; the later corrections and final GitHub acceptance are recorded below.

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
checks: Jest 772 suites/13,484 tests, Node 167, Python 50, types/build/docs/process.
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
The final focused/full/CI acceptance for this correction is recorded below.

## Application and delivery boundary

The initial test-only publication was private `19e27e183` / public `f7fb7794c`.
Its Build `40101372436` failed and is not accepted. The deterministic follow-up
changes runtime continuation handling. Exact-source release checks, a new copied
public tree/image and a guarded production update were completed under the
owner's standing Push, Merge, Deploy instruction. No paid calls, provider policy,
persistent credentials, schema or foreign-service changes were made. No green
receipt was issued for failed attempts.

## Final acceptance and guarded release

- Exact private source `48e6c53fcde02695b3aa869116f33d5b937c245a`: all nine
  release checks PASS. Jest 772 suites/13,485 tests, 7 suites/70 existing skips;
  Node 167 PASS/0 FAIL/4 existing skips; Python 50 OK. Full suite 2172.92 seconds.
  Backend/frontend/orchestrator types, all four app builds, branding/docs/process/
  diff PASS. The receipt was generated by the actual full suite on this source.
- Full CI and calendar +400 days each pass 763 suites/13,402 tests with 16
  suites/153 environment skips. Full CI also reports Node 167/0 FAIL/4 skips and
  Python 50 OK, with the three-halves guard green. Build and Docker proofs PASS;
  Code Quality PASS. All historically failing native/owner/routing suites pass.
- The held-delivery regression and existing owner/permission cases pass on one
  CPU with two workers and calendar +400 days: 4 suites/5 tests, zero skips,
  74.035 seconds. The read-only child diagnosis is accepted; it left no repo
  edits or owned processes. Its external logs remain retained.
- Image `ghcr.io/maslennikov-ig/content-factory-next:2c25a3d13bb7`, digest
  `sha256:e3cd81454091854d3270c30f1f74aab632edcf891a096e2bf692f2dd4e181aa2`.
  Built from the clean public tree, matching source receipt, nginx/commands-help/
  size checks and all eight installed SDK patch chunks PASS. The first registry
  read failed before any switch; a temporary authenticated read and the unchanged
  weight/capacity gates passed on retry. Temporary registry configs were removed.
- Prisma diff zero before/after, no schema applied. Immediately before switching,
  no active native owner, workflow or continuation intent existed. All 45 threads,
  374 messages, 1,247 usage rows, settings, six suspended snapshots and the old
  admitted row remain exact; new usage zero. All 21 foreign containers/mounts,
  21 volumes and protected configuration remain exact.
- Runtime healthy/0 restarts, all three PM2 processes online/0, worker ready.
  API/login/source/version HTTP 200; archive 14,839,560 bytes with SHA-256
  `ad934505d257a7acb34aead3694f6f0137731698a975dc5f292ec2b77be4cdf7`.
  Fresh read-only public login at 1440/390px passes with no overflow/page/API
  errors or mutations. The CI proof describes acceptance before the one guarded
  production switch; the production proof describes the completed deployment.
- Canonical retention keeps `2c25a3d13bb7` and verified rollback `4ba4c5a44225`;
  it removes only the older e819 image and two old configuration copies. Owned
  schema helpers, disposable local DB and sharing directory are removed. Original
  checkout HEAD/status, all 11 dirty-file hashes, preview PIDs and ports 3496/4296
  remain exact. Backups and foreign services remain preserved.

The retained preview remains the original accepted feature stand at
<http://localhost:4296/agents/a5222c3c-2cc7-4c30-aec1-fef81687b8a9> (private window).
Later runtime repairs are deployed and covered by the exact-source native/full
checks; the preview was preserved. Authenticated production dialogue and real
provider/editorial quality were not exercised. No paid inference/search, account
connection or provider/model-policy change occurred. Existing environment skips
and the absence of a separate watchdog for a wedged SDK startup promise remain
explicit boundaries.

Docs-reviewed: handoff, operation runbook, stage delivery and navigation now point
to the current CI/runtime proof; old receipts remain historical. Graph-reviewed:
owner graph was read-only orientation, and changed owners/SDK paths were checked
against current source; no external extraction or graph refresh was performed.

Detailed private evidence:
`~/.local/state/content-factory-next/release-agent-chat-5961-20261024/ci-repair-20261024/`.
