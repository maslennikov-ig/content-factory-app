# Fourteenth walk wave — 2026-09-24

Source: owner walk of artifact `dcb6b0ba` (release `d3854954d052`), sent 2026-09-24 08:26Z.
Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-24-fourteenth/`
(`sent.html`, `shots/A4_1.jpg` calendar header, `shots/A4_2.jpg` emoji slider, `shots/B2_1.jpg` link field).

Statuses: ok A1 A2 A3 B1 B2 C1 D1 D2 E2 E3; discrepancy A4 A5 B3 E1. The owner writes wishes under
"ok" steps too (A2, B2, C1): they are part of this wave. Owner scope decision (2026-09-24): this wave
also closes every open 97dq tail and the small UI/i18n/guard bugs; the large epics (75xn, m0iy,
or3.9, 71m, c6k, ec48, odb8) stay planned for later waves. Link anchor decision: optional
«Текст ссылки» field; empty means the model picks meaningful words.

Hard boundaries as in the thirteenth wave: no Prisma schema change, no secrets, no «модель» in product
copy, «?» hint on every parameter in RU and EN, no caps, autopilot only on the test group, never press
«Опубликовать сейчас».

Facts found (read-only):
- A4: the channel list with «⋮» left `/launches` on 2026-09-08 (`3770097a`); it lives on `/channels`
  and the channel page. The walk page sent the owner to the wrong screen. «Как пишем» + «План» are
  there and on «Настройки канала».
- The «⋮» menu (`launches/menu/menu.tsx`) opens from the button's left edge and only corrects bottom
  overflow, so in the last table column it runs off the right edge.
- Emoji «до 3» reaches the prompt as a number, but `core-write-prompt.v11.ts` says "no emoji" and
  `slop-check` caps emoji kinds at 2–3 whatever the slider says. Slider readout sits on its own row.
- cnt-35 (`4ab700e7…`): «Пересобрать суть» rebuilt from `personText` only, dropping what the model
  had written from the delegated decisions (paragraph two and «Я заметил»). Old core is kept in
  `brief.revisions`, but no UI shows it.
- A5: «Переписать с этим» lives at the bottom of the right panel, visible only for draft/error and
  enabled only with a changed field; hidden or collapsed panels hide it.
- Left navigation scrolls with the page (no bounded height); collapsed rail drops the drag handle.
- Queued posts are read-only in the tab and the backend (`ADAPTATION_NOT_DRAFT`), while the publish
  workflow reads content from the database at publish time.

## Decisions

### 97dq.78 — Post panel: works before the first text, one clear regenerate (A2, A5, B2)
- The «Адаптировать для …» cell opens the channel tab without generating; the panel is open and its
  primary action is «Адаптировать». Stored settings apply as today.
- Panel header: title «Настройки поста», «Сохранено · ЧЧ:ММ», the hide button inside the header (not
  floating). Under it the primary SplitButton «Переписать по настройкам» (before the first text:
  «Адаптировать»), always at the top, enabled when settings are newer than the text or differ from
  the channel; menu: «Переписать и запомнить для канала», «Вернуть как в канале» (replaces the bottom
  «Сбросить»). «применится при переписывании» stays as a quiet line under it.
- Link field: no «Без ссылки» / «Как в заготовке» buttons. The field is prefilled from the brief;
  clearing it means no link in this post (said in its «?»); an icon button with a tooltip «Вернуть
  ссылку из заготовки» appears only when the value differs from the brief.
- One delete: «Удалить» sits in the page title row right of «В архив» (deletes the adaptation on a
  channel tab, the piece on «Суть»), with the existing confirm; the text-column delete goes.

### 97dq.79 — Link on words (B2)
- For html editors (Telegram) the author link is attached to 2–5 meaningful words as `[words](url)`,
  never a bare address; plain editors keep the address. Optional «Текст ссылки» under «Ссылка для
  поста» (post and brief answer): when filled, exactly those words carry the link.

### 97dq.80 — Queued posts are editable (B2)
- A queued post whose slot is in the future is editable in the tab; the save updates the stored post
  that the workflow reads at publish time. Line under the editor: «Правки уйдут в пост, если
  сохранить до ЧЧ:ММ». If publishing already started or finished, the save is refused with a plain
  message. Autopilot regeneration keeps replacing queued content as today.

### 97dq.81 — Channel menu inside the screen, channels reachable from the calendar (A4, general)
- The menu primitive clamps to the viewport horizontally (opens leftwards when there is no room).
- The calendar header gets a clear way to channels and their settings (final form from 97dq.82).

### 97dq.82 — Calendar header and scrollbars: design round (A4, C1)
- Canvas with header directions from the real tokens and the same controls; plus a themed thin
  scrollbar for light and dark. Owner picks; then implement.

### 97dq.83 — Emoji count means a count (A4)
- Slider readout on the label row. «до N» is honoured: channel emoji line wins over the core
  "no emoji" rule for adaptations, `slop-check` uses the chosen ceiling, the prompt asks to use close
  to N (never more).

### 97dq.84 — Left navigation stays put (E1)
- Sidebar is sticky at full viewport height with its own scroll; profile/logout/collapse pinned at
  the bottom. The collapsed rail keeps a drag handle to expand it back.

### 97dq.85 — Core rebuild keeps decisions; core versions visible (B3)
- «Пересобрать суть» writes from the material, the added material, the person's edits and every
  answer (person and model decisions), and must not drop content that the previous core carried from
  those inputs. «Версии сути»: list with date and author, view, «Вернуть эту версию» (itself a new
  revision).

Owner pick 2026-09-24 (canvas `7b68fb98`, `scratchpad/cal-header` sources): header **A — two rows by
meaning** (row 1: ‹ range › «Сегодня» … period Segmented + calendar/list; divider; row 2: channel
Select, stage Select, quiet «Каналы» with gear → `/channels`, … plan chip with «?» holding the legend,
primary «+ Запланировать»; the separate legend row and «Все каналы →» go). Scrollbar **S1** — 8 px
rounded thumb `--cf-border-strong`, hover `--cf-border-control`, transparent track, global for light
and dark (`scrollbar-width: thin; scrollbar-color` + `::-webkit-scrollbar`).
