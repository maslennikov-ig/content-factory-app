# Content Factory Handoff
Current stage id: `content-factory-next-75xn`
Last accepted stage id: `content-factory-next-zhv8`
Selected Beads goal: `content-factory-next-75xn`
**Поправка по первому шагу шестого захода (`75xn.36`–`.37`) — RELEASED `cde11f97e77f` 14.09.2026.**
Приватный `188fb071`, откат `65bcb0dd6829`, схема не менялась. Сайт по вставленной ссылке ответил 4xx,
экран прятал объяснение сервера за «Ответ пришёл неполным» — теперь общая фраза только для потока без
объяснения; «Нужен ресерч» объясняет себя `Hint`, подпись снята. ЛОВУШКА: пустая строка между
`Source-Commit` и `Co-Authored-By` ломает блок трейлеров — ворота квитанции не видят коммит; force-push
в публичный запрещён, лечится пустым коммитом с верным блоком. Открыто `75xn.38` (ссылка не отдана —
идти по словам человека, решение владельца). Evidence: `evidence/release-2026-09-14-intake-hint.json`.
**Волна качества (`75xn.17`–`.32`) — RELEASED `65bcb0dd6829` 13.09.2026 вечером.**
Три образа за вечер: `691eda1318c8` (волна, приватный `6bc680c9`), `11a3a80caee8`
(поправка: ключи в ответе модели, тело страницы; `d6b1a3f8`), `65bcb0dd6829` («supplied»
в review v2, дата со страницы, карточки реестров; `a1c7f5dc`); откат `cd0c137d0b1c`, схема
не менялась, копия `20260913T170247Z-pre-quality-wave-product-only`. Решения владельца:
движки те же; вердикт ставит код по дословной цитате; поправки применяются за человека
(макет «Опоры после ресерча», вариант 1); страницы читаются бесплатно из ответа движка; TTL
кэша 30 мин; откат по сбою не на OpenRouter; **правило продукта «решаем за человека»** в
`PRODUCT.md`. Ядро: `intake/research-digest.ts` (сжатие, `settleResearchDigest`, `factKey`),
снимок первого прохода в Redis (`INTAKE_SNAPSHOT_STORE`, час), `ResearchOutcome` на входе,
`WorkingLine` и рисованный `CheckboxField` со стражами, discovery через `news` + судья внутри
операции, `lead-page-date.ts`. Проверка с сервера после волны:
`evidence/quality-2026-09-13-after/FINDINGS.md` (78/78 найденных строк с цитатой, i9: 3/3
ложных числа с поправкой, выбор 100 %, уровни 8/20/50, поводы 16/16 с датой, мусора 0,
свежая область проверяет тему с первого раза). ЛОВУШКИ: модель пишет ключи как `[E:…]`,
адресом или текстом — узнавать все; дата движка со штампом `T17:00:00Z` врёт на дни, дата со
страницы точна; тело ответа, выброшенное до чтения, роняло воркер (`RequestAbortedError`);
квота deep-ресерча 3/мес списывается и за `REVIEW_INVALID`. Открыто: `75xn.33` (дубли
сюжета), `.34` (перепечатки-агрегаторы), `.35` (повтор при `REVIEW_INVALID`), `.9`. Страница
шестого захода: `evidence/walk-2026-09-13-evening/` (артефакт `606a3374…`). Evidence:
`evidence/release-2026-09-13-quality-wave.json`.
**Оценка качества с сервера + второй проход владельца — 13.09.2026, код не менялся.**
Владелец попросил судить качество ресерча и поводов самому, до его стадии C. Служебные
области на бою (режим «Ключи системы»), девять сценариев intake, оба режима review, пять
тем / сорок поводов с независимой датировкой: `evidence/quality-2026-09-13/FINDINGS.md`
(F1–F14, вердикт). Движки не проблема; проблема — обработка выдачи: опоры = обрезки шапок
страниц, всё `unverified`, ложные числа проходят в суть, выбор теряется на «Продолжить»,
уровни неотличимы (`CONTENT_CONTEXT_MAX_EVIDENCE_V1 = 8`), Википедия не доходит никогда
(`budget_accepted_sources`); поводы — 30/40 без даты, 12/40 мусор, две шаблонные фразы.
Сильная часть — «Усилить ресерчем» и проверка фактов. Задачи `75xn.18`–`.24`. Второй
проход владельца по странице (R1–S3): `75xn.25`–`.28` (суперадмин: OpenAI вместо
openrouter в форме, ключ генерации не в том блоке, число операций не показано,
автосохранение; область в режиме системных ключей: лишние «Убрать ключ», пропавшие
тематика/глубина; чекбокс «Нужен ресерч» и лоадер не унифицированы). Служебные области и
аккаунты удалены. Промпт для следующей сессии:
`evidence/quality-2026-09-13/NEXT-SESSION-PROMPT.md`. Владелец: стадии C и E проходить
после волны исправлений.
**Ключи по умолчанию у суперадмина (`75xn.16`) — RELEASED `cd0c137d0b1c` 13.09.2026.**
Приватный `7faeaedf`, откат `616fe17a2380`. Уточнение владельца: настройку самих ключей по
умолчанию открывает только `isSuperAdmin`, область выбирает лишь между ними и своим ключом.
Таблица `InstanceAiDefaults` — одна строка, единственность от константного ключа (приём
`TelegramUpdateConsumerLease`); переменные окружения стали полом и читаются ПОЛЕ ЗА ПОЛЕМ,
иначе правка одной модели на экране стёрла бы нетронутый ключ; нечитаемая строка оставляет
инстанс на переменных. Четыре двери на `/admin`, ключ наружу не отдаётся никогда, экран
различает три состояния поля («задан здесь», «задан на сервере», «не задан») — без второго
суперадмин вставил бы второй ключ на работающем инстансе. ЗАВЁДЕН СТРАЖ, которого не было:
у `/admin` нет политики CASL, раздел держится вызовом `assertSuperAdmin` в каждом хендлере;
страж сразу нашёл `POST /admin/telegram/connect` без проверки источника (`75xn.17`). Схема:
`CREATE TABLE InstanceAiDefaults` точечным psql, копия
`20260913T081144Z-pre-instance-ai-defaults-product-only`; строку на бою не заводили — ключи
остаются в переменных и показаны как «заданы на сервере». Квитанция Jest 426/5548. Evidence:
`stages/content-factory-next-75xn/evidence/release-2026-09-13-superadmin.json`.
**Поправка по прогону (`75xn.10`–`.15`) — RELEASED `616fe17a2380` 13.09.2026.** Приватный
`cd9623f0`, откат `6fa6c34c6386`, схема не менялась. P1, найденный записью владельца:
запасной ход читал старую колонку `searchApiKey` как ключ движка из ИЗМЕНЯЕМОГО
`searchProvider` — ключ Tavily мог уехать на `api.exa.ai`; колонка не читается, данные
перенесены. Владелец отменил отступление первой волны: движок под задачу выбирается сам,
селекторы убраны; откат — любой движок с поисковым ключом, но НЕ OpenRouter (тратит ключ
генерации). Экран: карточка как у соседей, поля ключей только в режиме «Свой ключ»,
автосохранение всего кроме ключа, объяснения в `Hint`, шеврон и крестик на одном отступе.
Ключи владельца перенесены в системные по его прямому разрешению. Evidence:
`stages/content-factory-next-75xn/evidence/release-2026-09-13-correction.json`.
**Эпик «Поиск» (`75xn`) — RELEASED `6fa6c34c6386` 13.09.2026.** Приватный `67914bc7`,
откат `17088939db40`. Ключ поиска на каждый движок (`AiProviderSetting.searchApiKeys`);
правило «смена сервера стирает ключ» снято. Движок выбирается на задачу
(`ai.search-tasks.ts` близнецом `ai.roles.ts`), задача выводится из явного уровня — того
же признака, на котором стоит квота, — кроме проверки фактов, которая называет её прямо.
Порт получил `windowDays`: Tavily `time_range`, Exa `startPublishedDate` плюс `category` и
`userLocation`. «Откуда идеи» получила род `TOPIC`: проверка поиском за 30 дней, свой
выключатель `LEAD_TOPIC_CHECK_ENABLED`. Схема: три nullable-колонки точечным psql, копия
`20260913T053556Z-pre-searchkeys-product-only`. Evidence:
`stages/content-factory-next-75xn/evidence/release-2026-09-13.json`.
**Волна «разбор открытого» (`zhv8`) — RELEASED `17088939db40` 11.09.2026.** Приватный
`eb5eb2fd`, откат `92f0b95dfe3f`, схема не менялась. Закрыты `m0iy.8` (лан Wikipedia/Wikidata
без ключа при явном уровне, 8 с, никогда не роняет ответ) и `m0iy.9` (квота в Redis
`research:quota:{org}:{level}:{YYYY-MM}`, 40 дней, при отказе Redis — счётчик процесса).
ЛОВУШКА: импорт `redis.service` на уровне модуля библиотечной службы открывает сокет при
загрузке и держит процесс node:test живым; клиент отдавать через токен `RESEARCH_QUOTA_STORE`.
Evidence: `stages/content-factory-next-zhv8/evidence/release-2026-09-11.json`.
За владельцем: `m0iy.10` замер пользы (до 25.09), `or3.9` тариф.
**11.09: `6xi0` RELEASED `92f0b95dfe3f`** (потолки Tavily/OpenRouter 20, Exa 100, deep 50 по
25 запросам); **хвост ревью RELEASED `aaaf00afe664`** (квота только при явном уровне;
отпечаток Mastra брать канонической выборкой из runbook — сырой `pg_dump` 17 несёт случайный
`\restrict`-токен). Evidence в `stages/content-factory-next-{6xi0,xbfj}/evidence/`.
**Earlier waves, all RELEASED (details in each stage's `evidence/release-*.json`):**
«третий заход 10.09» `cc513632d93d` (source `1066e49243e6`, rollback `4fdac6f1435a`;
same-channel draft moves, not copies — owner 11.09); «второй заход 08.09» (`tu3k.14`,
30 tasks) `2fe4032ea3db` (nav A, piece page/table v2, streaming intake, dedicated
Channels; spec `docs/product/second-walk-wave-2026-09-08-spec.md`); «прогон 07.09»
(`m2eg`) `9b538b9a2e25` + audit tail `47cd8475c442` (adaptation never searches the
web, no citation checkboxes, piece before questions, Tailwind `min-[…]` trap, orama
`TextSearchService`; owner: `m2eg.25` MTProto not planned); small wave 07.09
`7e2b10bf1100`; «заготовка и адаптации» (`tu3k.9`) `a6be7f3fbb92` (schema
`piece-adaptation-schema-apply.sql`); «вход одной мыслью» (`tu3k`) `cd636483ba0a`
(`Integration.writingProfile`, `POST /content-intelligence/intake` NDJSON,
`SOURCE_DIRECT_FETCH=true`); 05.09: `443bd0a450c8` (`ec48`, `provenance: SEARCH`),
`da34f1a9e832` (roles USER/EDITOR/ADMIN, avatar learns from edits, `tariff-levers.md`),
`dcb6eae72608` + `035029af3c18` (cleanup), `fc9fa77148f6` (compose window, `fn33.28`),
`d782858045fa` (04.09). Open there: `fn33.132`, `ec48.6`, `.7`, `fn33.159`, `.138`,
`.141`–`.144`, `.28.5`, `.28.18`.

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

Next stage id: `content-factory-next-m0iy.10`. Recommended action: measure the benefit of R1–R5
(threshold in `m0iy.10`; R6/R7 deferred; `m0iy.8` keyless Wikipedia done 11.09).
Still the owner's: GPG key before 16.09.2026, `or3.9`, `fn33.132`, channel signatures off, neutral bot name.
Cleanup 08.09: branches/worktrees removed, two August tips in `.git/cleanup-2026-09-08-legacy-orchestration.bundle`.
Released `5f657ccf294e` 07.09 evening (rollback `47cd8475c442`, epic `k879`): checks where the text is final,
quality line, `/help`; owner closed `m2eg.25`, `fn33.159`, Workspace rename.

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
