# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave of 04.09, second half (`fn33.15`–`fn33.118`, 81 closed, 22 open) — on branch
`wave/fixes-2026-09-04`, NOT released, NOT pushed.** The owner asked to fix
everything found on his live pass and to continue the pass with subagents.
Sixteen Opus streams in worktrees plus one integration stream; five walkers
then walked blocks 1–8 on the local stand (`localhost:4200`, email off) and
two more re-checked the fixes. **Fixed:** registration by invitation lands in
the invited workspace with its role, no own workspace, active at once
(`fn33.18`, `.29`, `.26`, `.37`, `.38`, `.40`); nothing grants workspace
`SUPERADMIN` any more, the creator is `ADMIN`, the last admin cannot be removed,
equal admins may demote each other while one remains (`.19`, `.50`); role change
in the team list, invitation link on screen with its expiry (`.17`, `.24`,
`.35`, `.51`); reject works for any empty workspace and logs, decline mails,
delete account, unblock with its own state (`.22`, `.30`, `.23`, `.66`); password
change inside the product (`.41`, `.42`, `.75`); a second workspace can be
created (`.36`, `.34`); the language lives on the account (`.53`, `.39`, `.43`);
media library opens as a modal, one upload ceiling (`.15`, `.20`, `.71`);
**creating a post from the composer had returned 500 since 20.08 and editing
one nulled `organizationId`** — both fixed (`.49`, `.88`); CopilotKit no longer
mounts around the whole app (it sent a model call on every page load — `.48`),
a 403 no longer hangs every «Сохраняем…» button (`.65`); composer copy, stage
default `PLAN`, context panel in words (`.27`, `.28` quick part, `.31`, `.25`);
the content section: fact form, leads, brief, materials, avatars, calendar
(`.45`–`.91`, see beads). Design stage for the composer is published as a
Claude Design canvas (`fn33.28` notes) with a brief in `docs/prompts/`.
**Two release steps need the owner:** `docs/operations/user-blocked-at-schema-apply.sql`
(one column, before the image switch) and
`docs/operations/workspace-role-superadmin-to-admin.sql` (data). Open for the
owner: `fn33.90` (what EDITOR may do), `fn33.32` (cascade deletion of a
workspace), `fn33.28` (design → code), plus the assumptions listed in each
bead's notes. A read-only review found one release blocker (the `blockedAt` column had no
release step) and four «before release» items — all fixed in `fn33.108`
(same-origin checks on approve/block/unblock and the three account doors, an
open invitation link no longer skips approval, deleting the last admin of a
shared workspace is refused, no CopilotKit around previews); the rest are
beads `fn33.100`–`fn33.107`. Two control walks then found a dead password door (`fn33.109`, the middleware
strips the hash) and a server-render 500 on every signed-in page (`fn33.110`,
a regression of `fn33.81`) — both fixed and checked on the stand. Receipt on
the final tree (`0edb16ee`): 328 suites / 4024 tests, `node --test`
116/0, python OK, `tsc` 0 on three apps, process verification OK.

## Wave twelve — the audit of waves ten and eleven (02.09.2026)

The owner asked for a full audit of what the orchestrator reported as «all
done». Two read-only reviewers over `7bf12bcc^..11fe62a3`, four bounded
workers; every guard shown red before green. **«All done» was not true**: of
seventeen beads thirteen were closed; `lh5s` was reopened (nothing called the
producer) and built with `tyrk`, `rrs9`, `4zef` on 03.09, walked by hand.

**Built.** `tyrk` — §9.5: producers write `ContentEvidenceAssessment` (own
material `ACCEPTED`, search `PROPOSED`); a fact without evidence is `VERIFIED`
on creation, honouring its `freshUntil`; `confirmEvidence` + `POST
/facts/:factId/evidence/:evidenceId/confirm` with «Подтвердить» only on
product-found rows; a `SUPERSEDED` fact cannot be restored over its copy. §9.4
— the archive is a **view inside «Материалы»**, five tabs, old `?tab=archive`
links land on it. Email v2 has a **bounded retry** (5 attempts, 30 min); the
lead-check workflow `continueAsNew`s every 100 passes; feed items without
id/guid/link get a content hash; Telegram binding rechecks `isSuperAdmin`.
The runbook prescribes schema **before** the image switch from a throwaway
container; the editorial-stage migration proof runs in docker-CI.
**Deferred, each a bead:** `ni7x`, `cl19`, `th1s`; older debt: eleven
`PrismaRepository<any>`, the archive read whole into memory. Receipt in
`.codex/stages/content-factory-next-vme/evidence/audit-2026-09-02/`.

## Current state

**Released 03.09: the audit (`w4ij`) of `93092c84..04c7c2f3`** as
`a4f1863f9010`, then `efafe77fe64e` with the two test fixes below. Two
read-only reviewers, no P1. Fixed in the tree: removing, disabling and enabling
a channel ask for an administrator (three doors, matrix, menu — any member could
delete a channel with every post on it); a declined agency gets its email
(`p3gq`); reconnecting a dropped channel is hidden from a member in two places;
the two-bars question is recorded once (`z0b0`); the runbook's
01.09 paragraphs are back under their release and `a63227c58446` has a record
naming what the releasing session did not write down; a guard holds the tabs
module on the server side of the client boundary; a comment can no longer be
attached to another workspace's post (`jjvz`). **The owner delegated the two
open questions on 03.09** («даю все разрешения») and both are decided from
§9.5, recorded as assumptions in the map §10: the two bars stay different
(`z0b0`); a search excerpt is quoted beside the fact form, never typed into
the statement (`d1rx`). Deferred: `nq7e`, `za05`, `5w6u`. Receipt in
`evidence/audit-2026-09-03/`. Before it, the 02.09 wave and everything after
was committed and pushed; the live pass brief → search → fact → showcase was
done on 03.09 and the unified context returned one fact with `ALLOW_GROUNDED`.

Production runs **`55c5e2362d8e`** (04.09.2026, the walkthrough wave);
rollback target `f1cea968184e`, also on the host. **Public CI had been red for three releases
and nobody had written it down**: the editorial-stage migration proof anchored
on a `COMMIT;` the 02.09 audit removed, and `--setupFiles=` on the time-travel
command line *replaces* the config list, so the source-tree write guard never
loaded there and its probe wrote a real file. Both fixed; **«Build» on the
public repository is green for the running commit, all four jobs.** The tag names a **public** commit: since 31.08 the image is
built from the published tree, tied by a `Source-Commit` trailer, and the
release refuses without a green receipt. **This release did change the schema**
— see «Roles» below.

Two release steps are scripts: **`switch-host-image.sh`** writes `CF_IMAGE` and
`CONTENT_FACTORY_RELEASE` from one value and refuses if the container disagrees;
**`retain-host-artifacts.sh`** keeps two images and three configuration copies —
a **standing permission** since 03.09, scoped in the runbook, nothing else.

Settled on the host: `RESEND_API_KEY` **is** set; **no** `mastra_*` tables (the
`db push` rule stands anyway); retention ran 03.09; `postgres-backup.sh`
delivered, never fired; **`send_email` v1 is terminated**, use `send_email_v2`.

**Roles, 03.09 (`saas.2.1`, released as `a63227c58446`).** Connecting a channel
is an administrator's act; the guard's exemption lost `/integrations/provider`,
which had switched the check off on a door the application calls with a session;
`AiUsageRecord` carries `userId` and the AI settings screen shows the period's
spend per member; `EDITOR` exists. Map in `docs/product/roles-matrix.md`, held
true by `tests/roles-matrix.guard.test.cjs`. Walked on the stand first: a member
is refused with a role message and sees no channel button, an administrator gets
the OAuth address, the ledger attributed real operations to whoever asked.
**The schema moved on production** — column, index, foreign key, enum value,
applied before the image switch; copy in `20260903T095548Z-pre-saas21`. An enum
value cannot go through the validated path and is applied first on its own; that
plan and this release's two traps are in the runbook.

Voice epic (closed): spec §5.1–5.4, `stages/content-factory-next-pl1/evidence/
README.md`; norm `voice-norm/ru-2026-08-30`; the two-voice rule is undecided.

## Explicit defers

Owner decisions; do not absorb or close them elsewhere (`content-factory-next-`):
`or3.9` pricing/trial/card; `3aw`, `c6k.16` owner choices; `cxd` the owner's GPG
key; `2ua` a Tavily key and paid-call authority; `71m.7` a Google channel.
Parent epics `71m`, `c6k`, `ry5`, `saas` stay open with them.

**The legal pair is shelved, its bans are not.** `saas.6` and `rry` are closed
01.09.2026 as **shelved, not decided**; the lawyer's `privacy.*.md` review waits. Two bans survive: no production deploy as SaaS and no public
residency/SLA promise. The product is **not** declared outside the EU market —
that needs its own ADR, and the marking grace period ends 02.12.2026. `2la` is
decided 31.08.2026: 48px against a published 100px, accepted as risk.

## Durable entrypoints

- Voice: contract `brand-voice/voice-wiring.contract.ts`, judging set
  `voice-composite.ts`, layout `post-layout.ts`; stand `voice-eval.cjs` and norm
  `build-voice-norm.cjs` under `scripts/evidence/` (free, offline).
- Content section: `docs/product/content-section-map.md` (§8, §9 carry every
  decision); mockups `docs/design/desert-lab/content/`; design orders under
  `docs/prompts/`; deliverability `docs/operations/email-deliverability-spf.md`.

## Next recommended

Next stage id: `content-factory-next-vme`. Recommended action: **release the
wave** — merge `wave/fixes-2026-09-04` into `main`, push, build the image from
the public tree, apply `user-blocked-at-schema-apply.sql` **before** the switch, switch, then
`workspace-role-superadmin-to-admin.sql` **after** it (the old image had no
last-admin protection), `psql` only, never `db push`, retain, then walk on production: composer draft create and
edit, role refusal, password change, second workspace, `/admin/users` with
«Заблокирован». Every step past the merge needs the owner's fresh authority.
Then the owner's decisions: `fn33.90`, `fn33.32`, `fn33.28` design → code, and
the assumptions in the beads' notes (one line each, they are listed in
`.codex/stages/content-factory-next-fn33/artifacts/`).

**What still waits on him, and only him.** Approving or declining the two
pending production accounts (decline exists since `fn33`); pressing the Telegram
binding link — until he does, nothing has ever bound. Shelved: may a domain
owner step over `robots.txt` for his own site. The two bars are decided by
delegation (map §10) — one line from him reverses it.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`.
Owner questions under «Next recommended» — answer none for him. Voice epic `e3y`
is closed; do not re-open its decisions. Before any voice check run
`rebuild-voice.cjs --dry-run`: an analysis older than the ruler carries no
print and every verdict reads «сравнить не с чем» — that is not a defect.

Traps: the dev stand must be opened at `localhost:4200`, not `127.0.0.1` — Next
16 dev refuses its own resources for a foreign host and the page never
hydrates (forms submit as GET). `git add -A` after subagent worktrees swallows
`.claude/worktrees/*` as gitlinks — now ignored. A Nest provider with a
constructor parameter passes every unit test and stops the app (`@Optional()`,
`tests/upload-module.wiring.test.cjs`). Test fakes of `Response` need
`clone()` since `custom.fetch.func.ts` clones. `/home/me/.local/bin/node` shadows nvm — check `node -v` is 22.23.2 first,
or prefix `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`. A full Jest run
leaves the frontend stand answering 500 until `apps/frontend/.next` is removed
*and* the server restarted; `libraries/` changes need `apps/backend/dist` and
`tsconfig.tsbuildinfo` gone; `tsc --noEmit` is separate from Jest and is **zero
on all three apps since the audit — keep it so**. `pnpm test` is three runs
joined by `&&`, so a red first half means the other two never ran. This handoff
is capped at 200 lines by `test_orchestration_closeout.py`. Beads rolls back
closures while agents run: close in one batch, then verify by name.

**A red check must actually go red, and check it yourself.** This wave the
audit found a guard that had skipped on every run since it was written, and a
closure whose «producer» no screen could reach. A green suite proves the unit,
never the wiring: open the page. Never `git checkout` a file you have edited to
undo a mutation. Deleting on the shared host, paid calls, DNS, deploys, pushes
and secrets each need fresh owner authority, recorded where the next reader
will look.
