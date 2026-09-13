# Content Factory Handoff
Current stage id: `content-factory-next-75xn`
Last accepted stage id: `content-factory-next-zhv8`
Selected Beads goal: `content-factory-next-75xn`
**Эпик «Поиск» (`75xn`) — RELEASED `6fa6c34c6386` 13.09.2026.** Приватный `67914bc7`,
digest `sha256:9abae74ea9587e2a7e0c0348496cfd5b67adec35ed8f7c7cec009d0bf98364de`, откат
`17088939db40`. Владелец 13.09: обе волны вместе, боевые ключи на хост, временный
включённый предел 50 операций в месяц до `or3.9`. Ключ поиска теперь на каждый движок
(`AiProviderSetting.searchApiKeys`); правило «смена сервера стирает ключ» снято — ключ
адресуется движком и недостижим из чужой ветки, обещание сильнее прежнего. Движок
выбирается на задачу (`research` / `facts` / `discovery`, `ai.search-tasks.ts` близнецом
`ai.roles.ts`); пустая карта не маршрутизирует ничего. Задача выводится из явного
уровня — того же признака, на котором стоит квота, — кроме проверки фактов, которая
уровень тоже передаёт и называет задачу прямо. Порт получил `windowDays`: Tavily
`time_range`, Exa `startPublishedDate` плюс `category` и `userLocation`, которых он не
получал вовсе. «Откуда идеи» получила род `TOPIC`: одна проверка поиском за 30 дней,
свой выключатель `LEAD_TOPIC_CHECK_ENABLED`, остальное — код лент. Включённый режим
впервые работает: предел берётся из `AI_INCLUDED_MONTHLY_OPERATIONS`, когда строки
подписки нет (а без Stripe её нет ни у кого). Два дефекта найдены по дороге: сохранение
в `included` писало операторский движок в колонку области, и первая версия строки про
спящий ключ несла расшифрованный ключ области в included-конфигурацию (поймал
`ai-provider.usage-mode`). ОТСТУПЛЕНИЕ от плана: умолчания «ресерч → Exa» нет —
маршрут не заводится, пока человек не выберет; рекомендация живёт словами на экране.
Схема: три nullable-колонки применены точечным psql одной транзакцией по валидатору
(`--allow-table AiProviderSetting --allow-table ContentLeadSubscription`), копия
`20260913T053556Z-pre-searchkeys-product-only` (715 записей, обе таблицы на месте);
diff из нового образа после переключения пуст, Mastra 0→0 и 29→29, отпечаток
`310d75fc…acac8f7` прежний. Квитанция Jest 422/5488, Node 125/0, Python 46; хост
healthy, перезапусков 0, три двери 200, архив 7 995 395 байт `a27405a7…d43ea` совпал.
ЗА ВЛАДЕЛЬЦЕМ: `AI_INCLUDED_API_KEY` и `AI_INCLUDED_SEARCH_API_KEY_TAVILY` на хосте не
заданы — без ключа модели включённый режим по-прежнему отвечает 503; из боевой базы
ключи не доставались намеренно. Evidence:
`stages/content-factory-next-75xn/evidence/release-2026-09-13.json`.
**Волна «разбор открытого» (`zhv8`) — RELEASED `17088939db40` 11.09.2026.**
Приватный `eb5eb2fd`, публичный `17088939db4029298bf0cf05e56cdcaeb355a92f`, digest
`sha256:4f639160cf120a8c839658b67de0f6eea466f522ad271d68f2e50e9c675febef`, откат
`92f0b95dfe3f`. Закрыты `m0iy.8` и `m0iy.9`: при явном уровне ресерч после ответов
провайдера идёт в Wikipedia/Wikidata без ключа через constrained fetch (DNS на каждом
хопе, приватные адреса отсекаются, редиректы вручную), выдержка страницы через
`/api/rest_v1/page/summary/{key}` становится фактом, Wikidata — источником без факта;
лан ограничен 8 с и никогда не роняет ответ. Квота ресерча считается в Redis
(`research:quota:{org}:{level}:{YYYY-MM}`, 40 дней, INCR/DECR, при отказе Redis —
счётчик процесса с предупреждением), числа 20/10/3 прежние; клиент приходит через
токен `RESEARCH_QUOTA_STORE` из `database.module.ts` — импорт `redis.service` в файле
службы открывал сокет в каждом наборе и вешал node:test. Квитанция Jest 417/5403,
Node 125/0, Python OK; diff из образа пуст, Mastra 29→29; хост healthy, три двери 200.
Evidence: `stages/content-factory-next-zhv8/evidence/release-2026-09-11.json`.
За владельцем: `m0iy.10` замер пользы (порог входа в `.6`, до 25.09), `m0iy.11` ключ
Exa, платная проверка предела Tavily (локального ключа нет), `or3.9` тариф.
**Малая волна 11.09 (`6xi0`) — RELEASED `92f0b95dfe3f` 11.09.2026.** Приватный `3f84df3d`,
откат `aaaf00afe664`. Потолок Tavily/OpenRouter 20, Exa 100, 50 источников deep — сумма
по 25 запросам (§6); живой Tavily принимает и 50, потолок оставлен по документации, а не
как починка сбоя. Политика egress импортируется из модуля (`research-egress.cjs` в jest).
Evidence: `stages/content-factory-next-6xi0/evidence/release-2026-09-11.json`.
**Хвост ревью 11.09 — RELEASED `aaaf00afe664` 11.09.2026.** Приватный `e4ea8a3c`, откат
`cc513632d93d`; схема не менялась. Квота только при явном уровне; хэштеги/CTA из
`resolvedChannelProfile`. Отпечаток Mastra считать канонической выборкой из runbook:
сырой `pg_dump` PostgreSQL 17 несёт случайный `\restrict`-токен. Правило «смена
провайдера обнуляет ключ» отсюда отменено волной `75xn` — ключ адресуется движком.
Evidence: `stages/content-factory-next-xbfj/evidence/release-2026-09-11.json`.
**Wave «третий заход 10.09» — RELEASED `cc513632d93d` 10.09.2026.** Private source
`1066e49243e6`, rollback `4fdac6f1435a`; schema unchanged. Черновик при same-channel
переносе переносится, а не копируется — решение владельца 11.09. Evidence:
`stages/content-factory-next-tu3k.15/evidence/release-2026-09-10.json`.
**Wave «второй заход 08.09» (`tu3k.14`, 30 tasks) — RELEASED `2fe4032ea3db` 08.09.2026.**
Private source `7b07bec6a989`, rollback `5f657ccf294e`; schema unchanged, host verified.
Navigation A and the Content menu, piece page/table v2, streaming intake and voice analysis,
explicit paid checks, dedicated Channels, calendar without rail. S8: adaptation word retention
unmeasured (no eligible pairs); no synthetic result substituted. Proof:
`stages/content-factory-next-tu3k.14/evidence/release-2026-09-08.json`; scope
`docs/product/second-walk-wave-2026-09-08-spec.md`.
**Wave «прогон 07.09» (epic `m2eg`) — RELEASED `9b538b9a2e25` 07.09, audit tail
`47cd8475c442`.** From the owner's live walk of `7e2b10bf1100` (24 notes). Owner decisions
07.09: adaptation never searches the web, no citation checkboxes, no «Проверил» gate.
Changed: piece before questions, real table (Tailwind `min-[…]` trap), channel card save,
streamed voice analysis, `PIECE_ONLY` adaptation, orama `TextSearchService`. Bounded gaps:
`related` not drawn on the piece page; index invalidation relies on the 5-minute TTL.
Owner: `m2eg.25` (Telegram as a person needs MTProto — not planned).
**Small wave 07.09 (`tu3k.6`, `.10`, `.11`, `.12`) — RELEASED as `7e2b10bf1100`**
(rollback `a6be7f3fbb92`, no schema): channel badge «настроено» from
`GET /integrations/list`, adaptation `kind` picked by the person
(`ui/segmented.tsx`), «В архив», 8 container tests on adapt, `search-started`
typed, `core-write.ts` under the AI-consumer guard, list door without tokens.
**Wave «заготовка и адаптации» (06–07.09, epic `tu3k.9`) — RELEASED `a6be7f3fbb92`**
(schema `piece-adaptation-schema-apply.sql` before the switch, rollback `cd636483ba0a`).
`ContentPiece.kind='CORE'` + `brief`; `ContentDerivation.kind/title/body/mediaId`;
publication state READ from the post; core = one `draft` call from the person's words
(`pieces/core-write.ts`); the avatar-learning trap closed (`recordFromPost` compares
`ContentDerivation.body`).
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

Next stage id: `content-factory-next-m0iy.10`. Recommended action: measure the
benefit of R1–R5 (threshold for `.6` is written in `m0iy.10`); R6/R7 stay deferred. The next owner-facing action is the
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
