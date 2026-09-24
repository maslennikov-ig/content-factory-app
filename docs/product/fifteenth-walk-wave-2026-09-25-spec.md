# Fifteenth walk wave — 2026-09-25

Source: owner walk of artifact `36e748b3` (release `0c29cd303143`), sent 2026-09-24 14:25Z.
Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-25-fifteenth/`
(`sent.html`, `shots/A1_1.jpg` source-kind segmented control, `shots/C2_1.jpg` emoji slider).

Statuses: ok A0 A2 A3 C1 C3 D1 D2; discrepancy A1 B1 C2; B2–B4 not checked (blocked by B1).
Owner decisions on the remaining list (2026-09-24): carrying the post plan mode into the channel on
«Сохранить для канала» is intended; roles for unpoliced doors — yes; additive `possiblyBilled` column —
yes; shorter Flex chain — yes; «Без предела» enabled on production (done at root, `monthlyOperations=-1`);
term «пространство» stays; public commit subject stays. Everything goes into this wave.

Hard boundaries: no secrets; schema change only the additive nullable `AiUsageRecord.possiblyBilled`;
no «модель» in product copy (admin exempt); RU and EN equal; «?» on every parameter; no caps;
autopilot only on the test group; never press «Опубликовать сейчас».

## Production facts (read-only)

- A0: «Ко всем 9» at 13:27 moved nine test-group posts to reserve (DRAFT); at 13:28 the owner set the
  channel back to autopilot «только к новым». Works as designed.
- B1 `Failed to parse … Unterminated string`: `AiUsageRecord` draft 13:38:47 failed with completion
  2162 tokens of which reasoning 1887; the JSON ran out at ~275 visible tokens inside the
  percent-encoded Wikipedia URL. The completion ceiling does not account for reasoning.
- cnt-36 (`c326e624`): the first core (core-write v12) narrated instead of writing: «сначала я описал
  это как сокращение вдвое, а в ответе уточнил…», «О том, как… конкретных деталей нет. Здесь можно
  рассказать о результате». The model decision «Не описывать конкретные шаги…» was retold, not applied;
  the person's answer (в полтора раза) conflicting with the material (вдвое) was narrated. Extract
  produced a duplicate fact «Вдвое меньше.».

## Decisions

- 97dq.91 (P0) — text roles get a completion ceiling that leaves room after reasoning; on
  `finish_reason=length` one retry with a larger ceiling; the author link goes to the model as a
  placeholder and is substituted after parsing (the anchor words stay the model's or «Текст ссылки»).
- 97dq.90 (P1) — core-write v13: the core is always finished text in the author's voice; model
  decisions are applied silently; a person's answer overrides a conflicting number in the material
  without mentioning the correction; no meta speech about the text, the material or the answers;
  a guard flags meta phrases. Extract dedupes facts contained in another fact.
- 97dq.94 — Flex chain: one flex attempt with a 60 s budget (first token for streams), then standard,
  then fallback.
- 97dq.86 — choosing «Бронь» on a post whose channel is on autopilot stores an explicit `reserve`.
- zg8w — billing: ADMIN; `POST /posts/separate-posts`: EDITOR+; `POST /posts/:id/comments`: any
  member; `/third-party/*` and `POST /oauth/authorize`: any member by design, recorded with reason.
- tcxv — nullable `AiUsageRecord.possiblyBilled Boolean?`, written on failed attempts.
- 97dq.87 — the «Применить к N» question explains what happens to posts for the chosen direction.
- 97dq.88 — segmented control items share the width evenly; the «?» does not squeeze the item.
- 97dq.89 — link question: no «Сохранить ответ»; link and «Текст ссылки» save like other answers,
  one «Дальше».
- 97dq.92 — emoji slider on the label row between «Эмодзи (?)» and «до N».
- 97dq.93 — the left navigation collapses live when dragged past the minimum.
- 97dq.43 p.5 — busy/confirm buttons keep their width.
- 97dq.76 — remaining hand-built cards move to the shared `Panel` without visual change.
- odb8.4.1 — word search in the posts list.
- fn33.28 — «Создать пост» window: design canvas round, then implement the owner's pick.
