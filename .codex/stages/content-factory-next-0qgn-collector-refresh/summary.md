# Collector create-only refresh delivery

Scope complete: new operations helper, one execution test, new operations document, and a proposed four-file host install packet. Main checkout and other streams were not changed. Root owns acceptance, integration, installation and any live application. No host writes, collector restart, retention change, task retry, or event submission occurred in this stream.

## Evidence

- Focused command in `focused-tests.log`: **16/16 passed**, 12 actual disposable PostgreSQL 18.6 cases plus four input/source/privacy guards; installed matching psycopg 3.3.2. Temporary labelled container removed, no Docker volumes, one loopback-only random port removed with it. Synthetic old rows, unrelated sentinel, definitions and 90-day settings stayed unchanged. Both the injected mid-DDL database failure and five-second total transaction deadline rolled back all new day tables/dependencies.
- `installed-native-readonly-plan.json`: the real collector's Python 3.13 / Django 6.0.2 / native generator accepted the helper's frozen source/settings/root/coverage guards. Seven days through 2026-10-08T00:00Z were validated; `mode=plan`, `created_tables=[]`, `planned_new_tables=[]`. No host apply was requested.
- `host-readonly-service-prerequisites.log`: actual host systemd 255.4, `/usr/bin/docker`, Docker service loaded/active; UTC calendar expression accepted with a caller-pinned base time.
- `systemd-unit-offline-verification.json`: service/timer syntax parsed successfully using local systemd 259 in a temporary unprivileged user-manager context with dependency stubs and an identical temporary ExecStart executable. **Not** a live/root-mode or sandbox execution proof. Root-mode verify of installed paths on host 255 and activation remain explicit install preconditions. An earlier privileged offline-root attempt could not create its runtime directory; no unit was installed or activated.
- Prior fixture diagnostic established two test bugs, then a two-case recheck passed before the final 16-case run. One interrupted local test fixture was removed only after its exact generated name/owner label matched; all final disposable resources are gone.

## Behavior and limits

Only `public.issue_events_issueevent`, current UTC day plus six, four hash buckets. Native SQL must match the complete reviewed CREATE allowlist; max 35 tables. Correct existing coverage is checked and skipped without CREATE or empty-row requirements. Partial/incompatible/unrelated/default coverage aborts before the first creation. Apply rechecks each day under root/advisory locks, bounds the transaction to five seconds, and admits only the new five tables/25 copied indexes and their automatic dependencies. No destructive maintenance or table rollback is provided.

The helper's source hashes deliberately stop on collector/schema/settings drift. Its locks can briefly block shared event ingestion and referenced FK tables; an extra Python process shares collector memory. Those host load/activation effects require root's later check. Historical missing days and queue recovery stay out of this helper. Existing configured retention is preserved; this does not certify that the stock global retention scheduler works.

## Exact install/rollback contract

`install-packet/manifest.json` lists four root-owned payload files, helper directory, two own systemd-generated paths, the exact new staging directory and its five-file allowlist, source digests and modes. All payload paths and existing same-named units/drop-ins must be absent before install; do not overwrite. Unit uses 00:05 UTC daily, Persistent=true and a 60-second host process limit. Wrapper pins local Docker socket, own empty config directory and exact collector container.

No installer was executed. After review: fresh host preservation baseline and read-only plan; transfer/check hashes; install only the four files; root-mode `systemd-analyze verify`; daemon-reload; enable only this timer, then explicitly start its service once; capture resulting coverage and unchanged retention/old definitions/rows/container identity. Version255 source confirms that first activation without a stamp schedules from activation time; it does not catch up a pre-install 00:05 occurrence. Persistent catch-up requires a preexisting older stamp. The explicit first service start closes that installation gap without fabricating a stamp. On UTC2026-10-02 with Oct1–7 present, only Oct8 plus h0–h3 are planned, ending Oct9T00:00Z; this is a calculation, not a live apply claim. Monitor the successful next daily execution rather than claiming indefinite readiness from unit presence.

Rollback disables only this timer, waits for its bounded oneshot to finish, verifies payload ownership/digests, removes only its four payloads/own enable link/stamp, and rmdirs its own empty directory. Every committed partition remains; it may already contain another project's events.

## Root handoff

Delivery is offered for root review and central-artifact acceptance. No child task closure, Beads mutation, push, merge, public-tree refresh or cleanup of another owner occurs. `retry-api-addendum.md` corrects the earlier unverified API suggestion: installed django_vtasks has no retry API; root's source-checked two-row guarded ORM fallback is recorded accurately without running it here.
