# Content Factory Handoff
Current stage id: `content-factory-next-97dq`
Last accepted stage id: `content-factory-next-xmfb`
Selected Beads goal: `content-factory-next-97dq`
Next stage id: `content-factory-next-97dq` fifteenth walk — page `evidence/walk-2026-09-25-fifteenth/` on `0c29cd303143`; Claude reads it on «отправил».
Recommended action: owner walks the fifteenth page https://claude.ai/code/artifact/36e748b3-be64-404e-9edb-ecb3e646b842 (release `0c29cd303143`), step A0 first returns the test group to «Бронь»; Claude reads it on «отправил». Open: 97dq.86 (P1, remember-for-channel carries autopilot), .43 p.5, .76 cards, zg8w (roles for 17 doors), tcxv (possiblyBilled needs schema).
**OWNER AUTHORITY 23.09.2026 ~19:05Z (root session, owner's own words after sending the thirteenth walk):** «Я пойду спать. К утру, пожалуйста, все сразу реализуй и задеплой.» Covers implementing 97dq.70–.75 (+ .52) and releasing them to production by the runbook with rollback to `b967a380d156`; no schema, secrets, paid smoke calls or live publishing. Spec `docs/product/thirteenth-walk-wave-2026-09-24-spec.md`.
**RELEASED 24.09.2026 (fourteenth-walk wave 97dq.78–.85 + tails .17–.20, .27, .42, .53, .54, .63–.67, .69, .77, fn33 UI/i18n, guards): `0c29cd303143`, rollback `d3854954d052`.** Private `a1d8970cb` pushed; public `0c29cd3` pushed (subject left as template placeholder by mistake, not force-pushed); digest `sha256:75ddb9eb…83b65c`; Jest 506/7307, Node 126/0, Python OK; schema and env unchanged; backup `20260924T123602Z-pre-sixteenth-wave-product-only` (704); commands `--help` 0; nginx OK; healthy, 0 restarts; four addresses 200; archive byte-equal `c18e980b…`; public CI green; disk 11G. Prod finding: test group on autopilot (97dq.86), owner reverts in walk A0. Evidence `evidence/release-2026-09-24-second.json`.
**RELEASED 24.09.2026 (thirteenth-walk wave 97dq.52, .70–.75): `d3854954d052`, rollback `b967a380d156`.** Private `d707c2da` (pushed); public `d385495` pushed; digest `sha256:ef6cbf83…ed253b48f3`; Jest 484/6925, Node 125/0, Python OK (receipt on d707c2da, first run; two earlier attempts were real failures fixed by root: locale keys `65c7c500`, handoff length `d707c2da`); no flaky reruns; schema and env unchanged; `--frozen-lockfile` build accepted `@tiptap/extension-italic` 3.20.1; backup `20260923T213336Z-pre-fifteenth-wave-product-only` (checksums OK, `pg_restore --list` 704); commands `--help` 0; nginx OK; weight 0.75 GB, 0%; healthy, 0 restarts, marker agrees; three addresses 200; logs clean after startup; archive byte-equal `2e809268…`; retention kept `d3854954d052` + `b967a380d156`, disk 11G → 7.6G after pull → 11G free. Public CI Build 35922076218 all green, Code Quality 35922076214 green. Evidence `evidence/release-2026-09-24.json`. Beads not touched by the release worker.
**RELEASED 23.09.2026 (hotfix 97dq.68, reasoning headroom): `b967a380d156`, rollback `45b798547dc8`.** Intake failed at once («Something went wrong while writing the draft»): gpt-6-luna reasoning ate the 2048 cap (prod intake/extract 2048 completion, 1937 reasoning, parse cut on length); reasoning attempts now get +8192 on the caller's cap. Private `107b364d` (pushed); public `b967a38` pushed; digest `sha256:3d142b02…ee9b2251`; Jest 477/6742, Node 125/0, Python OK (receipt on 107b364d, third run: two earlier runs had timing flakes in untouched `web.research.service` / `brand-voice.file-intake`, both pass alone); tsc backend; schema and env unchanged; backup `20260923T175959Z-pre-reasoning-headroom-product-only` (checksums OK, `pg_restore --list` 704); commands `--help` 0; nginx OK (image + container); weight 0.75 GB, 0%; healthy, 0 restarts, marker agrees; three addresses 200; fix present in running bundle; logs since switch clean; archive byte-equal `89418840…`; retention kept `b967a380d156` + `45b798547dc8`, host 11 GB free. Public CI Build run 35898155007 all green, Code Quality 35898155017 green. No AI call triggered: owner retries intake. Evidence `evidence/release-2026-09-23-fourth.json`. Beads not touched by the release worker.
**RELEASED 23.09.2026 (fourteenth wave, canvas A,A,A,A,B): `45b798547dc8`, rollback `ae55c65be5ff`.** Private `7c906a55` (pushed); public `45b7985` pushed; digest `sha256:38d9ad6b…b6f92ea`; Jest 477/6740, Node 125/0, Python OK (receipt on 7c906a55); tsc × 4; process verification OK; schema and env unchanged (SQL diff = APPLIED headers only); backup `20260923T170611Z-pre-fourteenth-wave-product-only` (checksums OK, `pg_restore --list` 704); commands `--help` 0; nginx OK (image + container); weight 0.75 GB, 0%; healthy, 0 restarts, marker agrees; three addresses 200; archive byte-equal `d46147fd…`; retention kept `45b798547dc8` + `ae55c65be5ff`, host 13 GB free. Public CI Build run 35893283082 all green, «The suite, one year on» green again (relative date shipped). Shipped 97dq.59 (calendar channel groups, placement confirmation, «Впереди N дней» via `GET /analytics/ahead`, posts list returns channel `plan`, transitions), .60–.62 (split button, emoji ceiling slider + editor picker, AI keys in pairs, hints on every parameter). Evidence `evidence/release-2026-09-23-third.json`. Beads not touched by the release worker: closing .59–.62 is root-owned. Open: .63–.67 (P2/defers), .52–.54, .42, .43, .17–.20, .27.
**RELEASED 23.09.2026 (twelfth walk read + backend wave): `ae55c65be5ff`, rollback `6928b1f20c47`.** Private `c891854d` pushed; public `ae55c65` pushed; Jest 472/6651, Node 125/0, Python OK; tsc × 4; process verification OK; SCHEMA: 13 nullable columns (`ai-text-chain-usage-schema-apply.sql` + `channel-plan-mode-schema-apply.sql`, one transaction, backup `20260923T154351Z-pre-textchain-planmode-product-only`); prod text model → `openai/gpt-6-luna` (instance row + `app.env`); healthy, 0 restarts; archive byte-equal. Public CI: required green, «one year on» red on a fixed date in `tests/channel-plan-mode.test.cjs` — fixed on the private branch after release, ships next. Spec `docs/product/twelfth-walk-wave-2026-09-23-spec.md`. Shipped 97dq.55 (Luna 6 flex→flex→standard→`z-ai/glm-5.3` chain, reasoning medium, tokens/tier/cost in `AiUsageRecord`, one log line per skipped attempt; OpenRouter flex answered 429 upstream on the stand), .56 («Решите за меня» = decision not fact, `intake-brief-fill/v10`, `core-write/v11`, UI «Решили за вас · решили мы»), .57 (per-channel plan mode, reserve default, one slot holder per piece+channel, queueGate + 10 s advisory lock, Temporal after commit, post fire guard; premortem in Beads design), .58 («Ссылки» wording, profile autosave). Evidence `evidence/release-2026-09-23-second.json`, walk read `walk-2026-09-23-twelfth/` (+`prod/`), review `correctness-review-twelfth-wave.md`, stand `live-stand-2026-09-23-thirteenth/`. Open: 97dq.59–.62 (canvas), .63–.67 (P2/defers), .52–.54, .42, .43, .17–.20, .27.
**RELEASED 23.09.2026 (eleventh walk read + twelfth wave): `6928b1f20c47`, rollback `c8e7b75c5a7a`.** Private `f78bf9aa` pushed on `wave/walk-2026-09-18`; public `6928b1f` pushed, public CI green; Jest 467/6509, Node 125/0, Python OK; tsc × 4; docker-backed CI local OK; schema unchanged; healthy, 0 restarts; archive byte-equal; host 28 GB free. Owner picked option A on canvas `01dfe256` (sources `docs/design/desert-lab/eleventh-wave/`); spec `docs/product/eleventh-walk-wave-2026-09-23-spec.md`. Shipped 97dq.44 (interview without a quota: `intake-brief-fill/v9`, `channel-question/v4`), .45 («ты/вы» removed), .46 (TipTap edit mode), .47 (per-post panel closes), .48/.49 (channel tab A: per-post options always open, full preview, bottom bar), .50 (calendar A, picker → channel tab with `?when=`, no «Чистый лист»), .51 (profile/sign-in/global A, «Знания о контенте» out of the menu). Evidence `evidence/release-2026-09-23.json`, walk read `walk-2026-09-23-eleventh/`, stand walk `stand-walk-2026-09-23-twelfth/`, live model `live-stand-2026-09-23-interview/`. Open: 97dq.52 (italic/underline/link text), .53 (core drops author's caveat), .54 (audience filled from avatar voice text), .42, .43, .17–.20, .27.
**RELEASED 22.09.2026 (tenth walk read + option A adaptation workspace): `c8e7b75c5a7a`, rollback `97923762a35e`.** Private `fcdef62d` pushed on `wave/walk-2026-09-18`; public `c8e7b75` pushed; Jest 464/6415, Node 125/0, Python OK; tsc × 4; schema unchanged; healthy, 0 restarts; archive byte-equal; host 23 GB free. Owner chose option A on canvas `c2c00ddb` (sources `docs/design/desert-lab/tenth-wave/`); spec `docs/product/tenth-walk-wave-2026-09-22-spec.md`. Shipped 97dq.31–.41: piece page = «Суть» tab + a tab per channel (hand edit PATCH, schedule/unschedule doors, «Для этого поста» overrides, the Postiz modal never opened from a piece), avatar/channel address form and channel avatar, default interview questions (channel-question/v3, intake-brief-fill/v8), own numbers kept without research, review prompt v6 (replace, not cut), citation labels stripped (data step run 1 of 1), coherence rules + `tests/design.coherence.guard.test.cjs`. Evidence `evidence/release-2026-09-22-fifth.json`, walk read `evidence/walk-2026-09-22-tenth/` (+ `coherence-audit.md`), stand `live-stand-2026-09-22/` fifth pass, `stand-walk-2026-09-22-workspace/`. Open: 97dq.42, .43, .17–.20, .27.
**RELEASED 22.09.2026 (cnt-28: named input kind, instruction keeps links, piece delete): `97923762a35e`, rollback `7bc2f3016f49`.** Private `6276ea90` (not pushed); public `9792376` pushed; Jest 457/6185, Node 125/0, Python OK; tsc × 4; schema unchanged; healthy; archive byte-equal. 97dq.28 three-way switch «Свой текст · Чужой пост · Задание» replaces the checkbox, first-person heuristic removed, number heuristic ignores links/list numerals; 97dq.29 `instruction` kind (brief `intake-brief-fill/v7`, `core-write/v10`, `instructionText`/`keepLinks`, kept-links directive in adaptation); 97dq.30 `DELETE /pieces/:id` + armed «Удалить» on page and list row; intake stream failures logged. Stand run12–run14. Evidence `evidence/release-2026-09-22-fourth.json`. Same afternoon on the owner's request: production `InstanceAiDefaults.monthlyOperations` 45 → 1 000 000 (97dq.27 open: «без предела» as a state). Owner wish recorded in 97dq.28: interview questions for own text too.
**RELEASED 22.09.2026 (cnt-24, prompt written whole): `7bc2f3016f49`, rollback `44e0873fc93e`.** Private `b19e45d9` (not pushed); public `7bc2f30` pushed; Jest 457/6181, Node 125/0, Python OK; tsc × 4; schema unchanged; healthy; archive byte-equal. 97dq.26 `core-write/v9`: the person's words are material (verbatim numbers/names/examples/expressions; spelling, dictated fillers, repeats corrected; meaning never changed), one length rule, mode paragraphs. Stand run7–run11. Evidence `evidence/release-2026-09-22-third.json`. 97dq.26 closed and read back.
**RELEASED 22.09.2026 (tenth-walk findings): `44e0873fc93e`, rollback `1b175c45e094`.** Private source `1663f855` on `wave/walk-2026-09-18` (not pushed); public `44e0873` pushed; Jest 457/6180, Node 125/0, Python OK; tsc × 4; schema unchanged; healthy, 0 restarts; archive byte-equal; host 23 GB free. 97dq.24 `core-write/v8` (pasted post = material for an own post, no review voice; v7 kept for receipts), 97dq.25 `sourceText` + the sent text above the questions while the core is empty. Live stand run3–run6 in `evidence/live-stand-2026-09-22/`. Evidence `evidence/release-2026-09-22-second.json`. 97dq.24–.25 closed and read back.
**RELEASED 22.09.2026 (fix wave): `1b175c45e094`, rollback `8cd15fe748c2`.** Private `b946357787c3` (not pushed); Jest 457/6177; evidence `evidence/release-2026-09-22.json`; 97dq.21–.23 closed.
**Ninth walk on `8cd15fe748c2` (artifact `658c88fd`, sent 22.09 08:21Z, evidence `evidence/walk-2026-09-22/`): A1/A2/B1 discrepancies, owner stopped the walk.** Causes read from production and fixed the same day (Beads `97dq.21`–`.23`, streams 60636195 / 3dac5bc1 / 8c89e221, root 71c15b31 + 15bfa9ce, all merged into `wave/walk-2026-09-18`): (1) `intake-extract/v6` — a known kind is extracted, never classified (v5 returned empty claims/structure for the owner's opinion post it called a `thought`, and the checkbox only pinned the kind); (2) `core-write/v7` — own numbers the search refuted leave «факты подтверждённые» for their own block with the source note, first core with research gets rules 12–15, and a named rule tells the model what the pasted-post blocks are for (without it the model still wrote one sentence on the live stand); (3) the «согласен частично…» stance opens a field (`ownOption` marker from the backend), service chips on their own quiet row, «Реши всё сама» → «Решите всё за меня». Live-model proof `evidence/live-stand-2026-09-22/` (foreign core 581 chars, Iceland first core 848 chars without «25 тысяч»/«40%»). Lesson: the 18.09 stand evidence had `claims: []` and a one-sentence core and was read as a pass — judge a core by its material, not its first words.
**RELEASED 18.09.2026 (second release of the wave): `8cd15fe748c2`, rollback `2542f433e993`.** Private source `fc10583d961e` on `wave/walk-2026-09-18`; Jest 455/6159, Node 125/0, Python OK; tsc × 4 (commands included); schema unchanged, Mastra 29→29, five addresses 200, source archive byte-equal, host 13 GB free. Owner's word 18.09 evening (spec §7): canvas approved, exact numbers from sources pass the vague-quantity rule, take everything left open, release. Shipped: 97dq.8 state cells (28×28 icon+tone, legend, chip filters, no row status pill), .10 grounded numbers (`text-quality/numbers.ts`, `passWhenGrounded`), .11 escaped bodies stay escaped for markup receivers + previews escape + nbsp, .12 `links-skipped` event and one quiet line, .13 impostor vote 243→4 ms, .14 review tails (`core-write/v6`, `reviewAdaptation` deleted), .15 commands app boots (`getTemporalCommandModule`), .16 chip «Решите за меня». Data step `adaptations:rerender-bold` RUN from the new image: 1 of 1. Evidence `stages/content-factory-next-97dq/evidence/release-2026-09-18-second.json`, review `evidence/correctness-review-second-release.md` (no P0, 2 P1 fixed).
First release of the wave: `2542f433e993` (rollback `3504f07a8f25`, evidence `release-2026-09-18.json`). Traps of the second: debt moved from `.tsx` into a `.ts` helper vanishes from the design ledgers (guards read only tsx/jsx) and the stale ledger fails the receipt; commands `--help` needs a reachable DATABASE_URL (P1012 otherwise); take a production snapshot and the write in separate commands; `nvm use` in a tool command still loses to `~/.local/bin` (see the PATH prefix below).
Owner walk on `3504f07a8f25` (artifact `1f06838e`, sent 18.09 11:16Z): C1/C2 foreign post still a thought (real model says `thought`; tests mocked it), G2 search keys shown on system mode + uppercase hint; owner marked B1 ok but production data showed «25 тысяч»/«40%» surviving research; asks: the word «модель», loader after «Продолжить с правками», research findings reaching adaptations, fact check by claims instead of first 5000 chars, bold markup, honest name for «Убрать штампы», status-icon cells with a filter, «Новая заготовка» from a piece, taller intake field.
Owner decisions 18.09: checkbox «Это чужой текст» (model may only upgrade to foreign); «Убрать следы ИИ»; on «Ключи системы» own search keys are hidden AND dormant (replaces xmfb.8), cross with a hint returns a field to the system key; no wishes field at first adaptation; «модель» → «мы»/«ИИ» outside provider settings; Claude orchestrates, Opus 5 workers; paid stand calls, private push and release authorized.
Spec `docs/product/eighth-walk-wave-2026-09-18-spec.md`; stage `stages/content-factory-next-97dq/` (summary, evidence `walk-2026-09-18/`, `live-stand-2026-09-18/`, premortem, `evidence/correctness-review.md`). Design canvas for 97dq.8 approved by the owner 18.09: artifact `4f1c7a0b`, sources `docs/design/desert-lab/ninth-wave/`.
Streams S1–S8 integrated with follow-ups S1b S1c S2b S3b S4b S8b and second-release streams T2 T3 T4. Live-model stand found three defects recorded tests could not (pre-filled foreign stance, brief fill returning 0–3 own facts for one sentence, owner note welded into CTA); correctness review: no P0, 5 P1 fixed.
Release data step after switch: `adaptations:rerender-bold` (dry-run default) re-renders DRAFT posts whose body carries `**` — `apps/commands` is compiled in place inside the container. Release note: a self-hosted instance with no `AI_INCLUDED_SEARCH_API_KEY_*` loses search for workspaces on system keys; this production has both keys.
Open after the wave (Beads, created at closeout): markdown receivers keep unescaping (per-provider decision), `acceptAdaptationReview` unreachable, review P2-3..5 (core-write/v6 filters do not tile the space, `statementMatchKey` collapse when a correction equals its original, `createEntityDecoder` group indexing), channel name in the cell hint (needs `bestCell` to carry it).
Stand traps 18.09: start `cf-dev-temporal-postgresql cf-dev-temporal-elasticsearch cf-dev-temporal` by name or the backend hangs on 7234; the stand's stored generation key no longer decrypts (`bad decrypt`), live runs used `included` mode + `AI_PROVIDER/AI_TEXT_MODEL` env; `pkill -f` on the backend pattern kills the calling shell — kill by pid.
**RELEASED 16.09.2026: `3504f07a8f25`, rollback `93aa33b85a79`; xmfb.1–.10 and .12 closed/read back.** xmfb.11 done 18.09 (eighth walk read into 97dq); xmfb.13 folded into 97dq.6.
Owner walk on `93aa33b85a79` (artifact `5ebd9e76`, sent 12:23Z): A1/A3/B1/F1/F3 ok; B2 «Берём» 404 (factKey sent as statement), E1 review 502 REVIEW_INVALID (per-change validation), C1 foreign post taken as thought (no position question), language: Iceland one query (classifier local), plus sorting, Dialog confirm, research direction/depth, per-engine search keys.
Spec `docs/product/seventh-walk-wave-2026-09-16-spec.md`; order `docs/prompts/astra-seventh-walk-wave-2026-09-16.md`; evidence `stages/content-factory-next-xmfb/evidence/walk-2026-09-16/`. Branch the wave from `wave/walk-2026-09-14` (not merged to main). Owner decisions 16.09: Codex executes; search keys per engine (own overrides system, own key spends no quota). `xmfb.11` (eighth walk page, with core/adaptation quality) is Claude's. 4zul closed.
Local passwordless helper: `/home/me/.local/bin/cf-dev-login`, outside product. Local AI stand still needs schema/key setup; no live local AI proof claimed.
**Поправка по первому шагу шестого захода (`75xn.36`–`.38`) — RELEASED `447e360f7007` 14.09.2026** (два образа `cde11f97e77f` → `447e360f7007`; откат `65bcb0dd6829`). Evidence: `evidence/release-2026-09-14-intake-hint.json`. Ловушка публичного коммита: пустая строка между `Source-Commit` и `Co-Authored-By` ломает блок трейлеров; force-push в публичный запрещён, лечится пустым коммитом.
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
**Оценка качества с сервера + второй проход владельца — 13.09.2026** (код не менялся): девять
сценариев intake, оба режима review, сорок поводов — `evidence/quality-2026-09-13/FINDINGS.md` (F1–F14);
породила задачи `75xn.18`–`.28`, все закрыты волной качества выше. Служебные области удалены.
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

Next stage id: tenth walk, artifact `3fd99e8b` (see the top of this file)
Walkthrough criteria: `docs/product/seventh-walk-wave-2026-09-16-spec.md` §6; the owner reviews release 3504f07a8f25.
Still open: `m0iy.10` benefit measurement (by 25.09), `75xn.9/.33/.34`.
Still the owner's: GPG key before 16.09.2026, `or3.9`, `fn33.132`, channel signatures off, neutral bot name.

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
