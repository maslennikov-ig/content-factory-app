# dbxe.8 dependency remediation plan — 9 October 2026

**Goal:** Triage the exact locked critical/high advisories and make minimum
compatible local fixes. Beads `content-factory-next-dbxe.8` owns acceptance.
**Approach:** Map package versions to production, optional and shipped build
consumers; consult official advisories and registry metadata. Keep version-line
overrides narrowly scoped, prove installed behavior and all four app builds.
**Non-goals:** Production deployment, provider/model calls, social publishing,
schema changes, framework rewrite and closure of unrelated tasks.

## Scope ledger

- Exact locked versions / official sources / platform and callers -> applicability evidence.
- Critical first, then reachable high -> manifest and lockfile corrections.
- Windows / next/og / custom-server exceptions, shipped tools -> explicit per-advisory dispositions.
- Frozen install / build / affected tests -> one root acceptance runner.
- Next release full suite and deployed proof -> separate release gate; preserve original Beads criteria.

## Cohesive local boundary

Files: `package.json`, `pnpm-lock.yaml`, any required narrowly scoped consumer
compatibility correction, affected regression tests, this stage, `.codex/handoff.md`.
Work starts at clean tracked HEAD `64b6a34fe0b642a232d3fec128b75ef0fb13304a` on
`codex/audit-readiness-20261009`. Existing untracked evidence belongs to earlier
work and is preserved. No public clone or production write.

- [x] Record baseline and bounded official lookup with zero unresolved snapshots.
- [x] Classify all 12 critical and 131 high baseline records against actual consumers.
- [x] Pin the smallest compatible patched lines and resolve/install with pnpm10.6.1 / Node22.23.2.
- [x] Verify actual dependency behavior, security regressions and four builds.
- [x] Review diff, docs/process checks; record root acceptance, Beads and handoff.
- [x] Save scoped local delivery and stop for owner choice.

## Technical premortem

Verdict: GO WITH CONDITIONS. Reversibility: restore only this stage's tracked
manifest/lock/source changes and frozen-install the original graph; no persistent
or production state changes are authorized.

Blast radius: root dependencies -> Nest/Express HTTP and uploads, Next rendering,
Temporal transport, Mastra/MCP, source parsers, frontend editor and build tools.

| Failure symptom | Evidence | Mechanism / surface | Detection | Mitigation | Disposition | Owner / check |
| --- | --- | --- | --- | --- | --- | --- |
| Import/API breaks after forced major update | plausible | Transitive override crosses a parent contract | installed API exercises, app builds | branch-specific selectors; adapt only proven consumer mismatch | preflight | root / focused checks |
| Actual vulnerable copy remains | confirmed baseline | Multiple version/peer snapshots and npm aliases | bounded exact-lock walk, installed-resolution probes | cover each matched line and re-audit after resolution | preflight | root / fresh audit |
| False exploitability claim | confirmed risk | Package range confused with reachable platform/caller | advisory + source/config/lock paths | mark conditional, dormant, build-only and exposed separately | preflight | root / dispositions |
| Build contacts paid model/provider or mutates DB | plausible | Postinstall/build initializes service | command/config review, inert local environment | generate client only; no DB push/live service startup | preflight | root / build runner |
| Executor accepts partial checks or an OOM as success | confirmed prior failure | pnpm audit path enumeration or ignored subprocess exit | bounded worker limits, explicit exits and receipts | no audit heap increase; acceptance checks each exit | preflight | root / acceptance receipt |

Recovery trigger: failed import/behavior/build. Resolve the exact regression
before acceptance or restore this stage's changes; reinstall pinned original
lock. No schema, sessions, queues or live user data are changed. Runtime rollout
and verified image rollback remain a later explicitly authorized release.

Preconditions: official version exists, matching parent API is exercised,
complete frozen install succeeds, bounded audit has zero unresolved nodes,
all affected checks and four application builds pass.
