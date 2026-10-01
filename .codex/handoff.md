# Content Factory Handoff
Current stage id: `content-factory-next-0qgn-search-summary`
Last accepted local stage id: `content-factory-next-0qgn-search-summary` (not released)
Selected Beads epic: `content-factory-next-0qgn`
Selected Beads goal: `content-factory-next-ec48.7`

Status reconciled 01.10.2026 in Beads `content-factory-next-lymv`.
Detailed audit: [status-reconciliation-2026-10-01.md](stages/content-factory-next-kcxz/evidence/status-reconciliation-2026-10-01.md).
Beads owns live task status; the evidence below records bounded acceptance.

## Active programme — 01.10.2026

User requested plan/spec and orchestration. Epic `content-factory-next-0qgn` is in progress;
all 36 remaining records preserved under their 11 original scopes.
[Spec](../docs/product/remaining-work-2026-10-01-spec.md),
[plan](../docs/superpowers/plans/2026-10-01-content-factory-remaining-work.md).
Branch: `codex/remaining-work-2026-10-01`; preceding audit edits remain.
Local Telegram slice fn33.21 is internal_ready: 81 affected tests, two app types,
56 design tests and four Windows-browser synthetic scenes pass; production remains
pending. Local 2q28.41 retry slice is internal_ready: ordinary form refusal allows
correction, while 10/min abuse and 1/60s effect ceilings remain. Root combined auth
acceptance passed 15 suites / 333 tests and backend types, including six mixed-case
auth regressions. Review also identified AI/public case bypass `0qgn.2`; root
fixed it locally. Final combined proof passed 18 suites / 455 tests and backend
types. Original client/production acceptance remains pending.
Local ec48.7 summary slice is internal_ready: one grounded synthesis/translation
pass, bounded source context, fastpaths and graceful fallback. Six complete
search suites / 134 tests, backend types and independent review pass. Original
live semantic/source-name acceptance is still pending.
Owner approved exact cfiz packet; root repaired host backup and verified isolated
restore. Deploy, paid calls, real-client messages and external submission remain
separate authority. Original scope map and current status are in Beads.

## Current delivery

- Latest recorded and read-only verified production image: `3132393a8920`
  (30.09 logo release, private source `5d5e49110`, rollback `f0b4bfae1f25`).
  [Release 7](stages/content-factory-next-kcxz/evidence/release-7-2026-09-30.md).
- Production read 01.10.2026 10:48 UTC: same image, healthy, zero restarts;
  root free 13,021,990,912 bytes (~12.1 GiB). Ownership inventory: 5 product
  containers among 40 total; shared build-cache ownership is not established.
  Earlier memory 1.096 / 1.75 GiB (62.63%) does not prove its acceptance criterion.
- Private `main` at audit baseline `9275ea472` matches `origin/main`.
  One worktree; `spike/kcxz-2-agent-transport` is a retained throwaway experiment,
  not a pending integration. Prior branches/worktrees were consolidated 26.09.
  The pre-existing untracked `.codex/prompts/` is preserved.
- Latest accepted release suite: Jest 587 suites / 10,048 tests, node:test
  122 pass / 0 fail, Python OK, bound to `5d5e49110`; no new release in this audit.
- The private history stays in `maslennikov-ig/content-factory-next`.
  `maslennikov-ig/content-factory-app` is only the published tree/build output;
  never add it as a remote here. Registry stays `ghcr.io/maslennikov-ig/content-factory-next`.

## Accepted implementation and remaining acceptance

- Agent `kcxz`: 54 of 56 children closed. Web chat, avatars, channels, AI
  settings, ideas, facts, media, analytics/help and per-person MCP OAuth shipped.
  CopilotKit removed; the post window uses «Спросить агента».
  Releases 5/6 fixed consent, task search, own/generated pictures and person-held
  queue placement; see [release 5](stages/content-factory-next-kcxz/evidence/release-5-2026-09-30.md)
  and [release 6](stages/content-factory-next-kcxz/evidence/release-6-2026-09-30.md).
  Claude was tested in live walks 1/2; `kcxz.46` now owns the third walk after
  fixes and actual ChatGPT verification. `kcxz.48` waits for that acceptance.
- First client `2q28`: onboarding/help/auth shipped 25–26.09. Release work in
  `2q28.11` is complete; owner walkthrough and Yulia's second round remain.
  `2q28.2` retains approval/limit/B1 owner checks; registration success alone
  does not prove them. `2q28.41` owns observed registration friction, and
  `2q28.38` retains the unresolved prompt-quality part. `2q28.10` is an owner decision.
  The unfinished Telegram tab-return follow-up `fn33.21` now belongs to `2q28`.
- Wave `97dq`: implemented/released `97dq.95`–`.99` and historical delivery
  `.9` closed during reconciliation. Only current child `.43` remains, with
  shipped/superseded items noted separately. Do not repeat accepted waves.
- Audit `c6k` and content map `odb8` closed: every implementation child was
  already accepted, and the relevant owner decisions are recorded.
  Unused sentence repair / `VoiceRibbonContainer` was removed 07.09; its stale
  `fn33.28.19.2` is now closed too. Original acceptance history stays intact.
- Memory `71m` remains open: all seven implementation children accepted,
  but <60% of the limit with connected channels is not proven. Its explicit
  remaining acceptance owner is `71m.8`; today's snapshot is above that threshold.
- Search quality and benefit measurement remain in `ec48`, `75xn`, `m0iy`.
  `fn33.132` now belongs to `ec48`; phase 2 `m0iy.6` waits for the measured
  benefit threshold in `m0iy.10`, not merely the expired observation date.
  Old `ec48.6` inline-marker criterion is superseded by accepted label stripping
  (`97dq.40`); this does not declare semantic source faithfulness universally proven.
- Signup/template implementation was accepted in `or3`; `saas.2` still needs
  a recorded two-organization real-DB isolation/lifecycle walk. It is open,
  not an active implementation claim. `saas.4/.5/.7` remain blocked.

## Backup repair accepted — 01.10.2026

- Owner authorized the exact cfiz packet. Same key/subkey renewed until 01.10.2027;
  product-only helper installed 0700, shared script outside its insert unchanged.
  Six retained plaintext SQL copies tightened to 0600 with unchanged hashes/owner.
- New signed/encrypted artifact at `/srv/full-backup/2026-10-01_cfiz-0qgn-094906Z/`
  is 1,847,036 bytes, private mode, checksum/signature/decryption verified.
  Full SQL restore with ON_ERROR_STOP=1 passed in one isolated 256 MiB container;
  product/Mastra/Listmonk/Temporal/visibility table counts 77/45/16/37/3 match source.
  Exact proof container and private plaintext removed; live source preserved.
  [Receipt](stages/content-factory-next-0qgn/evidence/cfiz-host-restore-2026-10-01.json).
- cfiz closed. First subsequent scheduled result remains `0qgn.1` due 02.10.
  Unusable retained encrypted interval 26.09–pre-repair 01.10; earlier start unknown.
  No irrecoverable data-loss interval asserted: old SQL remains privately preserved,
  and the separate 27.09 product set passed hashes/catalogs. Historical cxd stays closed.

## Explicit defers

- `or3.9`: tariff/trial/card owner decision; related payment wiring and old
  tariff follow-ups are blocked under it. The accepted public funnel stays closed.
- `kcxz.48`: app-directory submission waits for `kcxz.46` and separate external
  publication/identity/demo-account authority.
- `hf97`: immediate disk headroom restored; current ownership inventory and
  a bounded shared-cache/capacity policy remain unresolved. No broad cleanup.
- Legal/provider/region decisions `saas.6` and `rry` were shelved by the owner,
  not satisfied. `saas.4/.5/.7` retain their gates; no residency/SLA promises
  or new production-as-SaaS acceptance inferred from product releases.
- `0qgn.1` retains the first post-repair scheduled backup observation;
  `71m.8` retains actual connected-channel memory acceptance.
  Historical closed `3aw`, `c6k.16`, `2ua`, `ry5`, `cxd` and `71m.7` are not
  current owner tasks. The accepted YouTube display risk `2la` is unchanged.

## Durable entrypoints

- Agent: `docs/product/agent-harness-spec.md`, ADR-0012;
  [stage summary](stages/content-factory-next-kcxz/summary.md),
  `docs/operations/mcp-connect.md`.
- Voice: `brand-voice/voice-wiring.contract.ts`, `voice-composite.ts`,
  `post-layout.ts`; offline evidence tools under `scripts/evidence/`.
  Before a voice evaluation, use `rebuild-voice.cjs --dry-run`; an old analysis
  without the current norm fingerprint is not a usable comparison.
- Content map: `docs/product/content-section-map.md`; decisions in sections
  8–10, interface contracts in `docs/design/`, roles in `docs/product/roles-matrix.md`.
- Client feedback: source `docs/client-answers/first-client-yulia-2026-09.html`;
  preserve field names `sN_result|like|dislike|improve|shot` and the existing slug.
  New submitted rounds require their own invitation token. Every client finding
  becomes a `2q28` Bead with the original words; do not message a client in an audit.
- Delivery/backup: `docs/operations/production-deploy.md`,
  `docs/operations/postgres-backup.md`. Never `prisma db push` on production:
  Mastra has its own DB, with 45 tables since the accepted agent upgrade.
  `send_email` v1 is terminated; use versioned `send_email_v2`.
- `retain-host-artifacts.sh` has only its standing scoped post-release authority:
  two own images and three configuration copies, no unrelated host resources.

## Next recommended

Next stage id: `content-factory-next-0qgn-delivery`
Recommended action: prepare the exact application delivery packet for locally
accepted auth, route-case guards and search summary. Application deployment
needs current authority; full-suite receipt must bind the actual release SHA.
Observe `0qgn.1` after its scheduled run on 02.10. Later finish
third live walk `e3903a36-3981-49f6-a8d2-f30878e0663b`, actual ChatGPT acceptance
and the remaining first-client round. Memory/search/SaaS criteria stay explicit.
Do not relaunch September 16/22 walkthroughs or repeat already accepted implementation.

## Starter prompt for next orchestrator

Use $orchestrator-stage only when coordination materially helps. Read this
handoff, `.codex/project-index.md`, the selected Bead and its acceptance evidence.
Owner decisions and live/paid/production authority are independent gates.
For the dev stand use `localhost:4200`, not `127.0.0.1`. Prefix Node commands
with `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH` (the local shim can shadow nvm).
`pnpm test` has Jest, node:test and Python halves; a partial green is not the suite.
Do not use Tailwind `min-[…]`/`max-[…]` with the raw screens configuration.
If Prisma client lags, regenerate rather than infer current schema from old types.
Nest optional union-typed dependencies still need `@Inject(Token)`.
Beads is authoritative; use the enrolled GitHub sync trigger, never a
GitHub-preferred pull that can reopen accepted tasks. This handoff is capped at 200 lines.
