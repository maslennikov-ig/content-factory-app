# Thirteenth walk wave — 2026-09-24

Source: owner walk of artifact `31064602` (releases `45b798547dc8` + hotfix `b967a380d156`),
sent 2026-09-23 19:02Z. Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-23-thirteenth/`
(`sent.html`, `notes.md`, `shots/B3_1.jpg`, `shots/F2_1.jpg`).

Passed: A1 (hotfix proven: intake completion 2416 tokens on flex, no length failure), B2, B4, C1,
C4, D1–D3, E1–E3, F1. Discrepancies: B1, B3, C3, F2. C2 not checked (one channel only).
The owner went to sleep and asked to implement and deploy everything by morning: there is no
canvas round, so the design decisions below are root decisions inside `DESIGN.md`, recorded
here for the owner to overturn on the next walk.

Production facts (SELECT only, 2026-09-23 ~20:00Z): exactly one `Integration`
(«Тестовая группа Content Factory», telegram), so the doubled chip in the picker is a
frontend defect, not data.

Hard boundaries for every stream: no Prisma schema change (store new per-post settings in
existing JSON/settings storage); no secrets; the word «модель» stays out of product copy
(admin screens exempt); every parameter keeps a «?» hint in RU and EN; no `uppercase`
text-transform in product copy; autopilot touches only the test group in any live check;
never press «Опубликовать сейчас».

## Decisions

### 97dq.70 — One settings panel for channel and post (B1, B2, B4)

Owner: channel settings and post settings must be one reused component with the same fields;
the post autosaves; a save split button offers «for this post» or «for the whole channel»;
the «Как пишем в …» button is redundant; the plan row must be at the top, under
«Убрать следы / Проверить факты / Переписать»; one delete, not two; the plan mode is missing
from the channel's own settings; per-post mode changes must apply to the already written post
immediately; the reserve state needs «Подтвердить», not «Снова запланировать»; the queued
(autopilot) state must read as already scheduled with «Изменить», not «Запланировать».

- One component renders the writing rules and the plan mode in two scopes: `channel` (channel
  settings modal, where «Изменить расписание» lives, and wherever «Как пишем в …» opened) and
  `post` (right panel of the piece channel tab). Same fields, same order, same hints.
- Post scope: every change autosaves as a post override, with inline «Сохранено · ЧЧ:ММ».
  At the bottom a `SplitButton`: main «Сохранить для поста», menu «Сохранить для канала» —
  the latter writes the current values as channel defaults and says so.
- Channel-scope plan-mode change with unpublished posts in the channel asks inline (no native
  dialogs): «Применить к N уже написанным постам или только к новым?» → «Только к новым»
  (default) / «Ко всем N». Posts with their own override are not touched either way.
- Post-scope plan-mode change applies at once to that post's latest version:
  reserve→autopilot queues it in its slot, autopilot→reserve unschedules back to reserve,
  →off drops the reservation and leaves a draft. Same `queueGate` path as today.
- Plan row moves to the top of the tab, directly under the text action buttons. Label and
  primary action by state:
  - off: «Черновик» · primary «Запланировать» (menu as today).
  - reserve: «В плане на ДД.ММ ЧЧ:ММ · бронь» · primary «Подтвердить» (queues it), menu
    «Сменить время», «Снять из плана».
  - queued (autopilot or confirmed): «В очереди на ДД.ММ ЧЧ:ММ» (+ «автопилот» badge when so)
    · primary «Изменить время», menu «Снять с расписания», «Открыть в календаре».
- The «Как пишем в …» link/button is removed from the tab. Only one delete: «Удалить
  адаптацию» in the tab's top action row; the bottom duplicate goes.
- «Переписать с этим» becomes a `SplitButton`: main «Переписать с этим», menu «Переписать и
  запомнить для канала».
- Settings that do not change the text (plan mode, time) apply at once; settings that do
  (emoji, links, length, tone) show one quiet line «применится при переписывании» next to the
  rewrite button while the text is older than the settings.

### 97dq.71 — Side panels: resize and hide (overall note)

- One `SidePanel` primitive: drag the inner border to resize (min 280, max 560 px, keyboard
  arrows on the handle), a button to hide it into a thin rail on its own edge, and dragging
  past the minimum hides it. Width and hidden state persist per panel in `localStorage`
  (guarded). Reduced motion respected.
- Applied to the right settings panel of the piece channel tab (hides to the right) and to
  the left main navigation (collapses to an icon rail on the left, labels in tooltips).
- The right panel's default width grows from its current value to what makes it shorter
  vertically without squeezing the text column below 560 px; otherwise it stays.

### 97dq.72 — «Что публикуем» picker (B3)

- No horizontal scroll at any width down to 400 px; modal max width 720 px.
- The channel tab strip is replaced by a filter row: channel `Select` («Все каналы» + one per
  integration id, deduplicated) and a segmented state filter «Все · Свободные · В плане ·
  В очереди» with counts.
- Search matches title, `cnt-` code and channel name, case- and space-insensitive.
- Row: title; `cnt-NN` · channel name truncated with the full name on hover/focus · state with
  the full date «чт 24.09 09:20».
- Fix the doubled «Тестовая группа Content Factory».

### 97dq.73 — Plan ahead, production analytics, calendar chip (C3)

- The calendar chip is always visible and speaks in counts, not a streak: «В плане 3 поста ·
  до чт 24.09» or «План пуст». Reserved and queued posts both count. Hover lists channels.
- Analytics «Производство» fills the section width like the other sections.
- The top of the tab: «Постов впереди» (в плане / в очереди), «Дней с постами из ближайших 14»,
  «План до» (last planned date), «Первый пустой день». A 14-day strip with dates and per-day
  counts, legend in plain words. A per-channel table: канал, в плане, в очереди, вышло за 7
  дней, план до, первый пустой день. Every card has «?».
- The streak wording («0 дней впереди», «14 дней закрашено») is removed.

### 97dq.74 — Consistency and caps (C1, E3, F2)

- Read-only audit of shared UI across sections (buttons, split buttons, selects, segmented
  controls, tabs, badges, cards, section headings, modals, empty states); fix the divergences
  on the screens this wave touches and list the rest in Beads.
- Remove every `uppercase` / letter-spaced caps label in product copy (eyebrows, hints,
  section labels such as «РАСХОД И РОЛИ ВЫЗОВА»); sentence case instead. `DESIGN.md` records
  the rule; a test fails on `uppercase` in product components (admin exempt only if needed).
- `Disclosure` bug: a `display` utility on the content region beats `hidden`, so «Отдельный
  ИИ на задачу» never collapses. Fix in the primitive.
- Global settings must not say «Модель для текста»: «ИИ для текста» outside admin.

### 97dq.75 — Links and editing (E1, overall)

- When any selected channel allows links (ceiling ≥ 1), the intake asks one deterministic
  question: «Какую ссылку поставить в пост?» with «Без ссылки» or a URL field. The answer is an
  author-provided link the adaptation may use; it never invents others.
- The adaptation settings panel shows «Ссылка для поста» prefilled from that answer, editable
  later; a change applies on rewrite.
- The adaptation editor gets a link button (and italic/underline from 97dq.52).
- The brief («заготовка») is editable after creation: the core text inline with autosave, and
  «Дописать материал» appends to the source with an explicit «Пересобрать суть».
