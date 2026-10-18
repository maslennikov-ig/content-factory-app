# AI assistant width production delivery — 18 October 2026

Task: `content-factory-next-nds6` /HOBA-5834. Owner explicitly authorized
publication, production deployment, and browser verification on a wide screen
and phone with the material panel open and hidden. Delivered production:
`da82a041c623`. No model/provider call, social publication, new connection or
domain edit was made. Existing accepted epic and prior paid evidence remain
intact. Canonical task state is in Linear through the managed Beads route.

## Findings and correction

Root reviewed correctness/completeness and consistency/reuse. Source8be6453be
removes centered760px conversation/composer caps and the start text65ch cap,
stretches the start block, and aligns DESIGN, authoring rules and inventory
around full allocated pane width with normal16/20px gutters. The main chat
and contextual manual assistant reuse this component. No API, schema,
Temporal, provider, dependency or primitive replacement.

The release process check exposed a201-line handoff against its200-line
limit. Metadata-only7418 compacts it to199lines without losing facts. The
process check then passed. No release guard was weakened. Closeout also compacted the project index
back to its150-line limit while preserving both old and new acceptance links. Root owned the
small diff review, serial release and acceptance; delegation brought no
concrete benefit. No external/versioned product behavior was changed.

## Exact acceptance and production identity

Tested private source: `7418b5adaae867f2c9cb410395d57e3b9279b831`.
Published public source: `da82a041c62309617c737a7ea8f8cf27a297a83e`, with its
canonical Source-Commit trailer. Fresh fetch proved safe fast-forward ancestry
before private atomic and public pushes. The public tree contains no private
history; the image was built only there. The canonical exporter imported the
completed receipt without another public source commit.

One root-owned9-check release set passed: diff, docs, brand, process, all3app
type checks, full build and canonical full suite. Jest687passed suites,
12492passed tests/70existing skips; Node126/0fail; Python50OK. All5exact-public
CI checks passed, including full suite and time travel. Matching8be local
116tests/11geometry cases remain source proof; no second full suite or image
release was commissioned for the browser probes.

Registry digest:
`sha256:e706b2d141d7283159dc0bb8d5724f763fdce940f7db4b5a89a99e4a3114b0c2`.
Runtime config:
`sha256:4797db90309331cc732473312a93dcf819092852cc8861f24b313154e6971588`.
Full production source archive12867019bytes/SHA256
`a660642d9f37e95a5f80ae80e06cc57e561e38b8a98d2f4a68092279292037e7`
exactly matches the image/public archive. Nginx and stand-backed command help
passed. Image weight remained within its gate. Canonical pull verified the
registry digest; canonical switch verified runtime image and release marker.

Prisma preflight before/after: diff0/SQL0, no schema apply. Final runtime
2026-10-18T15:59:05.286678+00:00: healthy/0restarts,3roles online/0;
Mastra45/fingerprint4739 unchanged,21foreign containers and21volumes preserved,
25216012288free bytes. Full fingerprints and exact identities are in receipts.

## Actual browser acceptance

Fresh authenticated browser contexts verified the original authorized
principal and the deployed public version. The existing owned QA material
and chat were used; new conversation checks sent no message.

| Case | Actual result |
| --- | --- |
| Wide2221×1100, material open/restored | Chat pane868.109px, log/input828.109px,20px gutters; material1096.891px. |
| Wide, material hidden/new conversation | Chat1973px, log/input1933px; no centered width cap. |
| Phone390×844, material open/restored | Material fills390px, chat retained while hidden; no horizontal overflow. |
| Phone, material hidden/chat tab/new conversation | Chat390px, log/input358px,16px gutters. |
| Unsent draft | Preserved through hide/restore and mobile tab switching, cleared without sending. |
| Data and cleanup | Exact QA material/history; original workspace fields restored with a foreign-writer fence;0agentPOST/0domain writes; browsers/cookies/session closed. |

All9width cases passed. A focused5case phone follow-up used actual taps and
viewport-only capture, with positive touch capability and CSS viewport390
throughout; all passed. This is browser mobile emulation, not a physical
handset/virtual-keyboard acceptance. No live model semantics were reaccepted;
the prior paid feature evidence is unchanged.

Initial unaccepted probes exposed harness issues: two valid Artifact buttons
required chat-pane scoping; direct cleanup PATCH required the same Origin
header as normal cookie writes (403without/200with Origin); an immediate
measurement preceded the final layout frame. The completed width probe used
settled geometry. Full-page capture altered later touch observations in the
browser tool, so only the newly uncertain mobile-input boundary was rechecked
with taps and viewport capture. No product edit or redeployment was needed.
Raw attempts remain private; sanitized correction evidence is retained.

## Preservation, cleanup and rollback

Canonical retention ran only after release/runtime/browser checks passed.
It kept currentda82 and verified rollbackebdd, removed only our old4f tag and
2old configuration copies. Foreign images, containers, volumes and live
configurations were untouched. Three hash-verified owned schema helpers and
their empty temporary directory were removed. All browser contexts/cookies
were closed and the mode600temporary signed-session file removed. Private
screenshots/payloads remain outside Git in the mode700audit directory.

Verified rollback: `ebdd0fdd6d86`, config
`sha256:2114bdae51f172b36753074a347aa636fbf0a1d16b23e7524d9ecb5c1d677359`.
Use the canonical switch helper with that explicit tag. No DB rollback is
needed because no schema changed. The tested release worktree, image, complete
archive and private audit are retained. Unrelated root files are preserved.

## Receipts and bounded limits

[Root release acceptance](evidence/root-release-acceptance.actual.json),
[public CI](evidence/public-ci-checks.actual.json),
[image/archive](evidence/image-proof.actual.json),
[production source](evidence/production-source.actual.json),
[final runtime](evidence/runtime-final.actual.json),
[browser width](evidence/browser.actual.json),
[mobile taps](evidence/browser-phone-touch.actual.json),
[probe corrections](evidence/qa-probe-corrections.actual.json),
[retention](evidence/retention.actual.json),
[browser cleanup](evidence/browser-session-cleanup.actual.json),
[host-helper cleanup](evidence/host-helper-cleanup.actual.json).
[Canonical task acknowledgement](evidence/task-final.actual.json) at16:02:55UTC
confirms both accepted statuses CLOSED for HOBA-5834. The existing global
managed relation-sync failure remains separate; no global synchronization success is claimed.
That pre-existing scheduler issue is outside this application release.

Durable operational docs and the project index describe this release. Later
metadata-only documentation commits do not restamp the immutable7418receipt
or cause another image build.

docs-reviewed: updated — DESIGN/authoring/inventory retain the width contract;
current handoff, project index and production runbook link the actual release.

graph-reviewed: no-change-needed — existing JSX layout classes and docs only;
no import, route, export, caller or dependency edge changed. No graph refresh
or external extraction was commissioned.
