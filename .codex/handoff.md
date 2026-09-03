# Content Factory Handoff

Current stage id: `content-factory-next-vme`
Last accepted stage id: `content-factory-next-e3y`
Selected Beads goal: `content-factory-next-vme`

`vme` closed 31.08.2026 by the owner, and `cft` with it: the tree is published as
[`content-factory-app`](https://github.com/maslennikov-ig/content-factory-app) —
public, no history; the private repository stays the archive and this working copy
points at it.

## Wave twelve — the audit of waves ten and eleven (02.09.2026)

The owner asked for a full audit of what the orchestrator reported as «all
done». Two read-only reviewers (backend/security/Temporal/schema; product/
frontend/docs) over `7bf12bcc^..11fe62a3`, then four bounded workers. Every
guard added was shown red once before green. Committed 03.09 — see «Current
state».

**«All done» was not true.** Of seventeen handed-over beads thirteen were
closed; `lh5s` was reopened — «a search result can become evidence» while
nothing in the frontend called the producer. It and `tyrk`, `rrs9`, `4zef` are
built and closed on 03.09, walked by hand.

**Built.** `tyrk` — the owner's rule of 02.09 (§9.5): producers write
`ContentEvidenceAssessment` (own material `ACCEPTED`, search `PROPOSED`); a
fact without evidence is `VERIFIED` on creation and admitted by the unified
context as own word, honouring its own `freshUntil`; a user link to accepted
evidence is accepted at once; `confirmEvidence` + `POST
/facts/:factId/evidence/:evidenceId/confirm` is the door for product-found
evidence, with «Подтвердить» only on those rows; a `SUPERSEDED` fact can no
longer be restored over its copy. §9.4 — the archive is a **view inside
«Материалы»**, five tabs, old `?tab=archive` links land on it. Email v2 has a
**bounded retry** (5 attempts, 30 min schedule-to-close) so one failing
recipient cannot stall the instance's mail; the lead-check workflow
`continueAsNew`s every 100 passes; a failed periodic start is recovered by the
manual «Проверить сейчас»; feed items without id/guid/link get a content hash,
not a position; Telegram binding rechecks `isSuperAdmin`. Backend `tsc
--noEmit` is **zero errors** for the first time since 30.08.

**Docs put right.** The runbook prescribes schema **before** the image switch,
from a throwaway container of the new image, as numbered steps; the
editorial-stage migration proof runs in docker-CI instead of skipping forever.

**Deferred, each a bead:** `ni7x`, `cl19`, `th1s`. Older debt unchanged: eleven
`PrismaRepository<any>`, the archive read whole into memory, `RESEND_API_KEY`
checked in the process that does not send.

That wave's receipt is in
`.codex/stages/content-factory-next-vme/evidence/audit-2026-09-02/`. Latest full
acceptance, released as `a63227c58446`: **jest 263 suites, 3461 passed, 1
skipped**, `node --test` 113 pass 0 fail, python 29 OK, `tsc --noEmit` 0 on all
three apps, process verification OK.

## Waves ten and eleven — the product was walked, then the mail was found

01.09.2026 the owner walked the product from registration; 02.09 he answered
the questions it raised and everything went to production. **Three defects
shared one shape: something was dead and nothing said so** — the source registry
had never worked (`SourceEvidence.organizationId` is the scalar of two
relations, Prisma drops it from a nested create), the archive mounted in no
screen, and registration in approval mode sent no mail at all; none was visible
from a suite. Mail can now report failure (Resend resolves `{data:null,error}`
instead of throwing). `zudl` was wrong: SPF and MX sit on `send.`, **nothing to
change in DNS**. Decisions: `content-section-map.md` §8 (01.09), §9 (02.09).

## Current state

**Released 03.09: the audit (`w4ij`) of `93092c84..04c7c2f3`** as
`a4f1863f9010`; a second release carries the two test fixes below. Two
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

Production runs **`a4f1863f9010`** (03.09.2026, the audit); rollback target
`a63227c58446`, also on the host. **Public CI had been red for three releases
and nobody had written it down**: the editorial-stage migration proof anchored
on a `COMMIT;` the 02.09 audit removed, and `--setupFiles=` on the time-travel
command line *replaces* the config list, so the source-tree write guard never
loaded there and its probe wrote a real file. Both fixed in tests; check
«Build» on the public repository is green for the running commit. The tag names a **public** commit: since 31.08 the image is
built from the published tree, tied by a `Source-Commit` trailer, and the
release refuses without a green receipt. **This release did change the schema**
— see «Roles» below.

Two release steps are scripts now: **`switch-host-image.sh`** writes
`CF_IMAGE` and `CONTENT_FACTORY_RELEASE` from one value and refuses to finish
if the container disagrees; **`retain-host-artifacts.sh`** keeps two images and
three configuration copies per file — a **standing permission** since 03.09,
scoped in the runbook, covering nothing else on that shared host.

Settled on the host: `RESEND_API_KEY` **is** set; **no** `mastra_*` tables in
`contentfactory` (the `db push` rule stands anyway); retention ran 03.09;
`postgres-backup.sh` (`ec6885a6`) delivered, never fired; **`send_email` v1
is terminated**, callers signal `send_email_v2`.

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
README.md`. Not to re-derive: scores **74,5 / 77,0 / 85,7 %** on one corpus of
three; the norm is `voice-norm/ru-2026-08-30`; the rule combining two voices is
undecided.

## Explicit defers

Owner decisions; do not absorb or close them elsewhere (`content-factory-next-`):
`or3.9` pricing/trial/card; `3aw` and `c6k.16` owner choices; `cxd` needs the
owner's private GPG key; `2ua` a Tavily key and paid-call authority; `71m.7` a
Google channel. `fkft` closed 03.09 — the 02.09 authority is recorded in the
runbook. Parent epics `71m`, `c6k`, `ry5`, `saas` stay open with them.

**The legal pair is shelved, its bans are not.** `saas.6` and `rry` are closed
01.09.2026 as **shelved, not decided**; the lawyer's review of `privacy.*.md`
waits with them. Two bans survive: no production deploy as SaaS and no public
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

Next stage id: `content-factory-next-vme`. Recommended action: **read the roles
change on production the way a person will** — every workspace there holds only
superadmins, so nothing has yet met a refusal. Invite someone as `EDITOR`.

**The owner settled five questions on 02.09.2026**, written into
`docs/product/content-section-map.md` §9: the editorial stage is a field
(built, deployed); an accepted lead does not become reference material by
itself; archive search is by words; «Материалы» and «Что уже написали» are one
place with two views; and **material a person added themselves counts as
confirmed at the moment they add it**.

**What still waits on him, and only him.** Registering on production
with a third address and reading what arrives; whether to approve or delete
the two pending accounts; whether to press the Telegram binding link — until he
does, nothing has ever bound. Open question nobody may answer: whether a
domain owner may step over `robots.txt` for his own site (shelved). The two
bars are decided by delegation (map §10) — one line from him reverses it.

Open with their remainder in comments: `odb8`/`odb8.4` (archive built, search
by words not started). `pl1.7`/`pl1.8` closing reasons hold what the voice epic
left unproven.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`.
The owner questions under «Next recommended» — do not answer any for him. The voice epic `e3y` is closed; do not
re-open its two owner decisions. Before any voice check run `rebuild-voice.cjs
--dry-run`: an analysis older than the ruler carries no print and every verdict
reads «сравнить не с чем», which looks like a defect and is not.

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
