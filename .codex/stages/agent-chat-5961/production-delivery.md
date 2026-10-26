# HONEY-5961 production delivery — 24 October 2026

This records the initial `4ba4c5a44225` delivery and its historical receipts.
The owner's subsequent CI follow-up repaired runtime races and delivered current
`2c25a3d13bb7` with all five CI jobs green. See [current outcome](ci-followup.md)
and [current production proof](ci-production-proof.json). The current rollback
is `4ba4c5a44225`; the older e819 image is no longer retained on the host.

The owner's subsequent **Push, Merge, Deploy** instruction was delivered through
HONEY-5962 (`content-factory-next-i0oq`). HONEY-5961 and all six implementation
tasks retain their completed local acceptance. No new paid/provider authority
was inferred from the release instruction.

- Production/public source: `4ba4c5a44225c4353255c4ab445fd3ab1e000c7f`.
- Tested private source: `9610d5a623fded2863da974a931bce014b6e7bf0`; feature `f16ab8c633a6` merged
  with fetched private integration base `0e0cf070c6b8` in the owned release worktree.
- Image: `ghcr.io/maslennikov-ig/content-factory-next:4ba4c5a44225`.
- Registry digest: `sha256:6d11e3973ca93730dc60df0b77acdc2da90c1cb63b066798ffd918ed6a0b5283`.
- Verified retained rollback: `e819113f113e`.
- Production: <https://factory.aidevteam.ru>.

## Verification

All nine release checks PASS. Backend/frontend/orchestrator types and all four
app builds reuse matching passing application inputs; the final fixture/docs
commit changes no application code. The entire canonical suite ran on the
exact tested private source: **771 Jest suites / 13,476 tests PASS**, 7 suites /
70 existing skips; **Node 167 PASS / 0 FAIL / 4 existing environment skips**;
**Python 50 OK**. Full suite elapsed 2473.95s. Branding,
documentation, process readiness and diff checks PASS. No receipt was produced
for earlier failed diagnostics. [Corrections](release-regressions.md),
[fixture repair and child acceptance](release-fixture-repair.md).

The image was built from the separate published tree, carries the correct
`Source-Commit`, and passed nginx/commands-help/weight checks. All eight CJS/ESM
SDK patch chunks match the installed tested source. Pinned core remains 1.78.0;
provider/model/Flex/own-key policies are unchanged.

Strict final-source native memory probe: 12 runs, 48 research results / 2,400
sources, 288 tool calls, 12 full-source reads, 12 full-receipt range reads,
288 active reconnect results and saved-history reconnect after cleanup. V8 heap
limit 512 MiB, peak heap 397320872 bytes, peak RSS 643416064 bytes,
settled heap spread 3986304 bytes (guard 8 MiB); both native
registries settle at zero. Full retained sources/results remain readable.

Before/after switch Prisma diff is empty, SQL lines zero, schema not applied.
Native schema fingerprint and all six suspended snapshots are exact. All 45
threads, 374 messages, 1,247 usage rows and AI settings are exact; new usage zero.
One preexisting admitted usage row remains unchanged. No active native owner,
running workflow or continuation intent was present at the switch.

Runtime is healthy/0 restarts; backend, frontend and orchestrator are online/
0 restarts; worker ready. All 21 foreign containers, their mounts, 21 volumes
and protected live configuration are preserved except the intended image/
release markers. API/login/source/version are HTTP 200. Source archive is
14836112 bytes, SHA-256 `8f0a68d5438d75f083c35ec7cd751bc6a4e9cbead8df36ef5de8c9a1c293b5d7`, exact to the image.

A fresh read-only browser context verified public login at 1440/390px,
keyboard focus, no horizontal overflow, page/API errors zero, mutations sent
zero. Authenticated production chat and inference were not exercised; full
question/continuation/reload/restart/lost-response/Stop/revision behavior is
established by [local frozen browser acceptance](acceptance.md).

## Retention and remaining boundaries

Canonical retention kept current + `e819113f113e`, removed only our old
`e37c8dac4dbf` tag and two old configuration copies, and retained backups.
The three SHA-verified host schema helpers, owned disposable local PostgreSQL,
commands-check Redis/network and temporary WSL sharing files were removed.
The owned production browser was closed. No foreign service/data cleanup occurred.
Original checkout HEAD/status and
all 11 dirty-file hashes match their initial snapshot. Existing preview
processes and ports 3496/4296 remain available.

Retained preview: <http://localhost:4296/agents/a5222c3c-2cc7-4c30-aec1-fef81687b8a9>
(use a private browser window). It retains the original accepted feature stand;
production includes the subsequent release recovery corrections.

Public Code Quality CI passed; Build CI was still running at the original
inspection and later failed. The current green replacement and exact-source
release checks are recorded in [CI follow-up](ci-followup.md). No paid model/search call,
social publication, account connection or credential/policy change was made.
Real provider/editorial quality and owner acceptance remain separate.

[Sanitized proof](production-proof.json). Detailed private receipts:
`~/.local/state/content-factory-next/release-agent-chat-5961-20261024/`.
Graph-reviewed: existing owner graph was read-only orientation, with current
owning source/SDK checked; no external extraction or graph refresh.

Rollback: `CF_DEPLOY_HOST=root@<host> scripts/release/switch-host-image.sh e819113f113e`.
Keep the additive video/product schema; no down-migration is required.

A subsequent documentation/comment follow-up records this delivery and corrects
the old approval-fallback explanation. It changes no application behavior;
the image remains bound to the exact tested private source above.
