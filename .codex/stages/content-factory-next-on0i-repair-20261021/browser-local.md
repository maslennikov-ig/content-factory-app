# Root real-browser local acceptance (in progress)

Actual authenticated Chrome, Playwright CLI session `cf-on0i-repair`, frontend localhost4278, actual Nest API localhost3478. Synthetic QA primary actor; local PostgreSQL and Redis. Real model calls use the configured OpenRouter model, no publication or social connection.

## Verified

- Real no-search rewrite in the browser saved two correct messages. Sidebar has a plus to the right of the assistant, expands its chat list and leaves transcript height available. Header New is retained; no archive occupies the transcript.
- Sidebar New -> old saved chat, without page reload: both saved messages and unsent draft `Черновик: продолжим этот разговор позже.` retained. Initial empty-history defect was reproduced and corrected.
- Actual native seed of105 owned threads, authenticated API pages100+6 including prior chat, no duplicate/missing IDs. Browser clicked Load more and displayed all105 fixture links inside the dialog; no Load more after last page. Browser renamed an owned thread through its form and deleted it through the two-step confirmation. API cleanup removed the other104; all105 owned fixture IDs are gone. Evidence: real-local-qa-root-chat-pagination.json and evidence/chat-pagination.probe.cjs.
- Light/dark desktop and mobile layouts inspected. At390x844 page width390/height844, textarea700..780, Send792..824; no horizontal page overflow. Saved screenshots: output/playwright/on0i-repair-20261021/direct-answer-desktop.png, history-light-desktop.png, history-mobile.png, history-light-mobile.png.
- A natural no-search/no-save private-topic request returned an honest placeholder rather than inventing a cause. A followup asking for a question created native ask_user; exact GETpending was correct while UI initially displayed a closed generic line. Source fix applies authoritative pending updates to the live frame and refreshes pending on native input-wait. Reload now displays the actual question, answer field and delegated-choice button. Before/after screenshots are retained. Development HMR reset local React state once; normal reload reads persisted history and pending correctly.
- The actual delegated-choice button continued the displayed question without fabricating a private cause. A later warm tone question rendered its real choices and text field without reload after the approval/suspension phase fix. Answering through the text field closed the exact card and returned the requested restrained tone, with no save/search. Screenshot `question-warm-fixed-mobile.png` was visually reviewed.
- Initial observer reload attempt: one real GPT6Luna call, no search, one finalized matching usage row; saved user request and45-item answer remain in native history. Observer GET200 and no second chat POST. No explicit active-generation witness was retained before that reload, so it does not prove mid-generation recovery. The first live UI omitted the user after completion; authoritative terminal-history merge fixes that separate client defect and has a rendered regression for settled and delayed terminal markers. Evidence `real-local-qa-root-browser-observe.json` retains the original UI failure honestly.
- On frozen backend service61cd7d65, actual UI Stop after the first output items POSTed `/stop`201 with `stopped:true`. Exact task settled/interrupted, pending0; both the new human request and113-character partial answer are saved. Exactly one provider attempt was aborted; unknown cost/possiblyBilled is retained. Evidence `real-local-qa-root-browser-live-stop.json`. All four saved messages, including the older turn, were verified independently through the authenticated API. During frontend HMR the live display showed the older turn only; the exact rendered Stop regression preserves all four through the later isAbort callback. Compiled UI retest remains required below.
- Cold retained approval Stop now settles interrupted with pending0 and0provider calls. A subsequent final-scope backend restart preserves that state and does not resurrect the task. See `real-local-qa-final-bootstrap-cold-stop.json` and `real-local-qa-final-scope-bootstrap.json`.

## Preserved unsuccessful attempts and repairs

A fresh compiled-browser attempt did retain a positive active-generation witness
(Stop visible,10 visible list items) before reload. It failed: the UI showed an
error and native Memory itself lost items17–25. This is an actual failure, not a
hidden cached-panel selector issue. A deterministic native SDK/PG/Redis probe
then reproduced the shared processor-state corruption and verified the public
native stream factory repair. See `real-local-qa-root-compiled-reconnect-failure.json`,
`real-local-qa-root-compiled-reconnect-native.json` and `native-run-observer.md`.
These failures remain preserved; a fresh compiled-browser proof after the repair
is still required.

The next compiled build passed the exact active-reconnect regression: before
reload Stop was visible and3 items were rendered; afterwards the visible human
request and all80 notes were present, one chat POST and one observer GET, no page
errors. Private raw provider output, native Memory and HTTP text match exactly
(4567 characters); every one of the80 visible DOM items matches its provider line.
The initial root probe expected two ARTICLE tags, but the product renders the
human as DIV and assistant as ARTICLE; the original false-negative assertion is
retained with the DOM/source correction. Evidence:
`real-local-qa-root-final-compiled-reconnect.json` and
`real-local-qa-root-final-compiled-reconnect-server.json`.

That build still failed a later client Stop transition. The server acknowledged
Stop201, preserved all four messages, and settled interrupted with pending0.
The immediate UI retained the new human and two partial items, but its later
replacing history read discarded them before Memory flush and left the composer
disabled behind manual reconciliation. A short followup could not be entered
and made no model call. This is a real frontend defect; it is being repaired with
a controlled actual-SDK callback-order regression. Original evidence:
`real-local-qa-root-final-compiled-stop.json`,
`real-local-qa-root-final-compiled-live-stop-server.json`, and
`evidence/root-compiled-followup-cli.log`. No completed Stop UI acceptance is
claimed for this build.

Retest observer terminal hydration, Stop/history and a prompt followup on the compiled frontend without HMR; bind final source/build/suite receipt. Existing console connection errors came from controlled owned-backend restarts, and the development overlay intercepted one send-button click (the request was not duplicated). A fresh final console checkpoint must distinguish these from current UI errors. This document is not a full-epic passing receipt.


## Frozen build gate3: current positive reconnect, remaining Stop lock

Build `y0M4GIJnYzMuuEBFURymC` passed all3 typechecks and full monorepo build; source hashes remained exact through browser gate. On thread `2eb563f9-920f-4a00-a4d3-9eaaaf75d531`, root observed Stop visible and5 items, refreshed, then saw exactly80 items and1 original human/assistant pair,1 chat POST and1 observe GET,0 page errors. QA independently matched all4711 provider characters to native Memory content/parts, HTTP and every DOM item. One actual GPT6Luna call/attempt, known ledger cost $0.00181075. See `root-current-compiled-reconnect.json` and `real-local-qa-root-current-compiled-reconnect-server.json`.

The next actual Stop preserved both pairs and the partial answer, fixing the prior loss; server execution settled interrupted with pending0. However the composer remained fieldset-disabled with the manual reconciliation status. No follow-up was submitted. The initial probe awaited enabled input before serializing its already received Stop body, so the original wire body is honestly unknown. Source/SDK controlled reproductions then proved a native cancellation race could retire the active HTTP handle before Stop read its ID and return a null requestId; the exact public SDK UI stays locked on that response. The bounded server repair must preserve the stopped native logical request identity. All frontend uncertainty/generation/settlement gates remain intact. Original failure evidence: `root-current-compiled-stop.json`, `real-local-qa-root-current-compiled-stop-server.json`, `evidence/root-current-stop-diagnostic-cli.log` and `evidence/root-current-stop-status-cli.log`. Gate3 was aborted before the full suite; its4 passing command receipts are archived in `attempt-3/`.

A separate real PostgreSQL research request found another confirmed integration gap: the registered private history read inherited Session ask permission. Actual Exa search ran; draft intake returned recoverable insufficient evidence and no CORE. The model's own-history recovery then parked at an unnecessary permission card. Callable span success was not misreported as domain success. Owned public Stop settled the case with0 new calls/late writes; actual known costs remained in the ledger. See `real-local-qa-scenario-final-postgresql-skip-locked.json`, `real-local-qa-final-postgresql-parked-stop.json`. Native scoped/redacted producer HTTP is independently positive in `real-local-qa-final-postgresql-native-traces.json`; current quality remains failed until a fresh post-fix scenario. Both actual failures are under bounded repair; final compiled Stop/follow-up and complete root suite remain pending.


## Gate4 compiled diagnostic

Build FRi1t4LomC3tU1Ql0N_a0: a new80-item active reconnect passed exact provider/Memory/HTTP/DOM comparison (`root-postfix-reconnect-server.json`). The following Stop returned201 with an exact logical request and preserved all four native messages, but the composer remained disabled even after a later settled/interrupted authoritative focus read. No follow-up was submitted. Original failures and wire timing are retained in `attempt-4/` and the Stop delivery report. Gate4 was aborted before the full suite. The native owner completion Promise and late authoritative confirmation correction are now frozen; final compiled proof is still pending.
