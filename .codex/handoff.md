# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave «owner decisions» (05.09, owner away, «даю все разрешения — делай»;
branch `wave/owner-decisions-2026-09-05`, release record in the runbook).**
Owner answered nine questions; six Opus streams + reviewer + paid check +
roles walker. (A) **the avatar learns from edits** (`fn33.28.19`, `.28.19.1`):
substantive was/became pairs (≥0.1 share and ≥3 words) kept ≤200 per avatar,
`POST /voice/learning/run` = one `extract` call per batch of the 30 OLDEST
pending pairs, 1–3 rules, ≤10 kept in the new column
`ProjectBrandProfile.learnedRules` (`docs/operations/
brand-voice-learned-rules-schema-apply.sql`, **before the switch**),
`lastRunAt` = createdAt of the last pair read; rules reach the prompt as
observations after the habits (`voice-directives.ts`), fenced; the learn prompt
fences the pairs. (B) **roles** (`fn33.90`, `.90.1`): USER view-first, EDITOR
writes (posts, tags, whole Content section, sets, signatures, autopost,
assistant incl. `/copilot/chat`, media), ADMIN owns (webhooks, channels incl.
all `/integrations/:id/*` settings); `Sections.EDITOR` via `ROLE_SECTIONS`;
editor refusal has its own text + `role_refusal_editor_only`; matrix 130 doors
— the guard had been blind to policies declared as a constant (20 doors) and
is still blind to doors with no policy at all (`fn33.90.2`). (C) word search
`q` on materials and facts (`odb8.4`; posts `odb8.4.1`). (D)
`docs/product/tariff-levers.md`: 31 levers, 13 questions — **no plan limit is
live without `STRIPE_PUBLISHABLE_KEY`**, three mismatches under `or3.9.1`.
(E, F) from the paid check `2ua` (`docs/product/material-quality-check-
2026-09-05.md`, 0/5 topics grounded): honesty of the prompt when the context
is empty (`fn33.130`), the composer names unverified evidence and links to
«Откуда факты» (`.131`), the English «Check out the full story» tail only with
a link and in the channel language (`.137`), search panel: summary in the
reader's language, http refused on screen with a reason, 503 with a code
instead of 500, dates (`.133`, `.136`, `.139`, `.135`). Review: no P0, three P1
fixed before release. Roles walker on the stand: server doors match the matrix
in all 40 probes; **`DELETE /integrations` with an empty body soft-deleted every
post of the workspace** (`fn33.90.3`, DTO + lookup + repository guard); the
USER screen leaked in eight places — menu, composer, media, brief, archive,
agent now read the role first (`.90.4`–`.90.12`); P3s `.141`–`.144` open. **Owner question `2ua.1`: unverified search results stay
out of drafts by spec — allow them labelled, or keep confirm-first?** Open from
the check: `.132`, `.134`, `.138`, `.140`; `.28.19.2` dead repair door.

**Wave «cleanup» (05.09) — `41447f87`, RELEASED `dcb6eae72608` (two SQL files
as one transaction), then ten walker P3s as `035029af3c18`.** Cascade deletion
of a workspace (44 FKs), model per role (`roleModels`, `AiUsageRecord.role`),
admin count inside the Serializable write, tenant ledger by method, 60/min AI
ceiling, copilot on click, Russian everywhere, 402 localized once, release
scripts validate the tag before ssh, 34 platform marks. New: `11qv`, `ebyq`.

**Wave «compose window» (04.09, `fn33.28.1`–`.17`) — `b27e25cc`, RELEASED
`fc9fa77148f6`.** Composer = Postiz core + stage; `Post.contentContextReviewedAt/
ById` + `POST /posts/:id/context-review`; allowance hint at paid buttons.
**Every post with a content context had failed to save since August** —
`await import('@contentfactory/…')` never rewritten by `nest build`. Open: `.28.5`, `.28.18`.

**Wave of 04.09, second half (`fn33.15`–`fn33.118`, 81 closed) — merged to
`main` as `8443eedc`, RELEASED as `d782858045fa` (schema column before the
switch, role data step after it).** Sixteen Opus streams, five walkers on the
stand, two re-checks. Invitations land in the invited workspace with the role;
no workspace `SUPERADMIN`, creator is `ADMIN`, last admin protected; team list
with role change and invitation expiry; account reject/decline/delete/unblock;
password change; second workspace; language on the account; media modal;
**composer returned 500 since 20.08** (`.49`, `.88`); CopilotKit off the app
shell (`.48`); 403 no longer hangs saves (`.65`); content section (`.45`–`.91`).
Review + two control walks: `fn33.108`–`.110` fixed. Receipt `0edb16ee`.

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
read-only reviewers, no P1. Fixed: channel removal/disable/enable ask for an
administrator (any member could delete a channel with every post on it); a
declined agency gets its email (`p3gq`); reconnecting a dropped channel hidden
from a member; the two-bars question recorded once (`z0b0`); runbook records
restored for 01.09 and `a63227c58446`; a comment can no longer be attached to
another workspace's post (`jjvz`). **The owner delegated the two
open questions on 03.09** («даю все разрешения») and both are decided from
§9.5, recorded as assumptions in the map §10: the two bars stay different
(`z0b0`); a search excerpt is quoted beside the fact form, never typed into
the statement (`d1rx`). Deferred: `nq7e`, `za05`, `5w6u`. Receipt in
`evidence/audit-2026-09-03/`. Before it, the 02.09 wave and everything after
was committed and pushed; the live pass brief → search → fact → showcase was
done on 03.09 and the unified context returned one fact with `ALLOW_GROUNDED`.

Production runs **`035029af3c18`** (05.09.2026, walker P3 wave); rollback
`dcb6eae72608`, also on the host. Backup before the schema:
`postgres/20260905T075257Z-pre-cleanup-product-only`. **Public CI had been red
for three releases unnoticed** (a migration proof anchored on a removed
`COMMIT;`; `--setupFiles=` replacing the config list) — both fixed 03.09; the
two extra jobs run locally before every public push since 05.09. The tag names
a **public** commit: the image is built from the published tree, tied by a
`Source-Commit` trailer, and the release refuses without a green receipt.

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
walks production after the owner-decisions release** — as EDITOR and USER in
one workspace (view-first, refusals in Russian), the avatar screen «Чему
научился на правках» after five real edits, word search in the archive, the
composer's note on unverified evidence, the search panel in Russian — every
gap to Beads first, fixes in one wave after. Then answer `2ua.1` (unverified
search into drafts?). Still his: `c6k.16`, `or3.9`, `cxd` (GPG key), Telegram
binding, two pending accounts.

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
