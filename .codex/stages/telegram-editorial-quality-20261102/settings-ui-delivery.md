# Writing settings card delivery

The conversation reads the native `writing-settings` payload using the shared schema and displays the channel baseline, proposed values, reason and channel. The typed form validates the answer against the shared schema, applies to this post only, or explicitly keeps the channel defaults. Drafts survive a reload; busy, failure and stale/retained states are represented. A malformed payload cannot fall back to a generic answer. When native resumed data is retained, the history displays the actual applied settings. RU/EN copy explains that changing channel defaults needs a separate request.

Files: `agent.contract.ts`, `agent.conversation.tsx`, `agent.cards.tsx`, `agent.writing-settings-card.tsx`, `docs/design/component-inventory.md`, and `tests/agent-writing-settings.test.cjs`.

Verification (Node 22 via nvm): `pnpm exec jest --runInBand --coverage=false tests/agent-writing-settings.test.cjs` passed 5 tests; design guard, contrast and foundation passed 56 tests. Focused UI test mocks the unrelated absent `remark-math-extended` and `katex` packages. Frontend tsc reached only two existing missing-module errors for these packages in `agent.markdown.tsx`; no errors in changed files. The existing adaptation card test could not load for the same missing dependencies. Browser and integration acceptance belong to the root. No deployment or live calls.

## Confirmation and platform limit follow-up

The persisted `data-progress` / `writing-settings-confirmed` event is read as a completed card, even when the subsequent capability fails. On the assembled conversation, it replaces any earlier suspended copy with the same card ID; the recorded answer, including edits, is visible. The prior `data-tool-call-resumed` reader remains backward compatible. The form uses the shared `writingSettingsWithinLimit` check for explicit ranges, exposes the platform limit, allows correcting an oversized proposal, and renders `scope: drafts` as applying to the current material and all parts of any resulting series. Relative/automatic length does not display the retained baseline range as a selected limit.

With the installed dependency tree available, focused UI tests pass 8/8 without mocks; question-history and design-guard checks passed alongside the earlier 7 UI cases (46 total). Frontend TypeScript check passed with no diagnostics. Browser/integration acceptance remains root-owned.

## Root acceptance
Accepted into the shared isolated task worktree; root integration and relevant follow-ups passed (see acceptance.md).
cleanup_status: cleaned
cleanup_notes: No child worktree/runtime was created; shared source and root-owned evidence retained.
