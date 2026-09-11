# Content Factory Handoff
Current stage id: `content-factory-next-6xi0`
Last accepted stage id: `content-factory-next-xbfj`
Selected Beads goal: `content-factory-next-6xi0`
**Хвост ревью 11.09 — RELEASED `aaaf00afe664` 11.09.2026.**
Приватный исходник `e4ea8a3cf2724257dd15622593551a0eb996094d` и публичное дерево
`aaaf00afe664863244800dd2f37ee0682b2cb718` согласованы; image digest
`sha256:a90c089d6a6c01deceb292c6447d1d16a969910732fc4e7d934f857cef20b9cc`;
откат — `cc513632d93d`. На `helixa-prod` маркер совпадает, app healthy,
перезапусков 0, `/api/`, `/auth/login` и `/api/public/source` дают 200; архив
исходников совпал, SHA `a6009fbea15ba9d64d7eca63fa5848438116dda9bf0eacadb8fd2e6be409c5fb`.
Миграция Prisma пустая, схему не применяли; в отдельной базе Mastra 29 таблиц,
канонический SHA `310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7`
совпадает с предыдущим выпуском. Retention оставил новый образ и откат,
свободно 21 ГБ. Квитанция выпуска: Jest417/5392, Node125/0, Python OK.

R1–R5 выпущены в этом образе. Tavily остаётся по умолчанию, OpenRouter —
единственный резерв; Exa требует ключ владельца. Живое подключение keyless
Wikipedia/Wikidata к `WebResearchService` отложено в `content-factory-next-m0iy.8`,
долговечная квота — в `.9` под решением `or3.9`. Для отпечатка схемы в runbook
используется стабильная каноническая выборка; сырой PostgreSQL 17 `pg_dump` не
хэшируем из-за случайного `\restrict`-токена.

**Wave «третий заход 10.09» — RELEASED `cc513632d93d` 10.09.2026.**
Private source `1066e49243e6` and public `content-factory-app/main` commit
`cc513632d93df2bc946828698fa950d8e9173ef3` agree; image digest
`sha256:214b952753e13e2a0c84baeaba4ff7a687a529046241613ee4c329b0553cf26a`; rollback
`4fdac6f1435a`. Schema unchanged: diff exit 0, product Mastra 0→0, dedicated 29→29.
App healthy, marker matches, restarts 0; API/login/source 200, archive hash matches.
Retention kept the release and rollback, removed `2fe4032ea3db`, 23 GB free.
The intermediate 10.09 release record also names `4fdac6f1435a` as the saved rollback.
Root receipt: Jest417/5383, Node125/0 with 4 existing environment skips, Python46,
three tsc and build/process/brand/docs/diff passed. Evidence: `stages/content-factory-next-tu3k.15/evidence/release-2026-09-10.json`.
Связь черновика при same-channel переносе сохранена именно как перенос, согласно
закрытому `.2`; владелец 11.09 оставил перенос, вариант «копия» не выбран.
**Wave «второй заход 08.09» (`tu3k.14`, 30 tasks) — RELEASED `2fe4032ea3db` 08.09.2026.**
Private source `7b07bec6a989`, rollback `5f657ccf294e`; S1–S8 plus owner-added Channels `.26`
and calendar `.27–.30` in one release; owner approved the stand. Root acceptance: three tsc,
build, Jest 411/5270, Node 124/0 (4 env skips), Python 46; `migrate diff` 0, Mastra 0→0 and
29→29. Retention kept `2fe4032ea3db` + `5f657ccf294e`. Proof:
`stages/content-factory-next-tu3k.14/evidence/release-2026-09-08.json`; runbook release 08.09.
Implemented: navigation A and Content menu, piece page/table v2, streaming intake and voice
analysis, explicit paid checks, dedicated Channels, calendar without rail. S8: adaptation word
retention unmeasured (no eligible pairs); no synthetic result substituted. Scope:
`docs/product/second-walk-wave-2026-09-08-spec.md` and `docs/prompts/astra-*2026-09-08.md`.
**Wave «прогон 07.09» (epic `m2eg`, 25 tasks) — RELEASED `9b538b9a2e25` 07.09, audit tail
`47cd8475c442` (private `d16a4630`, rollback `9b538b9a2e25`; no schema change).** Source: the
owner's live walk of `7e2b10bf1100` (artifact `fe5e030b`, 24 notes). Seven Opus 5 streams,
no reviewer, no stand (owner: speed over checks); mockups approved before UI code. Owner
decisions 07.09: adaptation never searches the web, no citation checkboxes, no «Проверил»
gate; «С чего начать» is a menu item; the facts question reads «На что это опирается?».
Changed: piece before questions, real table (Tailwind `min-[…]` trap), channel card save,
streamed voice analysis, `PIECE_ONLY` adaptation, orama `TextSearchService`. Bounded gaps:
`related` not drawn on the piece page; index invalidation relies on the 5-minute TTL;
«⋮» 24 px in a 32 px seat. Owner: `m2eg.25` (Telegram as a person needs MTProto — not planned).
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

Next stage id: `content-factory-next-m0iy.6`. Recommended action: measure the benefit of R1–R5 before phase 2. R1–R5 are released with the wave;
R6/R7 stay deferred until benefit measurement. The next owner-facing action is the
fourth live walkthrough and a measurement of research usefulness. Tavily remains
the default provider; OpenRouter is the only reserve path. Recorded Exa responses
cover offline checks until the owner supplies an Exa key. Live keyless
Wikipedia/Wikidata wiring is tracked in `content-factory-next-m0iy.8`.
Still the owner's: GPG key before 16.09.2026, `or3.9`, `fn33.132`, channel signatures
off and a neutral bot name.

Cleanup 08.09: merged branches and worktrees removed, two unmerged August tips archived in
`.git/cleanup-2026-09-08-legacy-orchestration.bundle` with owner approval; dev stand stopped;
public clone `/home/me/code/content-factory-app` is clean at the released commit.

Released `5f657ccf294e` 07.09 evening (rollback `47cd8475c442`, epic `k879`): checks
where the text is final, quality line, `/help`; owner closed `m2eg.25`, `fn33.159`, Workspace rename.

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
