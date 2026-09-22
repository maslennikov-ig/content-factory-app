# Tenth wave: tenth-walk findings and the adaptation workspace (22.09.2026)

Epic `content-factory-next-97dq`, Beads `97dq.32`–`.41` (plus `.31`). Branch `wave/walk-2026-09-18`. Production at
the time of the walk: `97923762a35e`. Executed by the Claude orchestrator; streams run in their own worktrees.
Owner quotes and interface strings stay in Russian.

Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-22-tenth/` — `sent/steps/*.json` and
`sent/notes/general.json` (owner notes as sent), `sent/E3.jpg`, `prod/pieces-2026-09-22.json` and
`prod/derivations-2026-09-22.json` (production reads), `coherence-audit.md` (97dq.39). Design canvas
`https://claude.ai/code/artifact/c2c00ddb-b415-4c83-9748-71b87d31a2ba`, sources `docs/design/desert-lab/tenth-wave/`.

## 1. Owner's words (actionable part)

- **A3** — «трёх вариантов достаточно?… выбор… как язык текста в раскрывающемся списке… нужны подсказки… полностью
  убрать режим вручную»; «не хватает возможности выбора аватара, под которым мы адаптируем заготовку».
- **C2** — «под адаптацией идёт сначала заготовка, а потом только адаптация… разрыв»; «когда будет много адаптаций…
  жёсткая каша»; «настройки канала — одно, настройки адаптации — другое… иногда пост побольше, иногда поменьше»;
  «ни одного вопроса модель не задала… интервью — важная часть адаптации»; «после «Опубликовать» показывается
  старый редактор… выписывается из общей стратегии… ручное редактирование поста — классная штука, оно точно должно
  быть… всё это должно быть на экране адаптации».
- **C3** — «для этого поста… не на ты, а на вы… всё через скрытые настройки канала»; «что является настройками
  канала, а что настройками аватара… я могу для каналов разных аватаров подключать»; «не перегружено и универсально».
- **D1** (issue) — «предложила убрать слово «эффективнее»… ценность строки потерялась… стоило не убрать, а заменить».
- **D2** (issue) — «cnt-29… молча убрал все цифры. Хотя я даже не нажимал «Проверить факты»».
- **E1** — «нужно написать, что нужно нажать крестик». **E3** — «выровнять… все колонки поверху».
- **General** — «проверь весь pipeline… согласованный, целостный… доработать правила, пользуясь /design».
- **After the canvas** — «мне однозначно нравится вариант А»; «имеет смысл сохранять ещё изначально введённый текст…
  до всех правок».

## 2. Release 1 of the wave (fixes, merged)

`97dq.32` own numbers kept without research (`searchRuledOn` from row traces), `97dq.33` review prompt v6 — replace a
trace, never cut a carrying word; wording from selected findings is not a trace; no double spaces, `97dq.34` cross
hint, `97dq.35` table top-aligned, `97dq.36` manual brief removed + «?» per input kind, `97dq.40` citation labels
never reach text (+ data command `adaptations:strip-citation-labels`).

## 3. Option A — the adaptation workspace (97dq.37, .38, .41, .31)

The piece page becomes one workspace with tabs: **«Суть»** first, then **one tab per channel** (the state cell of the
«Заготовки» table is the tab's icon: pencil draft, clock queued, check published, dashed plus not yet). The URL keeps
the tab (`/content/pieces/[id]?tab=core|<integrationId>`). Everything a person needs to take an adaptation to
publication lives in its channel tab; **the Postiz «Создать пост» modal is never opened from a piece** (it stays for
blank calendar posts).

### 3.1 «Суть» tab
«Что вы прислали» (collapsed `Disclosure`, the input verbatim — 97dq.41) → questions («Уточнение») while open → core
with its action row («Дополнить ресерчем», «Проверить факты», «Переписать…») and quality line → **«Куда дальше»**
(one row per connected channel: state cell, name, state word, «Открыть» or primary «Адаптировать») → «Что мы
поняли» and «Опоры текста» in the right column at `lg`, below on narrow screens. The old «Куда адаптировать» table,
the separate «Адаптации» list and «Посмотреть» scrolling are removed.

### 3.2 Channel tab (adaptation exists)
- Header row: label «Текст для <Площадка>», segmented «Вариант 1 · Вариант 2 …» (versions of this channel, newest
  selected), quiet autosave line.
- Editor: the adaptation body is editable by hand (plain text with `**bold**`; toolbar Ж / link / image; counter
  «N из <provider max> знаков»); saves debounce into the adaptation AND its DRAFT post. Rendered bold by default,
  «Показать разметку» as today.
- Quality line under the editor (existing `QualityLine`).
- Action row, visible buttons (no «Ещё ▾»): «Убрать следы ИИ», «Проверить факты» (web; one name everywhere),
  «Переписать…» (instruction). Review results render inline under the row (existing review UI).
- Right column «Для этого поста» (one-off, nothing saved to channel/avatar): «Кто говорит» (avatar select — hidden when
  the workspace has one avatar), «Длина» (Короче · Как в канале · Длиннее), «Обращение» (Как в аватаре · на «ты» · на
  «вы»), «Пожелание» (one line) → «Переписать с этим» (a new variant) and a quiet «Запомнить для канала» (writes
  length/address/avatar into the channel profile). Collapsed to one summary line until changed.
- «Как увидят в <Площадка>» preview (existing preview component where one exists; plain rendered text otherwise).
- Link «Как пишем в «<канал>»» → the channel profile dialog (one name for that object everywhere).
- Footer: «Когда» date-time (default: next free slot as the calendar picks it today), «Удалить адаптацию» (armed
  two-press button, the `PieceDeleteButton` pattern), split primary «Запланировать ▾» with «Опубликовать сейчас».
  Published/queued adaptations show state and «Открыть в календаре» instead; editing a queued post goes back to draft
  only through an explicit «Снять с расписания».
- Image: «картинка» toolbar button opens the existing media library and attaches one image to the post.

### 3.3 Channel tab (no adaptation yet)
One question card before the first text on this channel («Что читатели «<канал>» должны унести из этого поста?»,
2–3 options from the core + «Свой ответ», «Решите за меня» on a quiet row), the «Для этого поста» summary, primary
«Адаптировать для <Площадка>». The answer goes into the adaptation prompt as the takeaway. Skipping is one click.
Intake questions for own text and task (97dq.31): one default question when the brief has no gaps, same card.

### 3.4 Settings layers (97dq.38)
- **Avatar** (who speaks): new optional `voice.addressForm: 'ty' | 'vy'` in `BrandProfileContentV1` (JSON, no schema
  change), edited in the avatar passport.
- **Channel** (where): `ChannelWritingProfile` gains `brandProfileId?: string | null` (the channel's avatar) and
  `addressForm?: 'avatar' | 'ty' | 'vy'` (JSON column, no schema change).
- **This post**: adapt request `overrides?: { length?: 'shorter'|'channel'|'longer'; addressForm?: 'avatar'|'ty'|'vy';
  brandProfileId?: string; wish?: string; takeaway?: string }` — not persisted beyond the generated variant.
- Resolution: post override → channel → avatar → today's behaviour. Avatar selection feeds `brandProfileSelection`
  (`{mode:'id', …}` or whatever the agent graph already supports) instead of always `active`. Length `shorter`/
  `longer` scale the channel range (×0.6 / ×1.5, capped by the provider maximum).
- Address form becomes an explicit prompt directive («Обращайся к читателю на «вы»»), phrased once in the channel
  directives builder.

### 3.5 Doors (backend)
- `PATCH /content-intelligence/pieces/:id/adaptations/:adaptationId` `{ body?, image? }` — manual edit; only while the
  post is DRAFT; updates `ContentDerivation.body` and the DRAFT post HTML (`editorHtml`) in one transaction; recomputes
  adaptation checks; strips citation labels; org-scoped.
- `POST /content-intelligence/pieces/:id/adaptations/:adaptationId/schedule` `{ date?: ISO; now?: boolean }` — runs
  the provider validation the modal ran (`/posts/valid` logic), then `PostsService.changeDate(…,'schedule')` or the
  existing post-now path. Returns the new state; errors in words.
- `POST /:id/adapt` accepts `overrides` (3.4).
- `GET /:id` returns `sentText` (97dq.41): stored `inputText` (new, verbatim input of every kind, written at intake)
  falling back to `sourceText` → `instructionText` → `personText` for old pieces.

### 3.6 Calendar and lists
Opening a post that came from a piece (calendar card, pieces list cell) navigates to the piece's channel tab instead
of the modal. The stale-page defect (audit C2) disappears with the modal on this path.

## 4. Coherence rules (97dq.39)

Add to `docs/design/component-authoring-rules.md` the nine rules of `coherence-audit.md` §D, with guards in the
existing ledger style (grandfather what exists, fail only what is new): one disclosure primitive, section label
component, copy only in copy files + dead-key check, one state vocabulary, overlays through `Popover`, armed confirm
for deletes, touch target owned by the button, loading keeps width, one entity one name. Fix on the path now: one name
for the channel profile («Как пишем в «X»»), «Проверить факты» everywhere, «Решите всё за меня» for adaptation
questions, «Отменить»/«Попробовать снова» everywhere, English tooltips of the editor toolbar translated.

## 5. Non-goals of this wave
Threads/comments with delay, repeat, tags, editorial stage and customer are not brought into the workspace. The
modal keeps working for blank posts from the calendar.
