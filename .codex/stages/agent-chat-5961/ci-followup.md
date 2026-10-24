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
2 suites /24 tests PASS. Git diff check PASS. Final GitHub acceptance is pending.

## Application and delivery boundary

Application files, dependency versions/patches, model/provider settings and
runtime configuration are unchanged from private `0d7540645`. That baseline's
sole application-source difference from deployed private `9610d5a623fd` is the
already verified comment correction with identical emitted JavaScript.
Production remains the accepted `4ba4c5a44225` image, archive and rollback. This
is a test/CI publication; no image rebuild or production switch is required.
The copied public tree and Source-Commit trailer remain the publication route.
No green local suite receipt is invented for this CI-only commit. The new
GitHub workflow must finish all jobs and confirm all three suite halves before
this follow-up is accepted. Production data, credentials, paid providers,
foreign changes and the existing preview remain untouched.

Detailed private evidence:
`~/.local/state/content-factory-next/release-agent-chat-5961-20261024/ci-repair-20261024/`.
