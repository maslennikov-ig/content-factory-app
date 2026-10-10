# Access stage: dbxe.1–.5

Implementation and selected root acceptance PASS locally. Beads remains the status authority.
The full epic scope snapshot preserves all original criteria but this stage
accepts only the five selected access tasks, now CLOSED in Beads. The epic remains open.

Proof: 34 affected Jest suites / 554 tests, no skips; actual PostgreSQL tests
passed on a new owned disposable database. Backend TypeScript and docs checks
passed. Process check exposed stale handoff/stage wiring; corrected its current
stage references and required handoff fields, without changing policy or checks.
Corrected process check PASS. Reused unchanged passing executable proof.

Detailed scope, risks and compatibility: plan.md and
docs/operations/access-token-migration.md. No deployment, credential rotation,
schema mutation on production, provider/model call or source push. Temporary
database removed; foreign local container IDs preserved. graph-reviewed:
older local graph orientation verified against actual source, no refresh.

Wait for owner selection after final acceptance; no continuous goal is active.

Root review09Oct: dbxe.5 primary-upsert collision corrected with an atomic
provider predicate and safe409. Latest34 suites/558 tests/11 real PostgreSQL,
zero skips, backend types PASS. Original554-test proof is historical. See
review/review.md and review/review-acceptance.json; next recommendation dbxe.8
in next-stage-prompt.md, not started or deployed here.
