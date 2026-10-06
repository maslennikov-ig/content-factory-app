# Adaptation instructions and question processing

Owner testing on 6 October 2026 exposed two UI gaps. Beads tasks
`content-factory-next-0qgn.14` and `content-factory-next-0qgn.15` own their
acceptance; the original epic criteria and deferred decisions remain unchanged.

## Adaptation instructions

An editable draft shows its existing text actions **before** the text and
preview, so a long post cannot hide the instructions. The adaptation action
is named “Дать указания ИИ” / “Give AI instructions”; the core keeps its existing
rewrite action. Opening it focuses an inline field asking what should change
in this adaptation, gives an example, and explains explicit acceptance.

Submission uses the existing selected-adaptation `/rewrite` contract with
`{ instruction }`, trimmed and limited to 2,000 characters. Opening the field
and choosing a suggestion make no request. The existing review result and
signed acceptance protect the current draft from silent replacement and
concurrent changes. While pending, input and suggestions are disabled; failure
keeps the instructions and permits an explicit retry. Permission, queued-post
manual editing and published-post restrictions remain as before. Planning stays
after the text. The embedded agent panel uses this same channel tab.

## Question processing

`QuestionsCard` and `SuggestedQuestionsCard` reuse the shared `Button` loading
state and `WorkingLine`. The latter accepts an optional localized `busyLabel`:
the core says it is being rewritten, the channel names its adaptation, link
saving names saving, and the chat names its ongoing work. Existing `busy`
controls the full request/stream lifetime; the pending card disables another
submission and exposes an accessible progress indicator. Settlement removes
the indicator. Existing error handling retains answers and reopens the controls.
The shared working track's fixed width wins over `Progress`'s full-width CSS;
the browser check must verify the visible caption has nonzero width.

## Implementation and verification

Implement both changes in the existing components, update their inventory,
then verify current-variant request targeting, no automatic acceptance,
pending/error/retry, RU/EN labels, shared page/chat processing and action placement.
Use the affected component/container suites, frontend typecheck and design
guards. An actual release also requires the repository's full release checks;
component fixtures establish UI behavior, not live model quality or client acceptance.

Rollback is an ordinary revert of these UI changes; no database migration,
workflow contract, model pipeline or additional dependency is introduced.
