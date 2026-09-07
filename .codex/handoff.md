# Content Factory Handoff

Current stage id: `content-factory-next-fn33`
Last accepted stage id: `content-factory-next-fn33`
Selected Beads goal: `content-factory-next-fn33`

**Wave «прогон 07.09» (07.09, epic `m2eg`, 25 tasks, plan
`orchestrator-stage-codex-handoff-md-modular-hearth`) — merged to `main` as
`553a74c9`, RELEASED as `9b538b9a2e25` 07.09, then the audit tail `47cd8475c442`
(private `d16a4630`, six small fixes, rollback `9b538b9a2e25`; no schema
change either time).** Source: the owner's
live walk of `7e2b10bf1100` (artifact `fe5e030b`, 24 notes, 5 screenshots in
`stages/content-factory-next-fn33/evidence/walk-2026-09-07/`). Seven Opus 5
streams in worktrees, no reviewer, no stand (owner: speed over checks); mockups
approved before UI code (`docs/design/desert-lab/pieces/`, canvas
`c569cf13`). Full `pnpm test` three halves green (jest 403/5155, node 128/0,
python 46), `tsc` zero on three apps, process verification OK. Owner decisions
07.09: **adaptation never searches the web, no citation checkboxes, no
«Проверил» gate** (reverses the 04.09 gate of `fn33.28`); «Что уже написали»
stays and feeds «Свои тексты по теме»; «С чего начать» is a menu item until
all six steps are done; the facts question reads «На что это опирается?».
What changed: (S1) the CORE piece is written right after the brief fill —
`piece` is the first stream event, the intake screen navigates to
`/content/pieces/[id]` itself, open questions live in `ContentPiece.brief`
and are answered on the piece page through `POST
/content-intelligence/pieces/:id/answer` (NDJSON, EDITOR+POSTS_PER_MONTH,
server-side two-round limit, `BriefFact.own` makes a person's word grounded,
`recordCore` throws `PIECE_NOT_SAVED`); (S2) **the pieces table had never
rendered on production**: Tailwind 3.4 silently drops `min-[…]`/`max-[…]`
variants when `screens` contains `raw` objects — now a named screen
`table: '720px'` and a guard in `design.guard`; piece page and table follow the
mockups, `promoteNoChannel` makes «нет канала» real, search keeps focus
(debounce + `keepPreviousData`) and highlights; (S3) the channel card PUT sent
the response shape (`lengthPolicy` object) into a DTO expecting
`'range' + length` — 400 on every save, fixed in the adapter with DTO-backed
tests; (S4) voice analysis streams (`POST …/voice/analysis/stream`, one event
per model call, map concurrency 3), the Telegram export card takes `.json`,
nginx `/api/` waits 300 s; (S5) `materialPolicy: 'PIECE_ONLY'` on adapt,
`TextSearchService` on `@orama/orama` 3.1.18 + Russian stemmer (in-memory per
org, TTL + invalidation, fallback `search-terms.ts`), `GET
/content-intelligence/materials/related`, «Свои тексты по теме» in the prompt
and the compose window, publish menu is a real `Menu` (`MenuCommand` added to
the primitive); (S6) «С чего начать» first in the sidebar, the brief step
counts `ContentPiece kind='CORE'`, usage tables always visible; (S7)
`launches/channel-rail.tsx` — one rail geometry for both states (`tu3k.13`).
Bounded gaps: the `related` event is not drawn on the piece page (only in the
compose window); index invalidation on intake/publish relies on the 5-minute
TTL; `menu.tsx` «⋮» is still 24 px wide inside its 32 px seat; group header in
the collapsed rail still overflows. Open for the owner: `m2eg.25` (posting to
Telegram as a person needs MTProto — not planned).

**Small wave 07.09 (`tu3k.6`, `.10`, `.11`, `.12`) — RELEASED as `7e2b10bf1100`**
(rollback `a6be7f3fbb92`, no schema): channel badge «настроено» from
`GET /integrations/list`, adaptation `kind` picked by the person
(`ui/segmented.tsx`), «В архив», 8 container tests on adapt, `search-started`
typed, `core-write.ts` under the AI-consumer guard, list door without tokens.

**Wave «заготовка и адаптации» (06–07.09, epic `tu3k.9`) — RELEASED
`a6be7f3fbb92`** (schema `piece-adaptation-schema-apply.sql` applied BEFORE the
switch, rollback `cd636483ba0a`). `ContentPiece.kind='CORE'` + `brief`;
`ContentDerivation.kind/title/body/mediaId`; publication state READ from the
post; core = one `draft` call from the person's words (`pieces/core-write.ts`);
doors under `/content-intelligence/pieces`; screens
`content-intelligence/pieces/*`; the avatar-learning trap closed
(`recordFromPost` compares `ContentDerivation.body`).

**Wave «вход одной мыслью» (06.09, epic `tu3k`) — RELEASED `cd636483ba0a`**
(`Integration.writingProfile` before the switch). `POST
/content-intelligence/intake` (NDJSON): thought / link / foreign post → claims
→ ≤3 number checks by search → brief fill → per-channel draft. Doors
`GET/PUT/DELETE /integrations/:id/writing-profile`. Slop check
`text-quality/slop-check.ts`. `SOURCE_DIRECT_FETCH=true` on production.

**Earlier waves (05.09, all RELEASED):** «search into drafts» `443bd0a450c8`
(`ec48`, `provenance: SEARCH`); «owner decisions» `da34f1a9e832` (avatar learns
from edits, roles USER/EDITOR/ADMIN, word search, `tariff-levers.md`);
«cleanup» `dcb6eae72608` + `035029af3c18`; «compose window» `fc9fa77148f6`
(04.09, `fn33.28`); `d782858045fa` (04.09). Open there: `fn33.132`, `ec48.6`,
`.7`, `fn33.159`, `.138`, `.141`–`.144`, `.28.5`, `.28.18`.

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
walks `47cd8475c442` by the second live-test page** (new artifact `0d4916c9`; `fe5e030b` keeps the first walk with its answers,
23 steps: menu and usage, channel card, avatar from `result.json`, three
intakes that must always create and open a piece, questions on the piece
page, the real table, adaptation without search, the liveliness comparison
G1–G3, «Свои тексты по теме»). Every gap to Beads first, fixes as one wave.
The owner's standing word of 07.09 («даю все разрешения, не останавливайся»)
covered this release; a later release still records its own permission in the
runbook. Still his: GPG key before 16.09.2026, `or3.9`, `fn33.132`.

**Owner decisions of 07.09 (afternoon), on main as `3f713676`, not yet
released:** `m2eg.25` closed — posts go out as the channel via the bot (Bot API
up to 10.3 gives no human-identity channel posting; signatures off, neutral bot
display name; `docs/product/telegram-pipeline-mvp.md`); `fn33.159` closed —
no draft without a channel; `m2eg.26` — piece page right column shows facts
(«На что это опирается») and ungrounded, `BriefReceipt` removed; Workspace
rename dropped (display substitutes). Open for the owner: `fn33.28.4` carries
the root's proposal on where checks belong (slop auto on adaptations + one
quality line in three places, voice check as one word on FAR, delete paid
repair); `zooh` help section — text in `docs/product/help-faq.md`, mockup
before code; `or3.9` gained the paid-action catalogue in `tariff-levers.md`
(question 16). Release `3f713676` after the owner's second walk, not during.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`.
Owner questions under «Next recommended» — answer none for him. Voice epic `e3y`
is closed; do not re-open its decisions. Before any voice check run
`rebuild-voice.cjs --dry-run`: an analysis older than the ruler carries no
print and every verdict reads «сравнить не с чем» — that is not a defect.

Traps: open the dev stand at `localhost:4200`, not `127.0.0.1`. Agent
worktrees start one commit behind and without `node_modules` (`pnpm install
--frozen-lockfile --prefer-offline`, 10 s). **Never write `min-[…]`/`max-[…]`
Tailwind variants** — our `screens` has `raw` entries and Tailwind drops them
silently (guard in `design.guard`). The generated Prisma client in
`node_modules` lags the schema (`ContentPiece.kind` unknown to it) — reach new
columns through narrow local types as `piece.repository.ts` does, or
`prisma generate`. A Nest provider with a union-typed parameter needs
`@Inject(Token)` next to `@Optional()`, else it is silently `undefined`.
`orch-prompts docs-resolve` for `@orama/orama` answered `fallback-needed`
(L1 404): facts came from the installed 3.1.18 and a probe. A Nest provider
with a constructor parameter passes unit tests and stops the app
(`@Optional()`, `tests/upload-module.wiring.test.cjs`). Fakes of `Response`
need `clone()`. `/home/me/.local/bin/node` shadows nvm — prefix
`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`. `tsc --noEmit` is
separate from Jest and is **zero on all three apps — keep it so**. `pnpm test`
is three runs joined by `&&`. Never `await import('@contentfactory/…')` in
backend code. This handoff is capped at 200 lines. Beads rolls back closures
while agents run: close in one batch, then verify by name. Artifact `evidence`
entries are labels, not paths.

**A red check must actually go red, and check it yourself.** A green suite
proves the unit, never the wiring: open the page — the pieces table was green
for a week and never rendered. Deleting on the shared host, paid calls, DNS,
deploys, pushes and secrets each need fresh owner authority, recorded where
the next reader will look.
