# Twelfth walk wave — 2026-09-23

Source: owner walk of artifact `ceebe2fa` on release `6928b1f20c47`, sent 2026-09-23 13:23Z.
Evidence: `.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-23-twelfth/`
(`sent.html`, `notes.md`, `shots/`, `prod/`). Beads: `97dq.55`–`97dq.62`.

Passed: A2, B1, B2, B4, C1, C2, D1, D2, D4. Discrepancies: A1, B3, C3, D3. Wishes on
nearly every step and in the general note.

## Production facts read 2026-09-23 (SELECT only)

- `prod/ai-routing.json`: instance row and env are `openrouter` + `openai/gpt-5.6-luna`;
  no GLM anywhere; 7-day usage is Luna only. `AiUsageRecord` has no token counts.
- `prod/cnt-32.json`: the core is five sentences. Both answers the person gave are in it.
  The two delegated questions (`ask-1`, `ask-3`, field `facts`) were stored empty, and rule 4
  of `core-write/v9–v10` («мало слов — короткая суть») kept the core short. Nothing
  developed the author's arc «как мы к этому пришли» that the goal names.
- OpenRouter public catalog 2026-09-23: `openai/gpt-6-luna` $0.10/$0.50 per M, flex endpoint
  `openai/flex` $0.05/$0.25; `openai/gpt-5.6-luna` $0.20/$1.20. `z-ai/glm-5.3` exists.
  OpenRouter docs: `service_tier:"flex"` routes only to flex endpoints and surfaces capacity
  errors instead of falling back.

## Owner decisions (2026-09-23, chat)

| Beads | Decision |
|---|---|
| 97dq.55 | Text model `openai/gpt-6-luna`, reasoning effort `medium`. Chain: flex → flex → standard → `z-ai/glm-5.3`. Batch is not used: every call has a person waiting. Usage rows carry tokens, served tier, model, attempt and cost. |
| 97dq.56 | «Решите за меня» = decisions, not facts. The model writes the angle, audience, conclusion, structure and the reasoning behind the author's claim, marked «предложила модель»; it never invents the author's experience, cases or numbers. The core develops what the person said instead of shrinking to the minimum. Model-origin brief fields reach the adaptation labelled as proposals. |
| 97dq.57 | Planning mode per connected channel: «без плана» / «бронь» (default) / «автопилот». Бронь: the latest version holds the channel's own slot, labelled «в плане на …», published only after the person confirms. Автопилот: the latest version is queued and publishes by itself; a new version replaces it. «Черновик» remains only in «без плана». The picker shows a booked date instead of hiding the adaptation. |
| 97dq.58 | Honest «Ссылки» wording (a ceiling, needs a link in the material); profile autosaves with inline «Сохранено · ЧЧ:ММ», the button stays with a confirmation. |
| 97dq.59–.62 | Design canvas first, owner picks: calendar with five channels at one time (C2), confirmation after «Поставить на ЧЧ:ММ» and free/booked marks (C3), one split button everywhere (B4), emoji amount control (B1), emoji and future formats in the editor (B3), keys in two columns (D3), «на сколько дней вперёд», page transitions. |

## Answers owed in chat

- «Что мы поняли» reaches adaptation prompts (thesis, position, disagreement, audience, goal, format).
- «Вариант N» is a growing history of generations, newest selected.
- Token/consistency audit: see the wave report.

## Order

1. S1 97dq.55 → S2 .56 → S3 .57 → S4 .58, one write worker at a time; canvas at root in parallel.
2. Owner picks on canvas → one frontend worker.
3. Focused tests, four `tsc --noEmit`, process verification, live stand; release on the owner's standing word (2026-09-23 «выкатывай сам»); thirteenth walk page.
