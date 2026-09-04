# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave of 04.09 (`fn33.5`–`fn33.16`, `4a79`), built on
`work/walkthrough-2026-09-04`, NOT yet released.** The owner walked
`f1cea968184e` by hand while five Opus subagents fixed, each in its own
worktree and branch, and two read-only reviewers read the merged diff. What
changed: an invitee without a session no longer lands on `http://localhost:4200`
after signing in (the proxy built `returnUrl` from the container's own
address — every value-URL now comes from `FRONTEND_URL`, and `returnUrl` is
accepted only on this origin); the confirmation page names the addressee and
refuses «Accept» to the wrong account or an existing member; declining spends
the invitation; a decline door and a session-free preview door
(`GET /auth/join-org`, for the registration form to prefill the address) are in
the roles matrix; one same-origin helper serves all three mutations; Telegram
has **one** return address for sign-in and for linking from Settings (BotFather
keeps a single Allowed URL — the second one the owner added as a workaround can
go); people are shown by their profile name everywhere, «Профиль» is a real
menu row with an avatar; upload refusals are visible and in Russian; the
password hint interpolates its numbers; `pnpm test` leaves the tree clean.
Reviewers found two blockers, both fixed and guarded: sign-out was swallowed
while an invitation cookie lived, and a signed-in Telegram return bounced to
`/` with its code. Open from the walk, owner decisions: `fn33.17` change a
member's role; `fn33.18` registering by invitation joins that workspace
directly, no own one; `fn33.19` no more workspace-level SUPERADMIN (creator is
ADMIN; instance owner is the `isSuperAdmin` flag). `fn33.15` stays open until
the owner reports the Network status of the failing upload; `fn33.20` client
30 MB vs server 10 MB; `fn33.21` Telegram return from another tab.

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

## Waves ten and eleven — the product was walked, then the mail was found

01.09–02.09.2026: the owner walked the product from registration and everything
went to production. **Three defects shared one shape: something was dead and
nothing said so** — the source registry never worked (Prisma drops the scalar of
two relations from a nested create), the archive mounted in no screen, approval
mode sent no mail; none visible from a suite. `zudl` was wrong: SPF and MX sit
on `send.`, **nothing to change in DNS**. Decisions: `content-section-map.md` §8, §9.

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

Production runs **`f1cea968184e`** (03.09.2026, the `fn33` walkthrough fixes);
rollback target `efafe77fe64e`, also on the host. **Public CI had been red for three releases
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

Next stage id: `content-factory-next-vme`. Recommended action: **release
`work/walkthrough-2026-09-04`** by the runbook once the owner grants the five
release actions, then continue his walkthrough from scenario 4 (Content),
Materials/archive, two organisations. Decide with him `fn33.18`/`fn33.19`
(both P2, product decisions recorded in the beads) before building them. The
two pending accounts on `/admin/users` are still his call.

**The owner settled five questions on 02.09.2026**, written into
`docs/product/content-section-map.md` §9: the editorial stage is a field
(built, deployed); an accepted lead does not become reference material by
itself; archive search is by words; «Материалы» and «Что уже написали» are one
place with two views; and **material a person added themselves counts as
confirmed at the moment they add it**.

**What still waits on him, and only him.** Approving or declining the two
pending production accounts (decline exists since `fn33`); pressing the Telegram
binding link — until he does, nothing has ever bound. Shelved: may a domain
owner step over `robots.txt` for his own site. The two bars are decided by
delegation (map §10) — one line from him reverses it.

Open with remainder in comments: `odb8.4` (archive search by words not
started); `pl1.7`/`pl1.8` hold what the voice epic left unproven.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`.
Owner questions under «Next recommended» — answer none for him. Voice epic `e3y`
is closed; do not re-open its decisions. Before any voice check run
`rebuild-voice.cjs --dry-run`: an analysis older than the ruler carries no
print and every verdict reads «сравнить не с чем» — that is not a defect.

Traps: `/home/me/.local/bin/node` shadows nvm — check `node -v` is 22.23.2 first,
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
