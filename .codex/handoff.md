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
guard added was shown red once before green. **The tree holds the fixes
uncommitted** — see «Current state».

**«All done» was not true, and the remainder was honestly recorded.** Of the
seventeen handed-over beads thirteen were closed; `rrs9`, `4zef`, `odb8`,
`odb8.4` stayed open with their remainder in comments, and a new P1 `tyrk` was
found and left open. Two closures did not hold: `lh5s` (a search result «can
become evidence» — the producer exists, nothing in the frontend calls it; no
search screen exists at all) is **reopened**; `tyrk` is now built.

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

**Docs put right.** The runbook's schema procedure prescribes **before** the
image switch with a throwaway container from the new image — the numbered
steps, not a remark; the paragraph claiming mail cannot report failure is now
history; the four `*-schema-apply.sql` files are linked and the three Telegram
columns named; the editorial-stage migration lists all sixteen locales' tag
names (production got the three-locale version — the file says so);
`LEAD_FEED_CHECK_ENABLED` and `EMAIL_PROVIDER` reach `.env.example`;
`interpolate` HTML-escapes; the design orders no longer ask for the two tabs
the owner cancelled nor carry the refuted SPF diagnosis; the editorial-stage
migration proof runs in docker-CI instead of skipping forever.

**Deferred, each a bead:** `ni7x` subscriptions cap and check throttle; `cl19`
read-only state for showcase and archive; `w4vh` third copy of the locale
decision; `th1s` the calendar guard checks class names, not geometry. Older debt
unchanged: eleven `PrismaRepository<any>`, the archive reading the whole library
into memory, `RESEND_API_KEY` checked in the process that does not send.

**Only the owner can settle `fkft`.** The 02.09 release, the schema applications
on production, terminating `send_email` v1 and the push to `origin/main` were
each excluded by the orchestrator prompt's authority section unless the owner
said so per item; no record of him saying so exists in the handoff, the runbook
or Beads. Confirm or reject after the fact.

Acceptance on the audit tip, Node 22.23.2, receipt in
`.codex/stages/content-factory-next-vme/evidence/audit-2026-09-02/`: **jest 254
suites, 3307 passed, 1 skipped** (full run plus the one guard re-run after it
was brought to three native proofs), `node --test` 113 pass 0 fail 4 skipped,
python 29 OK, `tsc --noEmit` 0 on frontend, backend and orchestrator,
`git diff --check` clean, process verification OK.

## Waves ten and eleven — the product was walked, then the mail was found

01.09.2026 the owner walked the product from registration; 02.09 he answered
the questions it raised and everything went to production. **Three defects
shared one shape: something was dead and nothing said so** — the source
registry had never worked (`SourceEvidence.organizationId` is the scalar of two
relations, Prisma drops it from a nested create), the archive mounted in no
screen, and registration in approval mode sent no mail at all. None was visible
from a suite. **A green suite proves the unit, never the wiring**; opening the
page in a browser and refusing `as any` on new code both paid for themselves.
Mail can now report failure (Resend resolves `{data:null,error}` instead of
throwing; the provider used to swallow it). `zudl`'s diagnosis was wrong — SPF
and MX sit on `send.`; **nothing to change in DNS**. Every section decision is
in `docs/product/content-section-map.md`, §8 (01.09) and §9 (02.09).

## Current state

**Uncommitted in the tree (02.09, audit wave): ~52 files** — the fixes above,
their guards, and this handoff. Nothing of it has been run on the stand or in a
browser; every claim is unit-level and type-level. Commit is the owner's call,
then a live pass of brief → fact → copilot is the first thing to do.

Production runs **`5d9b745ea0d8`** (02.09.2026); rollback target
`f2452df947e8`, also on the host. The tag names a **public** commit: since
31.08 the image is built from the published tree, tied by a `Source-Commit`
trailer, and the release refuses without a green receipt. On 02.09 the schema
was applied **before** the image switch from a throwaway container of the new
image — the runbook now says exactly that; production had been four changes
behind (`User.language`, `ContentLead*`, `Post.editorialStage`, the three
Telegram columns) and the new code selects all of them. Backups first:
`/srv/content-factory-next/backups/pre-*.dump`.

Settled on the host: `RESEND_API_KEY` **is** set; there are **no** `mastra_*`
tables in `contentfactory` (Mastra has its own database since 21.08; the `db
push` rule stands anyway). Retention ran 01.09. `postgres-backup.sh`
(`ec6885a6`) is delivered and has never fired there. `test:time-travel` was
green at +400 and +1100 days on 01.09. **The v1 email workflow is terminated**
— it waited on a `condition()` with no timeout and callers now signal
`send_email_v2`; its queue was empty.

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
Google channel; `fkft` the 02.09 authority. Parent epics `71m`, `c6k`, `ry5`,
`saas` stay open with them.

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

Next stage id: `content-factory-next-vme`. Recommended action: **commit the
audit wave, then walk brief → fact → copilot on the stand** — the first live
proof that the unified context is no longer empty.

**The owner settled five questions on 02.09.2026**, written into
`docs/product/content-section-map.md` §9: the editorial stage is a field
(built, deployed); an accepted lead does not become reference material by
itself; archive search is by words; «Материалы» and «Что уже написали» are one
place with two views (built in the audit); and **material a person added
themselves counts as confirmed at the moment they add it** — built as `tyrk`,
uncommitted, not run live.

**What still waits on him, and only him.** `fkft`. Registering on production
with a third address and reading what arrives; whether to approve or delete
the two pending accounts; whether to press the Telegram binding link — until he
does, nothing has ever bound. Open questions nobody may answer: whether a
domain owner may step over `robots.txt` for his own site (shelved); the brief's
loose bar (`brief-gate.ts`: a statement plus any URL passes) against the
context's strict one — the strict bar is now reachable, so a brief built on
bare search links still yields a draft with nothing citable behind it.

Open with their remainder in comments: `rrs9` (onboarding still describes only
the Postiz loop), `4zef` (order and canvas written, no letter reformatted),
`odb8`/`odb8.4` (archive built, search by words not started), `lh5s` (reopened:
no screen produces search evidence), `tyrk` (built, uncommitted, not run live).
`pl1.7`/`pl1.8` closing reasons hold what the voice epic left unproven.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`. Settle
first the **uncommitted audit wave**: reviewed and green, commit is the owner's
call; then run the live pass brief → fact → copilot on the stand before anything
else. `fkft` is the owner's, not yours. The owner questions under «Next
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
