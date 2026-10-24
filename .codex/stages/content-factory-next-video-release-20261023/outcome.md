# Video main integration and release — 23 October 2026

## Accepted delivery

Owner-authorized video release accepted: tested application source `0852c9fe515a76a476ce973e8d65d06af1434cd6`,
private main delivery `181d2aa46`, public/runtime `e819113f113ea3c0c65ce00b76cafd2ccd1a8ac1`.
Registry digest `sha256:71d4a58fd3656627b71541744e99dc522603606466cf19d4e9c4488f6c4d3fa7`.
Verified rollback `e37c8dac4dbf` is retained. The concurrent table/native-replay
release and its closeout documents were preserved; primary main/index and all
9 unrelated files remain exact.

Full canonical receipt: Jest 763 suites / 13424 tests PASS (7 suites / 70 existing
skips), Node 167 PASS / 4 environment skips, Python 50 OK. Video database tests
ran against an owned disposable PostgreSQL. Source and image builds compiled all
4 apps; three type checks, branding, docs, process, diff, nginx and commands-help
PASS. The new versioned Temporal contracts add six entries; existing signatures
remain unchanged. Earlier failed diagnostics remain separately recorded.

Production browser PASS: subscription/API/manual selection, disabled provider
connections, manual provider preserved after reload, 390px layout without
horizontal overflow, no page/API errors and no mutating browser request.
Execution, upload/playback/download and durable recovery retain the separately
accepted actual local browser/Temporal evidence below; production QA generated
no video and made no paid call. No new usage rows, connections or video jobs.
Both subscription profiles and workspace subscription policy remain disabled;
video API credentials/spend policies are unset. Existing AI settings are exact.

Guarded live SQL added 11 video tables and 4 nullable JSON settings columns in
one transaction after a readable backup (725 TOC entries). SQL SHA-256
`1d01b80459872bd358605c20a98e734d98f882b904d259392d52c073f3ffc80a`; backup
`/var/backups/content-factory-next/postgres/20261023T130932Z-pre-e819113f113e-product-only`.
Runtime grants passed; all video tables stayed empty. Product diff is empty
before and after the switch; Mastra schema and 4 suspended snapshots are exact.
App healthy, 3 PM2 processes online / 0 restarts, Temporal worker ready; all 21
other containers/mounts and 21 volumes preserved. Source archive is exact:
14744402 bytes, SHA-256 `9c32c47dbcdbcbafcc504db8ac636c6f57b3e58f36cf2bee2e09fcbc969e3f1d`.

All 149 old messages and 27 other thread rows match the preceding accepted
release. The viewed thread's content is exact; only its two native timestamps
differ from that release's earlier snapshot. They were last updated at
12:48:23Z, before this video's 13:10Z switch. The initial raw mismatch is retained;
no history was rewritten. All rows stayed exact through our read-only QA.

Canonical retention kept current + verified rollback and removed only our old
eb26 image and 2 old configuration copies. Six exact temporary host helpers,
two owned local fixture containers/network and the temporary browser credential
were removed. Backups, rollback, source worktrees, protected live configuration
and foreign workloads remain. Private receipts/screenshots:
`~/.local/state/content-factory-next/release-video-20261023/`.

`.8`–`.12` remain locally complete. `.7` and the video epic stay open for real
account/registration/tool-schema/quote/receipt/billing/output/language-quality
evidence. No real provider registration/login, credential wiring, paid calls or
credit use was performed. Fixtures and deployment do not satisfy those gates.
API plan revision 3 and legal notices remain intact.

## Preparation and integration record

Owner authorizes main merge, push and deploy with required checks. No real
provider connections, paid calls or credit consumption. `.7` and epic remain
open for real-provider evidence. Root uses `codex/release-video-20261023` because
the primary main checkout has unrelated uncommitted work; it remains untouched.
Candidate merges main a07720474 with reviewed video 29b96ba9c.

## Integration corrections

- Four additive SQL files moved unchanged from Prisma migrations to
  `docs/operations/video-*-schema-apply.sql`, retaining the single guarded
  production apply path. Original historical receipts keep their original paths.
- Subscription queries now carry explicit organization/actor predicates in
  addition to preceding ownership checks. Three intentional cross-workspace
  account/disconnect revocations are documented in the tenant guard.
- Video stale-approval and missing-authored-request errors now have RU/EN
  actionable chat messages. No generation or workflow contract changes.
- Existing UI fixtures expose browser `self` and respect distinct SWR keys;
  capability fixtures cover all 19 video tools and nested service ports;
  monitor wiring keeps unrelated relative controllers as test ports.
- Project index stays within its existing navigation bound.

Independent reviewer `review_video_release_safety` delivered read-only schema,
startup/no-call analysis, then a bounded tenant/capability correction stream.
Root accepted the bounded stream after reviewing predicates, explicit capability
fixtures and the paid-adapter observer. Focused checks passed: 6 suites / 242
tests, including real disposable-DB subscription persistence. Root affected
checks passed separately: 6 suites / 274 tests. No child-owned infrastructure
was created, so child cleanup is complete. Root owns deployment and final gates.
The initial broad diagnostic was stopped after confirmed failures (exit 130);
it is not passing release evidence. Focused and final results live privately
under `~/.local/state/content-factory-next/release-video-20261023/`.

SQL path mapping: 20261022150000_video_generation_v1 →
video-generation-v1-schema-apply.sql; 20261023100000_video_subscription_connections →
video-subscription-connections-schema-apply.sql;
20261023101000_video_subscription_execution → video-subscription-execution-schema-apply.sql;
20261023110000_video_subscription_recovery_deadline → video-subscription-recovery-deadline-schema-apply.sql.
Each old file was `libraries/nestjs-libraries/src/database/prisma/migrations/<id>/migration.sql`.

Pre-release production baseline was freshly read as eb26f53a52a1, healthy,
3 processes online/0 restarts, worker ready. Video tables/settings columns are
absent; no active native leases or admitted calls. No deployment is claimed by
this preparation record. Apply only the guarded additive live diff with backup,
verify runtime grants/empty video jobs/unconfigured keys, then switch through
canonical scripts and verify source/archive/read-only browser behavior.

Docs-reviewed: updated runbooks/handoff/index. Graph-reviewed: no-change-needed;
merge preserves prior implementation navigation; corrections are predicates,
copy, fixtures and SQL-reference locations. Owner graph is not overwritten.

## Broad-suite integration follow-up

The second broad diagnostic was superseded by concurrent main typography fix
86938c73d; candidate a6009225c includes it. The subsequent broad diagnostic
found stale search-loader, routing-panel, capability roster and historical
schema fixtures plus missing video relations in the empty-workspace deletion
proof. Root added the two video relations, updated the role matrix and kept
actual schema-guard coverage. Known-red diagnostics are not release receipts.

Root accepted the same reviewer's bounded follow-up after diff inspection:
exact reader tool rosters now include eight video reads; web confirmations
include the two paid video launches. Three suites / 44 tests PASS; no child
resources or cleanup remain. Root focused checks: settings24, routing15,
roles/deletion171, account/tenant31, real-Prisma SQL guard84 PASS. Independent
Node diagnostic167 PASS/4env skips and Python50 OK. Final exact-source suite,
image, schema apply and production acceptance are still required.

Temporal signature inventory adds exactly six new versioned video entrypoints;
every previous signature and baseline ordering is preserved. BCP47 locale codes
have one exact, documented language-guard exemption. The real-PostgreSQL chat
suite now uses the existing video integration-suite 30-second budget under
coverage instrumentation (the isolated instrumented run passed in 5.1 seconds).
Focused Temporal/chat/language checks: 3 suites / 75 tests PASS; chat rerun after
the time-budget change: 4 PASS. No production provider profile is enabled.

Root accepted the reviewer's final bounded scenario stream after reading the
stateful service fixture, assertions and exact registration changes: seven
chat scenarios cover all 19 video capabilities, including approval/decline,
USER reads, edited-draft approval invalidation, API/subscription payer units,
existing-receipt recovery and manual unknown cost. The coverage guard and
general scenario runner are unchanged. Focused 3 suites / 58 tests PASS;
1121 unrelated scenario tests were filtered only in this focused run. No
child-owned resources remain. The final full run includes the whole roster.

The third broad diagnostic reached 738 passing suites and 13 known failures,
then the single instrumented Jest process exhausted its 8 GiB V8 heap. It
produced no receipt. The canonical `pnpm test` heap bound is now 12 GiB for
this expanded suite; all tests, coverage, open-handle detection and the three
runner halves remain enabled. This changes test-runner capacity only.
