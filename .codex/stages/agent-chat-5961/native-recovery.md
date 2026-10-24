# Native recovery acceptance

Root owns permission policy, approval metadata/ingress, empty streams and final acceptance.

## Permissions and consent (Task 2)

Installed `@mastra/core` 1.78 source reproduced three integration edges: `onSessionCreated` follows automatic thread subscription, `permissionRules` is excluded from the SDK's persisted metadata keys, and `requireApproval` receives a plain request-context record. Product now restores exact scoped permission metadata through public Session APIs before attaching the thread. Defaults classify declared safe reads as read; explicit tool/category ask/deny remain authoritative. No blanket allow policy or parallel runtime was added.

Actual PostgreSQL/Redis SIGKILL proof uses mixed `skill({name:'content'})` and `piece_read` after a genuine confirmation. Fresh and recreated sessions complete safe reads without surprise consent. Explicit ask and explicit skill-read deny survive restart; the write is applied once. The probe injects the former broad 600-second run claim and proves the next exact card/call can resume. The claims now identify the run, tool call and question card (or exact approval call), release after the durable answered mark, and still reject overlapping answers.

Meaningful approval metadata is required live, from history and on ingress. Missing object/action metadata produces a disabled recoverable display state and cannot authorize an operation. Exact saved-content fingerprints remain binding; publish/delete and explicit read restrictions keep their original consent boundary. Focused native read/session/cold/HTTP/doors/UI tests cover parallel gates and retained restrictions.

## Empty streams and durable state (Task 5)

`tests/agent-chat-empty-stream.test.cjs` uses real MastraService, native PostgreSQL/Redis and actual HTTP handlers. Only the external model is frozen. Exhausting primary/fallback1/fallback2 makes exactly three attempts, one admission and a visibly settled failed execution. A usable fallback completes after two attempts. Empty outputs never enter the separate availability continuation owner; existing provider/fallback choices are unchanged.

Root browser thread `a6d402dd-e327-432f-8c88-e3aa0767cf45` persisted the first custom answer, survived an owned backend restart and reloaded the same second question. The next real answer returned HTTP 200 on the server, then the browser route intentionally lost only that response. Native continuation created the next adaptation question. Authoritative history hydration restores a new tool call as well as the same call's next card; no answer is resent to recover display. Subsequent chat answers completed the original goal, and a readback reports `settled/completed`, no pending calls, one saved piece and one Telegram draft. Browser proof and exact IDs are recorded in `acceptance.md`.

No paid calls, production access, push, merge or deployment. Original incident retry topology and allocation cause remain historical unknowns; these are local reproductions of the confirmed failure shapes.


## Final SDK and browser reacceptance

Source `36c4ae749`, patch `c2de6ad67a8bc72cd6b4418e6b96c7355ac6fdfe000512ee9379b5508d8adb5e`:
13 root-owned native compatibility suites / 37 tests passed, zero skips, exit 0.
They cover empty chains, actual cold read policies, SIGKILL partial answers,
HTTP/session history, Stop settlement, committed receipts, authorized output
projection and live subscription/listener cleanup. The cleanup keeps native
pending questions and once-only answer application intact.

Fresh thread `48a59090-42f8-423a-b37e-6c713536a56c` completed the exact original
request on this same SDK. Reload retained an unsent custom answer; the accepted
answer survived a real backend restart. The final core answer was accepted with
HTTP 200 and its browser response intentionally lost; authoritative history
restored the new adaptation tool call without resubmission. Answering the two
adaptation questions completed the original goal automatically. Readback has
`settled/completed`, no pending calls, exactly one new piece and one derivation,
Post DRAFT and an exact saved-text/artifact-panel match after HTML rendering.
The single browser console error in this case is the injected lost response.


Final bounded-cache source `79b5b819c` passed the root-owned 14 native suites /
38 tests, exit 0 (250.279 seconds). The full app was restarted with explicit
`--max-old-space-size=512`. Fresh final thread
`a5222c3c-2cc7-4c30-aec1-fef81687b8a9` repeats the entire request on that source:
unsent draft reload, a pending gate retained for 39.9 seconds, cold backend
restart with accepted-answer readback, accepted HTTP 200 intentionally lost,
new adaptation call recovered without resending, and saved Telegram draft
opened automatically. API/Prisma readback again proves one piece/derivation,
settled/completed, no pending call, exact rendered saved text and Post DRAFT.
