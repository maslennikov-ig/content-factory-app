# Ninth wave: eighth-walk findings (18.09.2026)

Epic `content-factory-next-97dq`. Branch `wave/walk-2026-09-18` (from `wave/walk-2026-09-16`). Production at the
time of the walk: `3504f07a8f25`. Database schema does not change in this wave. Executed by the Claude
orchestrator; streams run on Opus 5 in their own worktrees. Owner quotes and interface strings stay in Russian.

Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-18/` — `notes.txt` (owner notes as
sent), `pieces/*.json` (five pieces of the walk with briefs and adaptations), `app-log.txt`, `usage.txt`,
`vosmoi-zakhod-sent.html`.

## 1. Owner's words (verbatim, abridged to the actionable part)

- **A1** ok — «мы иногда используем слово «модель», мне кажется, многие люди не знают… что мы поняли… Подумай,
  как это назвать, чтобы было понятно для простого пользователя».
- **B1** ok — «После нажатия «Продолжить с правками» все как будто немножко подвисло… Нужен ли какой-то лоудер…
  кнопка находится в самом низу. Может быть, её имеет смысл продублировать и сверху».
- **B2** ok — «на что-то это влияет? Напиши мне в чат…» (answered in chat; the hint copy must tell the truth).
- **C1/C2** discrepancy — «cnt-19… блока уточнения нету».
- **D1** ok — «Довольно много всего нашло, но пост как будто не сильно увеличился… заготовка должна
  подготавливать всё полезное, что может быть для адаптации».
- **E1** ok — «это сообщение можно убрать в знак вопросика… почему только первые 5000 знаков… мы должны выбирать
  суть, которую нужно проверить».
- **F1** ok — «в адаптации есть звёздочки… Markdown-разметка не срабатывает. Я бы сделал вид по умолчанию с
  рабочей разметкой, но как опцию — посмотреть чистый текст»; «Убрать штампы… должно называться по-другому…
  убирает историю, когда текст написан AI»; «Лучше сам проставляй оценки».
- **F3** ok — «Я не уверен, что модель убрала именно штампы, которые были».
- **G1** ok — «небольшие квадратные клетки… значки… цветами и значками легко отличалось… при наведении описание…
  возможность фильтрации».
- **G2** discrepancy — «зачем подсказка вся заглавными буквами?… если выбраны ключи системы, зачем ключ Tavily
  и Exa… всё это нужно прятать… нажимаешь крестик — сбрасываешь свой ключ, появляется снова ключ системы».
- **Overall** — «на созданной заготовке… кнопку «Новая заготовка»»; «увеличить высоту поля, когда я создаю
  новую заготовку».

## 2. Production facts (read-only, 18.09)

1. cnt-19 `760615d5`: `brief.inputKind = "thought"`, `origins.position = "input"`, `questions.items = []`. Two
   `intake/extract` calls ran (both classification seams), the real model answered `thought`. Every xmfb.3 test
   mocks `materialKind: 'foreign_post'`. The pasted text carries no marker of foreign authorship.
2. B1 `8cc5a492`: core and thesis still state «25 тысяч» and «на 40%». Extract produced ONE claim with three
   numbers; the digest returned one correction («длился десять лет» → «одно из испытаний проходило в 2014–2019
   годах»); the corrected twin is `status: confirmed, verified: true` although its own `note` says the source
   «не подтверждает охват 25 тысяч человек или рост производительности на 40%»; `ungrounded: []`.
3. cnt-19 enrichment: 13 found rows `selected: true`, 6 reached the core (1025 chars). The F2 adaptation used 2
   and invented a six-item checklist and «три решения». The F1 adaptation (`9edfc1bd`) invented «Для
   предпринимателя здесь есть практический вопрос…», «Я бы начал с трёх проверок…» and carries
   `**Я пока не занимаю определённую сторону**`.
4. Log: `Web research classification:` lines are present and right (Iceland `scope=global queries=2`, WB/Ozon
   `scope=local`); `subjectLanguage=is` for the Russian Iceland subject is wrong (should be `ru`). Search ran as
   `workspace_key` (own keys, no quota). No failed review happened, so «сбой квоту не списывает» stays unobserved.

## 3. Decisions = tasks

Owner decisions of 18.09 are final; do not re-ask.

### 3.1. Intake truth (`97dq.1`, P1) — backend, `content-intelligence/intake/**`

- The form may send `inputKind: 'foreign_post'` (checkbox, 3.5). `intake.service.ts:373`
  `knownKind(body?.inputKind)` already accepts it; an explicit kind is never overridden by the model.
- Without the checkbox the model may only UPGRADE `thought → foreign_post` (seams at `intake.service.ts:500-518`
  and `:541-553`); a heuristic or explicit `foreign_post` is never downgraded.
- The research second pass (`run()` snapshot branch, `:487-497`) recomputes kind with `detectInputKind`; carry
  `inputKind` in the snapshot state (`stateOf`, `:437-462`) and restore it.
- For `foreign_post`, a `position` whose claimed origin is anything but `person` becomes `model`
  (`:1219-1229` coerces only `input` today), so the position question cannot be suppressed by `avatar`/`memory`.
- Extract prompt successor `intake-extract/v5` (new module next to `intake.prompts.v4.ts`; v4 stays): one number
  per claim; a sentence with three numbers yields three claims. Classifier: a Russian subject about a foreign
  country has `subjectLanguage = ru` (fix lives in `web.research.service.ts` classify prompt — coordinate with
  3.3, which owns that file; hand the wording over in your report instead of editing it).
- `research-digest.ts` / `researchRows` / `applySelections`: a correction confirms only its own span. Numbers of
  the same author statement that the source did not confirm stay `unverified` and stay in `ungrounded`; the
  corrected twin is not `verified: true` as a whole unless every number in it is confirmed.
- Tests: recorded-response tests for each rule, plus the walk texts from `pieces/*.json` as fixtures.

### 3.2. Adaptation quality (`97dq.2`, P1) — `pieces/core-write*`, `piece.service.ts` (adapt path), `agent/**`, `brief/editor-html.ts`

- `hintsOf` (`piece.service.ts:1953-1988`): pass the statements of `selectedFactsBrief(brief).facts` with source
  URL as verified material. `briefBlock()` (`agent.graph.service.ts:305-347`) renders them under a heading that
  says: use what serves the thesis; never add a fact, number, advice, list or example that is neither in the
  core nor in this material; the author's position is stated, not extended with new opinions.
- Bold: canonical stored form is `**…**`. `EDITOR_LINE` (`channel-directives.ts:143-153`) names the syntax:
  «bold is written as `**text**`, at most two short spans». `editorHtml(text, 'html')`
  (`brief/editor-html.ts`) converts `**…**` to `<strong>` after escaping; for `normal` editors markers are
  removed (`libraries/helpers/src/utils/remove.markdown.ts`). Telegram then receives `<b>` through the existing
  provider path — do not touch `telegram.provider.ts`. Unbalanced or multi-line `**` stays literal-free: strip it.
- `adaptationOf` (`piece.service.ts:1764-1793`) returns `checks` recomputed deterministically from the stored
  body (slop/anti-copy/voice are model-free), so the quality line survives reload and review acceptance.
- Core write successor `core-write-prompt.v5.ts`: on enrichment (`existingCore` present) rule 4 «суть короткая»
  does not apply; every selected support that serves the thesis gets its own sentence; nothing is invented.
- Tests: hints carry statements; editor-html conversion table; `adaptationOf` returns checks; v5 prompt text.

### 3.3. Fact check by claims, honest review modes (`97dq.3`, P2) — `pieces/review*.ts`, `adaptation-web-review.ts`, `piece.service.ts` (`reviewV2` only), `openai/web.research.service.ts`

- `reviewV2(mode:'web')` (`piece.service.ts:1400-1417`): extract checkable claims first (reuse the dead contract
  `extractionSchema.claims[].searchQuery`, `intake.prompts.ts:77-95`; callable seam `intake.service.ts:874-895`
  `extract()` — call it, do not edit intake files), then one query per claim within
  `RESEARCH_LEVEL_PRESETS[level].maxSearchQueries`. `WebResearchOptions` accepts caller-supplied queries
  (`web.research.service.ts:1400-1411`). No claims → a quiet «проверять нечего» result, not an error.
- One named constant replaces the three independent `5000`s (`piece.service.ts:1409`,
  `adaptation-web-review.ts:19`, `web.research.service.ts:477`).
- Review prompt successor (`adaptation-review-prompt/v5`, `review.v3.ts` stays importable): `slop`, `facts` and
  `both` get different instructions. `slop` = remove traces of machine writing (`REVIEW_SEMANTIC_V4` plus catalog
  findings) and must address every catalog finding; `facts` = compare with the core only, no style edits.
  The result lists which catalog findings were removed (`slopBefore/slopAfter` already exist, `:304-305`).
- Apply the classifier wording from 3.1 (`subjectLanguage` for a Russian subject is `ru`).
- A failed review must not spend included quota — keep the xmfb.2 behaviour covered by a test.

### 3.4. Piece page (`97dq.4`, P2) — `apps/frontend/src/components/content-intelligence/pieces/**`, `shared/quality-line.tsx`

- Adaptation body (`piece.screen.tsx:990-1000`): formatted view by default (`**…**` → bold, paragraphs kept)
  with a quiet toggle «Показать разметку» / «Скрыть разметку». No new dependency: a tiny pure formatter in the
  pieces folder, output through React nodes, not `dangerouslySetInnerHTML`.
- Menu «Ещё ▾» (`adaptation-review.tsx:494-551`): «Убрать штампы» → **«Убрать следы ИИ»**, description «Найдём
  обороты, по которым текст читается как написанный ИИ, и предложим правки. Штампы уберём заодно». Move every
  inline `ru ? … : …` of `adaptation-review.tsx` into `pieces.copy.ts` (ru + en).
- «Проверить факты»: no confirmation dialog (`:659-690`); the button starts the check; the spend sentence moves
  into a `Hint` next to the button, without «первые 5000 знаков» (3.3 removes that behaviour). The request still
  sends `confirmWebSpend: true`.
- Quality line: shown from `adaptation.checks` after reload; after an accepted review the line says
  «Штампов по каталогу: было N → стало M» until the next reload.
- Action cluster (`piece.screen.tsx:490-511`): third link-button «Новая заготовка» → `NEW_PIECE_PATH`
  (`pieces.adapter.ts:120`), same anchor pattern as «Все заготовки».
- «Опоры текста» hint (`piece.screen.tsx:1162-1170`): «Отмеченные строки идут в адаптации и в следующую
  переписку сути. Уже написанный текст галочка не меняет.»
- `piece.screen.tsx:538` `cf-label-sm uppercase` outside a marker frame breaks
  `component-authoring-rules.md:64` — leave unless you touch that line.

### 3.5. Intake screens (`97dq.5`, P2) — `components/content-intelligence/intake/**`, `react-shared-libraries/src/form/textarea.tsx`

- `CheckboxField` «Это чужой текст» next to «Нужен ресерч», hint «Поставьте, если вставили чужой пост или
  статью: спросим вашу позицию и не выдадим чужое мнение за ваше». Checked → `inputKind: 'foreign_post'`
  in `intake.adapter.ts:644-663,716`; unchecked → unchanged behaviour (`undefined`).
- Field «О чём будем писать» (`intake.screen.tsx:223-244`): add a size variant to the shared `Textarea`
  primitive (`textarea.tsx:68`, e.g. `layout="composer"` → min-height 200px, measure capped ~`80ch`); no
  per-file pixel number. Off-rhythm geometry is guarded by `tests/design-geometry-allowlist.json`.
- After «Продолжить с правками» (`intake.research.tsx:438-452`, `intake.container.tsx:177-186,363-374`): the
  button row is replaced in place by `WorkingLine` with the step word; the row is also mounted above the
  findings (one component, two mounts). Update `tests/content-intake.research-outcome.test.cjs:143`.

### 3.6. Search keys by mode (`97dq.6`, P2) — `openai/ai.provider.*`, `openai/ai.search-tasks.ts`, `components/settings/ai-provider.*`

Owner, 18.09: «если выбрана глобальная настройка, что ключи системы, то зачем это все показывать… всё это нужно
прятать»; on the cross: «должно быть пояснение при наведении на крестик… для обычного пользователя не должно
быть возможности работать без ключа». This **replaces** the xmfb.8 rule.

- Run `technical-premortem` first and append to
  `.codex/stages/content-factory-next-xmfb/evidence/premortem-search-keys.md` (copy into this stage's evidence).
- `resolvedSearch()` (`ai.provider.config.ts:157-196`): `included` → system keys only, own search keys dormant
  (kept in the row, never decrypted into the config); `workspace_key` → own key over system key per engine.
  `keySource`, quota reservation (`web.research.service.ts:1227-1252`) and `usageMode` follow. Never route a
  key to another engine (see memory «search key mutable anchor»).
- Screen (`ai-provider.component.tsx:1143-1205`): the whole «Веб-исследование» key block and the «Сейчас поиск
  идёт так» line render only when `ownKeys`. The reset control is a cross with a `Hint`: «Нажмёте — поле
  вернётся на ключ системы. Поиск без ключа не остаётся». Captions «Свой ключ» / «На ключе системы» stay.
- `BlockHeading` (`:401-404`): move `Hint` out of the uppercase `<h5>` so the bubble is not uppercased.
- Rewrite `tests/ai-provider.usage-mode.test.cjs`, `tests/ai.search-routing.guard.test.cjs`,
  `tests/ai-search-tasks.test.cjs`, `tests/ai.search.config.test.cjs` to the new rule.

### 3.7. The word «модель» (`97dq.7`, P3) — second queue

«мы» where the product speaks («Что мы поняли», «выберем сами», «Мы спросили по вашему тексту»); «ИИ» where the
actor must be named («ИИ вернул неполную проверку. Текст не изменён.»); «модель» only in
`settings/ai-provider*` and `admin-ai-defaults*`. Rule goes into `PRODUCT.md`. Guard test: a user-facing Russian
string with «модел» outside those files fails; existing leftovers go into an allowlist that may only shrink.

### 3.8. State cells in «Заготовки» (`97dq.8`, P3) — after the owner approves the design canvas

Icon + colour + `Hint` per cell on `Status`/`STATUS_TONES` (`ui/surface.tsx`), filter by platform and state on
`ui/filters-row.tsx`; data already arrives (`material-presentation.ts` `bestCell`), backend untouched.

## 4. Claude's quality grades (owner asked Claude to grade)

- F1 (`9edfc1bd`): meaning 3, position 4, voice 3, form 4, hook 3, stamps 3 — invents advice, smooths the
  owner's spoken phrasing, mirrored «Первая — … Вторая — …».
- F2 (cnt-19): meaning 3, position 1 (stands on the foreign author's position), voice 3, form 3, hook 4,
  stamps 4 — invented checklist; strongest researched numbers absent.
- A2 core: 5/5/5/4/4.

## 5. Boundaries

No schema change; never `prisma db push`. Prompts and contracts are versioned by successor modules, never
edited in place where a guard pins the version. `cf` tokens and the ten type classes only; read
`docs/design/component-authoring-rules.md` before any component. Node `22.23.2`, pnpm `10.6.1`. No deploy,
push or paid call from a stream — those belong to the root. Not taken: mixed key mode (empty generation key =
system), Telegram playbook prose, extra post shapes.

## 6. Acceptance

On the stand with the real model (root): the WB/Ozon post with the checkbox asks for the position and without it
is never downgraded; Iceland with research leaves no «25 тысяч» as confirmed and `ungrounded` is not empty;
enrichment + adaptation puts researched numbers into the post and invents no advice; `**` is bold on screen and
`<b>` in the post body; fact check of a long text searches by claims; «Убрать следы ИИ» keeps the before/after
count after F5; with «Ключи системы» the key block is hidden and search spends included quota.
Locally: `tsc --noEmit` × 3 apps, three halves of `pnpm test` under Node 22, design guards,
`scripts/orchestration/run_process_verification.sh`, empty `prisma migrate diff`, `mastra_*` 29→29 at release.
