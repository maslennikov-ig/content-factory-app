# Content Factory Handoff
Current stage id: `content-factory-next-tu3k.15`
Last accepted stage id: `content-factory-next-tu3k.14`
Selected Beads goal: `content-factory-next-tu3k.15`
**Wave «третий заход 10.09» is in progress on `wave/walk-2026-09-10`.**
Owner authorized the wave and research `.2`–`.5` through release, with the stand
shown first and no repeated approval request. Schema unchanged; rollback
`2fe4032ea3db`. S4/S6/S1/S2/generator/S5/S3 integrated in manifest order. S3 follow-up stores
review answers in existing brief answer flow; S5 legacy activation fixed. Stand opened
in Windows at localhost4200; owner inspection is not claimed. No release or Beads closure yet.
One full root acceptance follows integration; child checks are focused only.

**Wave «второй заход 08.09» (`tu3k.14`, 30 tasks) — RELEASED `2fe4032ea3db` 08.09.2026.**
Private verified source `7b07bec6a989` and release records are integrated into `main` and `origin/main`;
public `content-factory-app/main` and running image agree. Rollback `5f657ccf294e`.
All S1–S8 integrated in the required order; Channels `.26` and calendar `.27–.30`
added by the owner and completed in the same release. All worker worktrees cleaned.
Owner inspected the local stand and explicitly approved the final Channels/calendar.
Root acceptance: three tsc, build, Jest411/5270, Node124 pass/0 fail/4 existing
 environment skips, Python46, brand/docs/process/diff passed. Receipt remains bound
 to `7b07bec6a989`; the later documentation commit is a release record.
`migrate diff` from the new image returned0; no schema apply. Mastra product0→0,
 dedicated29→29 and schema fingerprint unchanged. App healthy, restarts0,
 release marker matches, startup errors0; API/login/source200, archive hash matches.
Retention script kept `2fe4032ea3db` + `5f657ccf294e`; 23GB free on host.
All30 children closed in one batch and reread;30 GitHub sync triggers queued.
Proof: `stages/content-factory-next-tu3k.14/evidence/release-2026-09-08.json`;
runbook: `docs/operations/production-deploy.md`, release08.09.
Implemented: navigation A and Content menu; piece page/table v2; streaming intake
 and voice analysis; explicit optional paid checks; dedicated Channels; calendar
 without rail, draft-adaptation picker and source-piece links. No automatic intake
 claim checks; enrichment remains; explicit paid search review requires acceptance.
Scope: `docs/product/second-walk-wave-2026-09-08-spec.md` and three `docs/prompts/astra-*2026-09-08.md` orders.
S8 data limit: two thoughts measured; no eligible adaptation pairs in copied data,
 so adaptation word retention remains unmeasured. No synthetic result substituted.
Third live walkthrough is prepared by Claude after the release report.

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
What changed: piece written before questions, questions on the piece page, real table (Tailwind `min-[…]` trap), channel card save, streamed voice analysis, `PIECE_ONLY` adaptation, `TextSearchService` (orama), «С чего начать» in the sidebar, one channel-rail geometry. Bounded gaps: the `related` event is not drawn on the piece page (only in the
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

Next stage id: `content-factory-next-tu3k.15`. Recommended action: **Astra runs wave
«третий заход 10.09»** (29 tasks, `.24`/`.25` closed as merged) by
`docs/prompts/astra-third-walk-wave-2026-09-10.md`; spec
`docs/product/third-walk-wave-2026-09-10-spec.md`; research epic `m0iy` phase .2–.5 after the wave. Current owner instruction 10.09 authorizes autonomous execution and both releases; show stand before each release, do not ask for another yes. Owner walked
production `2fe4032ea3db` on 10.09 (artifact 1e543e55, 21 notes, 3 shots): «Уже гораздо
лучше». Evidence `.codex/stages/content-factory-next-tu3k.15/evidence/walk-2026-09-10/`
(notes, shots, production log/db facts, three code-cause reports). Confirmed working:
avatar analysis to the end, no 409 gate, three review calls, «ещё нет» chip free.
Broken: picker → post window dark screen (100 %), zero emoji at level «few», title
«:null», unreadable search review, review menu without `flex`, six progress widgets.
Owner decisions: auto-accept avatar fields; «выбирает модель» everywhere in the channel
card; publish as the accent action after adaptation; one `Progress`; component reuse.
Decided 10.09: `.23` model questions by the material before the core (one round);
review as three baskets with hover explanations (`.10`), findings → prompt (`.11`),
«Переписать ▾» by parts (`.27`). Research is one entity, epic `m0iy`; decisions in `m0iy.1` are accepted: one organization-configured provider, Exa adapter with Tavily retained, no SearXNG, standard default, organization quotas 20/10/3. Only Exa key is external; use recorded Exa responses and live Tavily until then. Phase .6/.7 waits for benefit measurement. Rollback stays `2fe4032ea3db`. Still the owner's: GPG key before
16.09.2026, `or3.9`, `fn33.132`, channel signatures off and a neutral bot name.

Cleanup08.09: one worktree on main;31 merged local and13 remote branches removed.
The two unmerged August orchestration tips were archived, then removed with the
owner's explicit approval; they were not merged into the current harness.
Archive: `.git/cleanup-2026-09-08-legacy-orchestration.bundle` (verified).
Dev process group8410 and6 cf-dev containers removed; data volumes preserved.
The dev stand is stopped. Canonical public clone `/home/me/code/content-factory-app`
is clean at the released commit; its source archive and suite receipt are retained.
Temporary release/design worktrees and the temporary public clone are removed.

Released `5f657ccf294e` 07.09 evening (rollback `47cd8475c442`, epic `k879`):
checks where the text is final, one quality line, forbidden phrases in the
prompt, `/help` (11 questions). Owner decisions 07.09 (`3f713676`): `m2eg.25`
closed (posts go out as the channel), `fn33.159` closed (no draft without a
channel), Workspace rename dropped.

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
