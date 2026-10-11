# Accepted accumulated release after dbxe.21 — 10 October 2026

The authorized short release is deployed and verified. The main application,
API and native backend/orchestrator/frontend worker readiness are healthy;
the application has zero restarts and retains its1792MiB memory limit.
Login and source pages return200. Public source version and downloadable archive
match the accepted image byte-for-byte. This verifies availability and deployed
code identity; it does not attest real-user login, real R2/provider effects,
paid-model quality or client acceptance.

| Boundary | Accepted identity |
| --- | --- |
| Exact tested private source | `d724f3b792f4518eebc04c854448904f565323fd` |
| Public copied tree/image tag | `755d19fa731d524b151afe18c4394d8027030d58` / `755d19fa731d` |
| Registry index | `sha256:956cde25cc140024353d6ca1d0fb7d6e9cbda694c9fd09f34480b1f00ea2f491` |
| Serving linux/amd64 image config | `sha256:ea54f8c9ee610976cccaffb16a8cd860a85c67a9213a1d6a1ecd8d42113eec7f` |
| Verified rollback | `cae3cd8340e0` / `sha256:a70e865a332aeae3701bfabc5fbb97f9c9b1d04596ab64536fa3c8eef0e8a053` |

Private main and the accepted work branch were fast-forward published. Public
history stayed in its separate copied-tree repository; no public remote was
added to the private checkout. The registry's existing name is unchanged.
Final stage/helper documentation commits follow the frozen tested source and are not claimed
as the source of this deployed image. Root receipt: [delivery.actual.json](delivery.actual.json).

## Verification and concrete corrections

All nine configured release commands passed on the exact private source:
three app typechecks, four-app build, SHA-bound full suite, branding, docs,
process and diff checks. Jest647 suites/11946 tests passed with6 suites/62 tests
skipped; Node123 passed/4 skipped/0 failed; Python50 passed. The three suite
halves were explicitly checked. Build and Code Quality Analysis on the public
branch also succeeded. Publishing the release tag starts another GitHub Build
for the same source; its status is recorded separately, not substituted for the
already accepted exact-source checks.

Matching dbxe.21 evidence remains6 suites/90 fake-R2/Redis/HTTP checks plus9 actual
PostgreSQL cases. Forty-nine new fake/HTTP cases cover ownership and retries;
the two release refinements bound pending store reads/writes at5s. Thirty-nine
historical Temporal bodies/signatures are preserved. No actual live bucket or
media/profile mutation was performed: production currently uses local storage.

The first accepted source image failed the unchanged25% growth gate because
Next's persistent build cache added322MiB. Only the build-time filesystem cache
was disabled; no threshold was relaxed. The final registry payload is
695,982,491 compressed bytes, about4% below the serving predecessor. Native
nginx, CLI help against an owned disposable database, source/archive bindings
and extension packaging passed. Original failed evidence remains local.

Only nullable `Post.publicationJournal JSONB` was added in one bounded transaction
after an encrypted0600 backup with successful decrypt/signature verification.
The existing SQL guard accepted the exact currently printed statement. The
stage-only helper's whitespace normalization initially failed closed; the
corrected printed-SQL helper was used and is now preserved in this stage.
No guard change, `db push`, table drop or restoration was used. Schema diffs
after apply and after application start were empty. All45 Mastra tables,
their schema/row inventory and product aggregate counts were preserved.

The two running legacy mail/digest executions retained their exact run IDs;
no history was cancelled, signalled or migrated. No duplicate recovery writer
was present. Safe mail migration remains dbxe.31. Twenty-one other container
identities/states were unchanged. After checks, the sanctioned retention helper
kept current and verified rollback tags, removed one obsolete own image and two
old own configuration copies, and left about30.5GiB available. Twelve exactly
inventoried owned temporary helper files were removed; the encrypted backup,
live configuration, volumes and other projects were preserved. The clean owned
delivery worktree and its merged local branch were removed without force;
matching raw acceptance evidence remains in the root stage.

## Published package and remaining work

[Release and extension2.0.1](https://github.com/maslennikov-ig/content-factory-app/releases/tag/755d19fa731d)
are published. ZIP download readback matches all7865 bytes and SHA-256
`90f10d220c9305f9ad87856fa0cf1697c1bf7ea0013a6160e909f06687643d48`.
Chrome Web Store identity/publication remains dbxe.32; old untyped extension
grants require reconnect. No real social publication or customer message was sent.

The exact application lock remediation retains documented caller/platform
exceptions. A complete image OS/global scan additionally found22 critical and94
high OS advisory/range records, plus51 critical/high global/binary records.
Nine Critical records have available fixed versions. Nine immutable base layers
are shared with the previous serving image: the findings are inherited, but
actual applicability is untriaged. They are not proof of exploitation or a
security all-clear. OS remediation is dbxe.33; global supervisor/build-tool
remediation is dbxe.34. The original dbxe.8 release subgate passed, but the task
stays IN_PROGRESS for these newly recorded shipped-package findings.

Beads epic remains OPEN:34 children,17 CLOSED and17 not closed. All30 original
acceptance texts and their scope snapshot are unchanged. Key-consumer assessment
dbxe.30, mail migration31, Web Store32, OS33 and global-tools34 remain OPEN.
Unselected UI, quota, SaaS, legal, pricing, client and research requirements are
preserved. No continuous epic goal or automatic next task was started.
Recommend the next bounded stage dbxe.33, then34; await owner selection.

docs-reviewed: updated - current handoff/index, dbxe.21 delivery and this release; documentation-decision: preserve dependency exceptions, add OS/global triage in Beads.
graph-reviewed: updated - Graphify0.9.45 local update and clustering without
external models/labels/hooks/query logging; report baseline d724f3b7,
28023 nodes/55444 edges. Ownership callers have matching file hashes;55 zero-node
files remain an explicit extractor coverage limitation. Raw local receipts and
logs remain in this stage; central sanitized delivery receipt is committed.
