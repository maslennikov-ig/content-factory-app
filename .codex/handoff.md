# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave «compose window» (evening 04.09, `fn33.28.1`–`.17`, 16 closed) —
merged to `main` as `b27e25cc`, pushed, and RELEASED 05.09 as `fc9fa77148f6`
(two `Post` columns applied before the switch, rollback `d782858045fa`).**
The owner saw the old composer on production and decided: only what is
useful. Five Opus streams: (A) `Post.contentContextReviewedAt/ById` and
`POST /posts/:id/context-review` — the draft-only boundary is left by an
explicit human decision tied to the snapshot (a swapped snapshot clears the
mark); (B) composer = Postiz core + stage, context panel and voice ribbon
became one provenance line for posts with context, research left the window,
tag/repeat/stage on `Menu`, standard dialog shell, «Подтверждения»/«Кто
пишет» everywhere; (C) `GET /settings/ai/allowance` + hint at paid buttons;
(D, E) cleanup, Russian refusals by code, copilot never called without a key.
**Found: every post with a content context failed to save with 500 since
August** — `await import('@contentfactory/…')` that `nest build` never
rewrites; production has it too; static import + guard. Receipt: 340 suites,
4125 tests, `node --test` 116/0, python OK. Public CI on `fc9fa77`: two
test-only reds (docker proof's hand-rolled `Post` table, `expect.any(Date)`
under fake timers + time travel), fixed next commit. Open: `fn33.28.4`, `.5`, `.18`.

**Wave of 04.09, second half (`fn33.15`–`fn33.118`, 81 closed) — merged to
`main` as `8443eedc`, pushed, and RELEASED as `d782858045fa` (schema column
before the switch, role data step after it).** The owner asked to fix
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

The owner asked for a full audit of «all done». Two read-only reviewers, four
bounded workers; every guard red before green. **«All done» was not true**:
`lh5s` was reopened and built (`tyrk`, `rrs9`, `4zef`, 03.09): §9.5 evidence
assessments and «Подтвердить» on product-found rows, §9.4 archive as a view
inside «Материалы», bounded email retry, `continueAsNew` on the lead check,
Telegram binding rechecks `isSuperAdmin`. Deferred: `ni7x`, `cl19`, `th1s`;
eleven `PrismaRepository<any>`, the archive read whole into memory. Receipt
in `.codex/stages/content-factory-next-vme/evidence/audit-2026-09-02/`.

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

Production runs **`d782858045fa`** (04.09.2026, second half of the wave);
rollback target `55c5e2362d8e`, also on the host. Backup before the schema:
`postgres/20260904T144125Z-pre-blockedat-product-only`. **Public CI had been red for three releases
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
`or3.9` pricing/trial/card; `3aw`, `c6k.16` owner choices; `cxd` GPG key;
`2ua` Tavily key and paid-call authority; `71m.7` a Google channel. Parents
`71m`, `c6k`, `ry5`, `saas` stay open. **Legal pair shelved, bans not:**
`saas.6`, `rry` closed 01.09 as shelved; the lawyer's `privacy.*.md` review
waits; no SaaS production deploy, no residency/SLA promise; not declared
outside the EU (needs its own ADR, marking grace ends 02.12.2026). `2la`:
48px against a published 100px, accepted as risk 31.08.

## Durable entrypoints

- Voice: contract `brand-voice/voice-wiring.contract.ts`, judging set
  `voice-composite.ts`, layout `post-layout.ts`; stand `voice-eval.cjs` and norm
  `build-voice-norm.cjs` under `scripts/evidence/` (free, offline).
- Content section: `docs/product/content-section-map.md` (§8, §9 carry every
  decision); mockups `docs/design/desert-lab/content/`; design orders under
  `docs/prompts/`; deliverability `docs/operations/email-deliverability-spf.md`.

## Next recommended

Next stage id: `content-factory-next-vme`. Recommended action: **the owner
walks production `fc9fa77148f6`** — composer without context (core + stage
only), a post from the Content section (one provenance line, «Подтверждения
проверены» opens scheduling), the allowance hint at «Найти» — and every gap
goes to Beads first, fixes in one wave after. Confirm public CI `Build` is
green on the follow-up commit. Then the owner's decisions: `fn33.28.4`,
`fn33.90`, `fn33.32`, and the assumptions in the beads' notes.

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

Traps: open the dev stand at `localhost:4200`, not `127.0.0.1` (Next 16 dev
never hydrates for a foreign host). `git add -A` after subagent worktrees
swallows `.claude/worktrees/*` — now ignored. A Nest provider with a
constructor parameter passes unit tests and stops the app (`@Optional()`,
`tests/upload-module.wiring.test.cjs`). Fakes of `Response` need `clone()`.
`/home/me/.local/bin/node` shadows nvm — prefix
`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`. `libraries/` changes
need `apps/backend/dist` rebuilt; `tsc --noEmit` is separate from Jest and is
**zero on all three apps — keep it so**. `pnpm test` is three runs joined by
`&&`. Never `await import('@contentfactory/…')` in backend code — `nest build`
does not rewrite it (guard `backend-no-dynamic-alias-import`). This handoff is
capped at 200 lines. Beads rolls back closures while agents run: close in one
batch, then verify by name. Artifact `evidence` entries are labels, not paths.

**A red check must actually go red, and check it yourself.** The audit found
a guard that had skipped on every run and a closure whose «producer» no screen
could reach. A green suite proves the unit, never the wiring: open the page.
Deleting on the shared host, paid calls, DNS, deploys, pushes and secrets each
need fresh owner authority, recorded where the next reader will look.
