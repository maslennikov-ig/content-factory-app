# Ninth wave execution (eighth-walk findings, 18.09.2026)

Specification: docs/product/eighth-walk-wave-2026-09-18-spec.md. Beads 97dq owns status; this file records
execution and acceptance evidence. Orchestrator: Claude Fable 5.1 root; streams run on Opus 5.

## Ownership and integration

- S1 / agent/97dq-s1: .1; complex-worker (Opus 5, high); intake truth: explicit foreign kind, no downgrade,
  kind in the research snapshot, atomic claims, honest corrections.
- S2 / agent/97dq-s2: .2; complex-worker (high); facts into adaptation, no invention, bold markup, checks on read,
  core-write v5.
- S5 / agent/97dq-s5: .5; worker (medium); intake screens: checkbox, composer textarea, working line, top buttons.
- S3 / agent/97dq-s3: .3; complex-worker (high); fact check by claims, review mode instructions. After S2.
- S4 / agent/97dq-s4: .4; frontend-specialist; piece page. After S2 (reads `adaptation.checks`).
- S6 / agent/97dq-s6: .6; complex-worker (high) with technical-premortem; search keys by usage mode.
- S7: .7; mechanical-worker (low); the word «модель»; after S4–S6 are integrated.
- S8: .8; frontend-specialist; state cells; only after the owner approves the design canvas.

Benefit: parallel latency and write isolation. `max_parallel_write_streams = 3`, so two batches:
S1 + S2 + S5, then S3 + S4 + S6. Shared seam `piece.service.ts`: S2 owns adapt/adaptationOf/hintsOf, S3 owns
reviewV2 — integrate S2 before S3 starts. Root owns spec, integration, stand proof, acceptance, release, walk page.

## Acceptance and authority

Owner, 18.09.2026 (AskUserQuestion answers): paid model/search calls on the local stand, push to the private
origin, production release after green acceptance. Rollback 3504f07a8f25. No schema changes. Host < 6 GB free
blocks the pull. Beads closed in one batch after all workers stop, then read back by name.

## Evidence

evidence/walk-2026-09-18/: notes.txt, pieces/*.json, app-log.txt, usage.txt, vosmoi-zakhod-sent.html.

## Stream acceptance

(appended per stream: commit → integrated commit → focused test counts)

S5 delivered 131ba224, integrated as 5bf83da2. Worker proof: 12 suites / 157 tests (intake, adaptation-review screen, piece) and 10 guard suites / 135 tests; frontend tsc clean. `ResearchOutcome` gained optional `continueAbove`, `working`, `workingLabel`; `pieces/adaptation-review.tsx` untouched. Accepted for integration; root final acceptance remains.

S1 delivered 5818f1b5, integrated as 17fd4276. Worker proof: 13 suites / 205 tests; backend tsc clean. Explicit kind also skips the paid classification call. Decision inside the stream: for a foreign post any claimed position origin (including `person`) becomes `model` when the person gave no answer. Number check applies to corrected twins only, not to plain `confirmed` verdicts. Handed to S3: classifier wording — `subjectLanguage` is the language the subject is written in; the discussed country never changes it (production logged `is` for a Russian Iceland subject and returned Icelandic sources).

S2 delivered da505bc2, integrated as 6387cebb. Worker proof: 8 focused suites / 254 tests, wider pass 39 suites / 594 tests, node:test consumer-backend 12/0; backend tsc clean. Hints carry `material: [{statement, sourceUrl?}]` (≤12 items / ≤2000 chars); `adaptations[i].checks` is recomputed on detail read; `markdown` editors keep `**`, `html` gets `<strong>`, `normal`/`none` strip. Handed to S3: review and regeneration read the post through `htmlToPlainText` and lose bold.

S6 delivered 8d9abfc8, integrated as b65067f2. Worker proof: 19 suites / 428 tests; backend and frontend tsc clean. Premortem: evidence/premortem-search-keys-by-mode.md. Out-of-zone edits accepted by root: `docs/product/help-faq.md` (forced by the help copy guard) and the PRODUCT.md paragraph that stated the replaced xmfb.8 rule. Production check by root (names only, read-only): AI_INCLUDED_SEARCH_API_KEY_TAVILY and _EXA are both set on the host, so a workspace on system keys keeps both engines after release; the owner's workspace will start spending included quota on search.

S4 delivered 54cc4d50, integrated without conflicts. Worker proof: 15 suites / 319 tests, 8 guard suites / 101 tests; frontend tsc clean; no allowlist touched. New `pieces/adaptation-markup.tsx` (pure formatter) and `pieces/adaptation-body.tsx`. Judgement call kept by root: the markup toggle appears only when the text contains `**…**`. Out-of-zone edit accepted: one mirrored sentence in `docs/product/help-faq.md`. Open seam: S3's removed/remaining catalog findings are not yet shown by the screen — root follow-up after S3.

S3 delivered 913587e5, integrated as the merge after S4. Worker proof: 20 suites / 453 tests, node:test 43/0, three tsc clean. Fact check: 1 extract call + ≤6 searches + 1 review call on up to 20 000 chars (was 1 classify + 1–2 searches on 5 000). `factCheck` and `catalog` added to the review response. Classifier prompt pinned as `research-classify/v2`.

S7 delivered 550bf163: ~75 strings to «мы»/«ИИ», PRODUCT.md rule, guard `tests/copy.no-model-word.test.cjs`; root finished the six strings in S3's files (689ddfcf). S4b delivered 2ff131a5 (catalog delta lists, quiet fact-check note).

Root integration proof before the live stand: three-app tsc clean, full Jest 447 suites / 5892 tests.

Live-model stand (evidence/live-stand-2026-09-18/README.md) found three defects no recorded test could see: (1) foreign-post position options were the model's rewordings of the source author's view with one pre-filled → root fix 9ca48b42; (2) brief fill returns 3, 1 or 0 own facts for the same sentence → S1b 23a8c809 (deterministic own rows, digest without claims asks for no verdicts), re-proven live twice; (3) the channel owner's note welded into the CTA → root fix 2deb9437. Stand prerequisites the repo does not provide: `cf-dev-temporal*` containers must be started by name; the stand's stored generation key no longer decrypts, so the stand ran in `included` mode with operator keys from a mode-600 scratch file (owner authorization 18.09).

Correctness review (evidence/correctness-review.md): no P0, 5 P1, 22 P2. All P1 and the in-zone P2 fixed by the same workers: S1c f8e50f8a (decimal comma, number tokens, twin honesty by number plus mark, old snapshots, capped links), S3b 2ebfd7e9 (no wasted restatement, lenient claims, honest quiet result, catalog by platform, rendered-post guard, no control bytes + guard), S2b 2ffd32eb (material budget, one voice measurement per page and newest 20 only, markdown strays, one bold grammar in `libraries/helpers/src/utils/bold-markers.ts`, backfill command `adaptations:rerender-bold`). Root type fix 0006528e. Left as Beads: 97dq.10 (vague-quantity on exact numbers, owner decision), 97dq.11 (publish-time unescape in the shared helper, pre-existing), and the follow-ups created at closeout.

Release data step: `adaptations:rerender-bold` is dry-run by default; run dry first, `--apply` only after reading the counts. `apps/commands` is not built into the image, so it is compiled in place inside the container.

S3c delivered 4941012d, integrated as 02271651: the fact-check tests were calling the real Wikipedia/Wikidata lane (timeouts under the full run); tests made hermetic, and caller-supplied claim queries no longer open the encyclopedic lane in product code (up to 18 serial requests and 8 s per fact check for sentence-shaped lookups). Root rewrote two S3b tests that S2b's single bold grammar invalidated (dd230a31) — green apart, red together.

## Release

Released 18.09.2026 as `2542f433e993` (public) from source `0227165137708f0b2fc466d968f2c11c29173aa9`; rollback `3504f07a8f25`. Receipt: Jest 450 suites / 5994 tests, node:test 125/0, Python OK; process verification OK; three-app tsc clean. Image 0.75 GB (0% growth), digest sha256:015085f2…f3e7 matches on host; healthy, 0 restarts; schema unchanged; Mastra 29→29; `/`, `/api/`, `/auth/login`, `/api/public/source`, archive 200 and byte-equal; host 13 GB free after prescribed retention. Private branch pushed. Evidence: evidence/release-2026-09-18.json.

Not done: the data step `adaptations:rerender-bold` — `apps/commands` does not boot in the image (pre-existing DI defect, Beads 97dq.15). One production row was in scope (the owner's test adaptation of the eighth walk). Open: 97dq.8 (state cells, awaits the owner's word on the canvas), 97dq.9 (ninth walk page), 97dq.10–.15.

## Second release of the wave (owner's word 18.09.2026 evening, spec §7)

Owner approved the state-cells canvas, asked to take everything left open, and granted the production release.

- S8 delivered 97d4a190 + follow-up a36d95f3 (`97dq.8`): 28×28 cell (one constant `CELL_BOX`), icon plus tone, hint in `title`/`aria-label`, corner digit, legend, «Площадка»/«Состояние» chip filters on the shared `RadioGroup` inside `FiltersRow`. Root's stand check (evidence/state-cells-2026-09-18/) sent back: filter set = canvas set + «в архиве», one scrolling line per filter on a phone, human platform names through the existing dictionaries, the row status pill removed as a duplicate of the cells. Not supported by data: the channel name in the hint (`bestCell` carries `integrationId` only) — the clause is dropped, backend untouched. «ВКонтакте» kept over the canvas's «VK» (the section's existing dictionary).
- T2 delivered 0db0e353 (`97dq.15`) and a4f9161b (`97dq.11`). Commands: no Temporal module in the graph; `getTemporalModule(false)` would hang (nestjs-temporal-core opens a native connection nobody closes) → `getTemporalCommandModule()` with `TEMPORAL_CONNECTION: null`, `closeIoRedis()`, log level raised after boot; `--help` 2 s, exit 0 with Temporal stopped; regression `tests/commands-app.wiring.test.cjs`; runbook gained the image check. Escaping: markup receivers keep entities escaped, text receivers decode in one pass (`html-entities.ts`), `html-text.ts` shares it. Open by decision: markdown receivers (Medium/dev.to/Hashnode vs Discord/Lemmy) need a per-provider answer.
- T4 delivered 449bbe27, f751c1a6, 8cc1ae6a, f5d04806 (`97dq.14`) and 6634a8db (`97dq.12`): one `statementMatchKey` on both sides of the research-pick fallback; unverified twin leaves the confirmed block → successor prompt `core-write/v6` (v5 untouched); dead `reviewAdaptation` deleted, live behaviour re-pointed to `reviewV2` tests; the two claim extractors stay two (reason at the top of `review-claims.ts`); additive stream event `links-skipped` and one quiet line on the intake screen. Left: `acceptAdaptationReview` is also unreachable.
- T3 delivered eb024e02 (`97dq.10`) and 54cb47b2 (`97dq.13`): `text-quality/numbers.ts`, rule property `passWhenGrounded`, `SlopCheckOptions.grounded`; passed by piece detail/persist, core write, review v2/v3 before and after on one set; the post-window door has no material and passes none. Root closed the intake port gap (42c78d49, test red without it). Impostor vote: 243 ms → 4 ms on 8000 chars, byte-identical on 19 captured cases.
- Root: `97dq.16` chip «Решите за меня» (525e3261).

Root integration proof: tsc clean × 4 apps (commands included); full Jest 454 suites / 6068 tests green under Node 22.23.2. Trap repeated: `nvm use` inside a tool command does not win over `~/.local/bin` — the first full run silently used Node 24 and failed exactly the two Node-sensitive suites; export `PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH` instead.

Correctness review of the second release (evidence/correctness-review-second-release.md): no P0. P1-1 regression — parse5 turns every U+00A0 into `&nbsp;`, and the new html branch no longer decoded it, so Telegram would have shown six characters; P1-2 pre-existing — seven post previews fed decoded text into `dangerouslySetInnerHTML`. Both fixed by T2 (584c660b, 0d9a063e; old-vs-new corpus pins the seven intended differences), P2-2 e018d3ac, P2-1 by T3 (d43e7690: dates, clock times, list markers, glued names and URLs do not ground a quantity). Root: the preview helper is named `.tsx` so the typography, hint and palette ledgers keep seeing its debt (fc10583d; 726 → 713, 33 → 27) — the first receipt attempt failed exactly on those stale ledgers.

## Second release

Released 18.09.2026 as `8cd15fe748c2` (public `8cd15fe`) from `fc10583d961e`; rollback `2542f433e993`. Receipt Jest 455 / 6159, node:test 125/0, Python OK; tsc × 4; process verification OK; schema unchanged; image 0.75 GB, digest sha256:6eb2c23f…f946 matches on host; healthy, 0 restarts; Mastra 29→29; five addresses 200, source archive byte-equal (8358820 bytes); host 13 GB free. Data step `adaptations:rerender-bold` run from the new image: 1 of 1 draft re-rendered, second dry run 0. Defects of the rollout, both recorded in the runbook: `--help` of the commands app needs a reachable database (bare run fails P1012); the before-snapshot of the re-rendered post was not taken. Evidence: evidence/release-2026-09-18-second.json.

## Ninth walk and the fix wave (22.09.2026)

The owner walked the ninth page (artifact `658c88fd`, sent 08:21Z, evidence/walk-2026-09-22/) and stopped after B1: A1/A2/B1 all discrepancies — «текст не сгенерировался, только то, что я выбрал в ответах», «25 тысяч по-прежнему есть». Read from production: cnt-20/21 (foreign post WITH the checkbox) had `borrowed.claims = []`, `structure = []` — `intake-extract/v5` asks the model to classify first and returns empty lists for what it calls a `thought`, and the checkbox only pins the kind; cnt-22 carried 16 selected findings into the core prompt (reconstructed with the shipped code, evidence/walk-2026-09-22/cnt-22-core-prompt.txt) yet «25 тысяч»/«40%» printed as «факты подтверждённые» (`isOwnOrConfirmed` trusts `origin=input` while the receipt lists them in `ungrounded`) and rule 4 kept the first core to two sentences — the same as B1 on 18.09, so not a regression of `8cd15fe748c2`. The 18.09 stand evidence had recorded `claims: []` and a one-sentence core (`c1-checked.ndjson`, `c2-answer.json`) and the reviewer read «opens with the person's words» as a pass. Beads 97dq.21 (P1), .22 (P1), .23 (P2). Owner 22.09: paid stand calls and the release authorized; the walk page is reset (a new artifact).

- S1 delivered 60636195 (`97dq.21`): `intake.prompts.v6.ts` — a known kind (checkbox, `link`, and the heuristic `foreign_post` seam where `settleKind` never reads the model's vote) is extracted, never classified; `extract()` takes `{ knownKind }`; one warn line when a known foreign post still yields no claims and no structure (`tests/content-intake.extract-v6.test.cjs`).
- S2 delivered 3dac5bc1 (`97dq.22`): `core-write/v7` — own rows the search refuted (`status` set by research and not `confirmed`) print once under «не подтвердилось поиском» with the source note and a named rule «как факт не пишется; бери исправленное значение из подтверждённого или опусти число»; first core with research gets rules 12–15 (rule 4 off); a thought without research keeps the v6 text word for word. §9.5 of the section map annotated.
- S3 delivered 8c89e221 (`97dq.23`): `PieceOpenQuestionV1.ownOption` names the stance that needs the person's words; the card opens the field on that option (placeholder in `pieces.copy.ts`), the submit never sends the label, `fieldAnswers` discards an answer equal to it; options and service actions are two rows (`data-piece-answer-options` / `data-piece-service-actions`), the service chips quieter on the same `chipBase` geometry (`tests/content-pieces.clarify-stance.test.cjs`, 7 tests).
- Root on the live stand (evidence/live-stand-2026-09-22/): with S1 alone the core prompt carried 5 claims + 4 structure steps and the model still wrote one sentence — no rule said what the pasted-post blocks are for → 71c15b31 (named rule in v7: stance first, then the matter in dispute retold; rule 14 folds repeated supports). After it: foreign core 581 chars in two paragraphs; Iceland first core 848 chars, no «25 тысяч»/«40%»/«десять лет», corrected values used, no repeats. Screenshot of the clarify block confirmed S3 and exposed «Реши всё сама» → 15bfa9ce.

Proof: focused sets green; full Jest 457 suites / 6176 tests under Node 22.23.2 (before the two root commits; the receipt below re-runs everything); tsc clean backend + frontend.

## Tenth walk: two findings and the second fix wave of the day (22.09.2026)

The owner opened the tenth page (`3fd99e8b`), did A1 and stopped, reporting in chat instead of pressing Send: (1) on the clarify step the text they sent is not on the screen — «мне задают вопросы по тексту, который я отправил, а его перед глазами нет»; (2) cnt-23 read as a review of the pasted post («Чужой пост связывает… автор поста пишет… он предлагает») — «мы должны создавать то же самое, как когда мы пишем свой пост, просто берём чужой пост и из него делаем свой». Read from production (evidence/walk-2026-09-22/pieces/cnt-23.json): the v7 rule `CORE_WRITE_FOREIGN_V7` asked for exactly that retelling, and the block title «что чужой пост утверждает» was echoed in the text; while questions are open `finish()` writes `text: ''`, `personText` is empty for a foreign post and the pasted text was never stored. Beads 97dq.24 (P1), .25 (P1).

- Root, `core-write/v8` (`97dq.24`): the foreign rule replaced — the pasted post is material for an own post; claims are the state of affairs, stated plainly and used next to the thought they explain; no reference to a post or its author; numbers only after a confirmed line; block titles renamed to «исходный материал». v7 module untouched. Three live runs with the owner's real cnt-23 stance (run3–run5): the review voice was gone from the first run; the second wording brought the material in but as a reference paragraph splitting the person's words («usually before the position» fought base rule 5); the shipped wording weaves the situation into the opening — 921 chars, three paragraphs, an own post.
- Root, sent text (`97dq.25`): `ZagotovkaCoreV1.sourceText` (pasted post or link message verbatim, never sent to the core prompt) stored by `finish()`, carried through `answer`/enrich/`coreOf`; the frontend reader picks up `personText`/`sourceText`; the piece page shows the text while `core.text` is empty. First shot put it under the questions card at y=1048 (below the fold with two questions) → moved above the card (run6/s2-page.png, y=530 vs questions y=712).

Proof: receipt Jest 457/6180, Node 125/0, Python OK for `1663f855`; tsc × 4; process verification OK; schema unchanged. Released `44e0873fc93e` (rollback `1b175c45e094`), evidence/release-2026-09-22-second.json. Walk page `3fd99e8b` republished with A1 rewritten for the new behaviour.

## cnt-24 and `core-write/v9` written whole (22.09.2026, third release of the day)

The owner asked to check cnt-24 before going on: «мне кажется, он прям дословно взял мою правку… там прям мои орфографические ошибки сохранились». Confirmed from production (evidence/walk-2026-09-22/pieces/cnt-24.json): structure right (own post, no review voice), but the second paragraph was the dictated stance nearly verbatim. Cause: rule 1 «характерные фразы переноси дословно» + rule 5 + block title «(дословно)». The owner then asked for the prompt to be thought through as a whole («будь аккуратен в промте… сделать его просто правильным… поищи образцы»). Beads 97dq.26.

- Root: `core-write/v9` written whole rather than stacked — «из чего писать» (blocks with trust; person’s words: carried / corrected / unchanged, one before→after example), «как писать» (7 rules, one length rule), four mode paragraphs. Web patterns checked (STT cleanup prompts, do/don’t voice lists, may/must-preserve structure) and matched. Stand run7–run11: first wording edited the voice but dropped the source material; default flipped to «every claim enters unless it repeats or works against the claim»; a closing-repeat ban added to rule 5; shipped run10 966 chars, an own post with the situation first and «удобная лазейка» kept; Iceland unchanged in substance.

Proof: receipt Jest 457/6181, Node 125/0, Python OK for `b19e45d9`; tsc × 4; process verification OK; schema unchanged. Released `7bc2f3016f49` (rollback `44e0873fc93e`), evidence/release-2026-09-22-third.json. Walk page `3fd99e8b` v3: A2 checks the edited voice.
