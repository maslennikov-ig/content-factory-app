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

**Docs put right.** The runbook's schema procedure now prescribes applying
**before** the image switch, from a throwaway container of the new image, as
numbered steps rather than a remark. Production got the three-locale
editorial-stage migration, and its proof runs in docker-CI instead of skipping
forever.

**Deferred, each a bead:** `ni7x`, `cl19`, `th1s` (`w4vh` done 03.09). Older debt
unchanged: eleven `PrismaRepository<any>`, the archive reading the whole library
into memory, `RESEND_API_KEY` checked in the process that does not send.

That wave's receipt is in
`.codex/stages/content-factory-next-vme/evidence/audit-2026-09-02/`. Latest full
acceptance, on the roles change of 03.09, Node 22.23.2: **jest 263 suites, 3461
passed, 1 skipped**, `node --test` 113 pass 0 fail 4 skipped, python 29 OK,
`tsc --noEmit` 0 on all three apps, `git diff --check` clean, process
verification OK.

## Waves ten and eleven — the product was walked, then the mail was found

01.09.2026 the owner walked the product from registration; 02.09 he answered
the questions it raised and everything went to production. **Three defects
shared one shape: something was dead and nothing said so** — the source registry
had never worked (`SourceEvidence.organizationId` is the scalar of two
relations, Prisma drops it from a nested create), the archive mounted in no
screen, and registration in approval mode sent no mail at all; none was visible
from a suite. Mail can now report failure (Resend resolves `{data:null,error}`
instead of throwing). `zudl`'s diagnosis was wrong — SPF and MX sit on `send.`;
**nothing to change in DNS**. Section decisions:
`docs/product/content-section-map.md`, §8 (01.09) and §9 (02.09).

## Current state

**The tree is clean** — the 02.09 audit wave and everything after it is
committed and pushed, no worktrees, no stashes. The live pass the previous
handoff asked for was done on 03.09: a fresh workspace walked brief → search →
fact → showcase, evidence went PROPOSED → «Подтвердить» → ACCEPTED, and the
unified context — which used to return nothing — returned one fact with
`ALLOW_GROUNDED`.

Production runs **`6f98b58b0765`** (03.09.2026); rollback target `5d9b745ea0d8`,
also on the host. The tag names a **public** commit: since 31.08 the image is
built from the published tree, tied by a `Source-Commit` trailer, and the
release refuses without a green receipt. **The schema was not touched** by that
release — `migrate diff` from a throwaway container returned an empty migration.

Two release steps stopped being things to remember. **`switch-host-image.sh`**
performs the switch: `CONTENT_FACTORY_RELEASE` had been stale through four
releases, every error report of those periods naming a commit that was not
running, and the script now writes it and `CF_IMAGE` from one variable and
refuses to call the release finished if the container disagrees.
**`retain-host-artifacts.sh`** keeps two images and three configuration copies
per file — a **standing permission** since 03.09, scoped in the runbook, and it
covers nothing else on that shared host.

One trap, in the runbook: Docker's `--env-file` keeps quotes, so a host `migrate
diff` reads `P1013` and, piped to a file, looks like an empty diff.

Settled on the host: `RESEND_API_KEY` **is** set; there are **no** `mastra_*`
tables in `contentfactory` (Mastra has its own database since 21.08; the `db
push` rule stands anyway). Retention ran 01.09; `postgres-backup.sh`
(`ec6885a6`) is delivered and has never fired there; `test:time-travel` was
green at +400 and +1100 days on 01.09. **The v1 email workflow is terminated** —
it waited on a `condition()` with no timeout, callers now signal
`send_email_v2`, and its queue was empty.

**Roles, 03.09 (`saas.2.1`, committed, not released).** Connecting a channel is
an administrator's act; the guard's exemption lost `/integrations/provider`,
which had switched the check off on a door the application calls with a session;
`AiUsageRecord` carries `userId` and the AI settings screen shows the period's
spend per member; `EDITOR` exists. Map in `docs/product/roles-matrix.md`, held
true by `tests/roles-matrix.guard.test.cjs`. **The schema moved** — a column, an
index, a foreign key, an enum value — so the next release walks «Применение
Prisma-схемы» and `migrate diff` now prints seventeen statements, not fifteen.

Voice epic (waves eight and nine, closed): spec §5.1–5.4 and
`.codex/stages/content-factory-next-pl1/evidence/README.md`. Three facts not to
re-derive: composition plus likelihood ratio scores **74,5 / 77,0 / 85,7 %**
and the 80 % goal is taken on one corpus of three; the norm moved to
`voice-norm/ru-2026-08-30` and changed every number a person has read; the
verdict still has one voice — the rule combining two is undecided.

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

Next stage id: `content-factory-next-vme`. Recommended action: **walk the roles
change on the stand** — sign in as a member and confirm the channel button is
gone and the refusal reads as a role, then as an administrator and read the
per-member AI spend. The suite proves the doors; only the stand proves the
screens.

**The owner settled five questions on 02.09.2026**, written into
`docs/product/content-section-map.md` §9: the editorial stage is a field
(built, deployed); an accepted lead does not become reference material by
itself; archive search is by words; «Материалы» and «Что уже написали» are one
place with two views; and **material a person added themselves counts as
confirmed at the moment they add it**.

**What still waits on him, and only him.** `fkft`. Registering on production
with a third address and reading what arrives; whether to approve or delete
the two pending accounts; whether to press the Telegram binding link — until he
does, nothing has ever bound. Open questions nobody may answer: whether a
domain owner may step over `robots.txt` for his own site (shelved); the brief's
loose bar (`brief-gate.ts`: a statement plus any URL passes) against the
context's strict one — the strict bar is now reachable, so a brief built on
bare search links still yields a draft with nothing citable behind it.

Open with their remainder in comments: `odb8`/`odb8.4` (archive built, search
by words not started). `pl1.7`/`pl1.8` closing reasons hold what the voice epic
left unproven.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`. Walk
the roles change on the stand before anything else. `fkft` is the owner's, not
yours. The owner questions under «Next
recommended» — do not answer any for him. The voice epic `e3y` is closed; do not
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
