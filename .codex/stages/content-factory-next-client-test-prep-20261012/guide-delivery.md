# Owner testing guide delivery

## Status

Drafted the Russian interactive guide at `docs/client-answers/content-factory-owner-testing-2026-10.html`. It prioritizes natural, usable copy without clichés or bureaucratic language, offers three short fictional cases or the owner's own material, and has seven copy buttons (one shared instruction plus material and correction for each sample). Each case has the requested four result choices. The guide also has a three-item UI checklist, a whole-container optional notes question, one portal submit control, and clear autosave/final-submit guidance. The product link is `https://factory.aidevteam.ru`.

No lint, screenshots, browser run, publication, response pull, product access, or runtime action was performed in this work step. Root owns final artifact verification, publication, and acceptance.

## UI wording checked in current frontend source

- Agent entry labels and wait state: `apps/frontend/src/components/agents/agent.copy.ts` (`Новый разговор`, `Напишем пост из одной мысли`, `Думаем…`) and `apps/frontend/src/components/agents/agent.interview-card.tsx` (interview answer card passes the busy state through while the agent continues).
- Interview actions and loading: `apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts` (`Уточнение`, `Так и есть`, `Поправить`, `Решите за меня`, `Решите всё за меня`, `Дальше`) and `apps/frontend/src/components/content-intelligence/intake/questions.card.tsx` (submit and busy state).
- Ready adaptation correction: `apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts` (`Дать указания ИИ`, `Что изменить в этой адаптации?`, `Переписать`, `Принять выбранные`, `Оставить как было`) and `apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx`.
- Manual adaptation edit and save: `apps/frontend/src/components/content-intelligence/pieces/adaptation-editor.tsx` (`Редактировать`, `Готово`) and `apps/frontend/src/components/content-intelligence/pieces/piece-channel-tab.tsx` (autosave status); displayed copy is in `apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts` (`правки сохраняются сами`, `правки сохранены · …`).

## Assumptions and boundaries

- The owner has an existing usable channel and a way to reopen the created draft. If not, the guide asks them to mark the item as unverified; it does not ask them to connect an account.
- A model may not ask a follow-up in every case. The guide records that as “Не встретилось” rather than treating the loader as passed.
- The busy-state check accepts visible text, a spinner, or another visible indication; it does not require one exact label.
- The test stops at drafts. It asks the owner not to schedule or publish posts.
- No external resources, tokens, credentials, or account identifiers are included. Owned external resources: none.
