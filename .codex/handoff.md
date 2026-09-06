# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave «вход одной мыслью» (06.09, epic `tu3k`, owner on the live walk:
the eight-field brief is «слишком сложно» — one field, the model fills the
brief) — on branch `wave/intake-2026-09-06`, NOT yet merged/released when this
paragraph was written; see the release record in `production-deploy.md` if
it exists.** Four Opus streams, no reviewer and no paid stand pass (owner:
«скорость, тестировать буду на боевом»). `POST /content-intelligence/intake`
(NDJSON, EDITOR+POSTS_PER_MONTH, ≤3 channels): thought / link / foreign post
→ one `extract` call for claims, ≤3 number checks by search, one `extract`
fill, `evaluateBrief` unchanged, ≤2 questions only for thesis/facts (position,
disagreement, audience the model proposes as «предположение»), then
`AgentGraphService.start` per channel with `body.intake` hints (brief block,
channel lines after examples before guardrails, `provider` into context and
voice, 8-word anti-copy with one retry) and a DRAFT post per channel with
context. New column `Integration.writingProfile Json?` (`docs/operations/
integration-writing-profile-schema-apply.sql`, **before the switch**), doors
`GET/PUT/DELETE /integrations/:id/writing-profile` (EDITOR — writing, not
ownership). Slop check `text-quality/slop-check.ts` (30 RU + 15 EN rules, no
model; JS `\b` is ASCII — boundaries are `\p{L}` lookarounds) behind
`POST /content-intelligence/text-quality/slop-check` and `options.slopCheck`.
Screens: one `IntakeContainer`, two doors (calendar «Из мысли» replacing the
billing-gated generator; `/content?tab=brief` intake-first, «Вручную» second
view), questions card, receipt «Что модель поняла», channel card «Как пишем в
«X»», findings by click only. Found on the way: LangGraph drops undeclared
state keys — `draftGaps` never reached the screen since 05.09 (fixed). Open:
`SOURCE_DIRECT_FETCH` is off on production → link input answers «вставьте
текст» until the owner turns it on; `stored` flag for the channel badge,
`search-started` event, slop noise on «данные»/«не только» (P3s under `tu3k`).

**Wave «search into drafts» (05.09, epic `ec48`, owner's answer to `2ua.1`:
«можно… не „не проверено“, а „взято из поиска“… ограничивать я бы никак не
стал») — merged to `main` as `da056915`, RELEASED as `443bd0a450c8` (no schema
change, rollback `da34f1a9e832`; receipt 379/4607, node 124/0, python 46 OK).**
Four Opus streams + reviewer (no P0; 3 P1 + 4 P2 fixed before release) + paid
second pass on the stand (`docs/product/material-quality-check-2026-09-05-
second-pass.md`: **5 of 7 texts grounded vs 0 of 5**; found `ec48.3`, half of
the search lost to the other query's deadline — fixed) + production walker
(`fn33.145`: roles correct; no channel → no composer for anyone `fn33.148`,
Agent screen silent about missing AI `fn33.153`, stage-filter language
`fn33.146` — all fixed; ten P3 `fn33.147`–`.158` open). Builder admits fresh
search evidence as `provenance: SEARCH` (`inclusionReason SEARCH_UNCONFIRMED`),
prompt marks it and forbids numbers outside the block; generator searches once
per generation when no explicit material (reuse by URL, deny-list applies);
subject-language query first; excerpt hygiene (menus, footers, AMP, https
only); labels «Взято из поиска» in the composer, showcase and search panel.
Also: `cxd` restore rehearsal DONE (key is on the host, no passphrase; **key
expires 16.09.2026**), `c6k.16` closed (decided 17.08). Open: `fn33.132`
(subject drift), `ec48.6`, `.7`, `fn33.159` (draft without channel — owner).

**Wave «owner decisions» (05.09, owner away, «даю все разрешения — делай») —
merged to `main` as `9e4d7474`, RELEASED as `da34f1a9e832` (column
`learnedRules` applied before the switch, rollback `035029af3c18`, backup
`20260905T124600Z-pre-learnedrules`; receipt 374/4542, node 117/0).**
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
agent now read the role first (`.90.4`–`.90.12`); P3s `.141`–`.144` open.
`2ua.1` answered 05.09 → wave `ec48`. Open from the check: `.132`, `.138`.

**Wave «cleanup» (05.09) — `41447f87`, RELEASED `dcb6eae72608` (two SQL files
as one transaction), then ten walker P3s as `035029af3c18`.** Cascade deletion
of a workspace (44 FKs), model per role (`roleModels`, `AiUsageRecord.role`),
admin count inside the Serializable write, tenant ledger by method, 60/min AI
ceiling, copilot on click, Russian everywhere, 402 localized once, release
scripts validate the tag before ssh, 34 platform marks. New: `11qv`, `ebyq`.

**Wave «compose window» (04.09, `fn33.28.1`–`.17`) — RELEASED `fc9fa77148f6`.**
Composer = Postiz core + stage; context review door; **posts with a context had
failed to save since August** (`await import` never rewritten). Open: `.28.5`, `.28.18`.

**Wave of 04.09, second half (`fn33.15`–`fn33.118`) — RELEASED `d782858045fa`;
wave twelve (02.09) audited waves ten and eleven: `lh5s` reopened and built.

## Current state

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
continues the live walk from stage D on the new intake** — open «Контент →
Бриф» (or «Из мысли» on the calendar), paste a thought, then a foreign post
with three numbers, pick the Telegram channel, read the receipt origins and
the «не подтверждено» facts, open the editor, run «Проверить на штампы». Every
gap to Beads first, fixes in one wave after. Still his: `SOURCE_DIRECT_FETCH`
on production (link input), GPG key before 16.09.2026, «Подключить Telegram»,
`fn33.159`, `or3.9`, `fn33.132` after another paid check.

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
