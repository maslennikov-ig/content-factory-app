# Collector create-only refresh plan

Owner: delegated telemetry stream; base `d70c2106295e0c396d3917545447da5c94c331a6`. Root owns acceptance and any host installation. Beads remains the task/status authority.

Scope: one new Python operations helper, one focused execution test, one new operations document, and this stage's artifacts. No app/backend changes, host writes, retention maintenance, restart, publishing, or queue retry.

Design: invoke the existing collector's native SQL generator only after frozen source hashes, effective settings and PostgreSQL/root guards pass. Validate today plus six UTC days, with caller-pinnable `CF_COLLECTOR_PARTITIONS_NOW`. Correct existing daily parents/leaves are validated and skipped; incompatible/partial/name-colliding/default coverage fails closed. Each missing day gets exactly five CREATE statements in one bounded transaction, with the root/advisory gates accepted in the prior seven-day repair. Cap new tables at 35, and admit only their inherited catalog dependencies. Default mode is read-only planning.

Verification: actual disposable local PostgreSQL 18, matching installed psycopg 3.3.2, preserved synthetic old rows/sentinel/retention, first creation, safe repeat, all buckets, wrong bounds, wrong hash coverage, DEFAULT, NOWAIT/advisory contention, and mid-transaction error rollback. No full suite. An optional collector read-only plan checks the installed Django/native generator integration without installing or applying anything.

Delivery: frozen isolated commit and artifact hashes/logs; precise four-file helper/service/timer install packet with no-overwrite checks and rollback that removes only those files after the timer/oneshot are inactive. The existing shared collector and all existing tables/retention/tasks stay untouched. Root records acceptance centrally; this child does not close Beads or integrate source.

Documentation evidence: installed GlitchTip 6.0.5 `/code/glitchtip/partition_manager.py` SHA-256 `d6ac1d9b6ee34fe1a035afe9ef1307c30847cb6be26589c41a8384de911ff86f`; full sources and primary catalog evidence in the prior telemetry-partition-review directory. PostgreSQL 18 official CREATE/LOCK/timeouts documentation checked during that review. Installed Django 6.0.2 and psycopg 3.3.2 were checked read-only before implementing.
