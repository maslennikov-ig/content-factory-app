# Author comments and editorial controls

Task: `content-factory-next-zydk`, locally implemented.
App source: `e261777684f3efaec08bf3f5bdd68328766c4547`.
[Plan](../../../docs/superpowers/plans/2026-10-27-author-comments-length.md).
[Previous evidence-adapter repair](harness-simplification-2026-10-27.md).

## Findings and owner decision

The retained owner run researched an interval after the earlier post, through the request clock. Its assessment explicitly reported weak coverage of 9–19 October, no primary announcement of the daily series, incomplete primary confirmation of resets, and one supplied release-notes URL that could not be read. The limited 9–19 interval was a subset gap, not the end of the entire request. The later supplementary search was lost at the old continuation boundary; v8ie repaired that data path. Post length does not explain missing source coverage.

The applied 1500 ceiling comes from `TELEGRAM_WRITING_DEFAULTS`, not a saved owner setting or the provider limit. `Integration.writingProfile` was null. The native adaptation schema omitted existing backend length controls, so the conductor could not select them. The saved 1791-unit text then produced a truthful advisory after writing; that did not resolve the earlier editorial choice.

The old request asked for a factual digest without explicitly requiring a personal view per update. The author-comment preference was not persisted. A generic invitation to the reader at the end of a post is unrelated to interviewing the author. The owner now explicitly chose optional author comments by default for their channel's news roundups.

## Implementation and parameter audit

No new workflow, interview engine, role router, model call, schema migration or dependency. Native Mastra `ask_user`, Memory/resume, current per-step instructions and the existing channel writing profile are reused.

| Control | Actual native behavior |
| --- | --- |
| Length | Added backend auto/range, ideal bounds/optional explicit hard maximum; shorter/channel/longer uses the existing relative policy. |
| Takeaway | Added the existing per-post main-reader-outcome field, grounded in the actual task/material. |
| Link and anchor | Added actual supplied/selected-source URL, explicit `none`, and link text. Explicit author choices remain authoritative. |
| Emoji, hashtags, link placement, CTA | Already exposed; now permit sensible delegated editorial choices, with matching schema descriptions. |
| Material kind and avatar | Already exposed. The target channel's supported kinds and explicit avatar remain constraints. |
| Research and creation | Existing input kind, search level/none, selected facts/passages/captures, original request and contextual material are available; no extra parallel controls added. |
| Address form / formatPreference | Existing channel properties; per-post addressForm is ignored by backend and formatPreference is not a consumed per-post override, so no misleading new fields were added. |
| Author answers | Actual human replies via native questions; omitted/delegated comments are not invented personal views. |

`piece.adapt` forwards controls through the existing PieceService; API shape validation precedes effects and uses the existing revisable-input result. Existing profile/provider precedence remains; no new length algorithm or quality blockade.

The conductor reads a known target channel before authoring. When its editorial preference requests author views, it asks after selecting actual updates, one focused native question at a time, with an omit option. Actual replies remain labelled by topic in `material`. The optional `contextMaterial` is retained in CORE JSON, core reads/rebuilds and adaptation hints/prompts, independently of verified source facts and task permissions. Historical rows without it remain readable.

Research coverage and available post space are separate decisions. The conductor must preserve scope, assess actual remaining source gaps and explain an unsupported format/size rather than silently omit requested topics or treat saving a draft as editorial acceptance.

## Authorized local preference

Only the owner's existing local channel was changed through authenticated GET/PUT `/integrations/:id/writing-profile`, with a concurrent-change precheck and readback. Length is `auto`. A 286-character owner note requests their view on each substantive news update, permits individual/all omissions and preserves replies in the core and adaptation. Other effective emoji/link/hashtag/CTA/format/avatar/address settings match before. No topic-specific rule or private channel id is embedded in application code/Git.

Private before/request/after receipts: `/home/me/.local/state/content-factory-next/honey-6013-20261027/author-comments/`.

## Acceptance and runtime

Root acceptance: 15 suites / 428 tests PASS:

```bash
pnpm exec jest --runInBand --coverage=false \
  tests/agent-adaptation-length.test.cjs tests/agent.intake-hints.test.cjs \
  tests/intake.author-request.test.cjs tests/intake.research-reuse.test.cjs \
  tests/piece-post-link.core-edit.test.cjs tests/agent-conductor.unit.test.cjs \
  tests/agent-native-autonomy.test.cjs tests/agent-native-session-http.test.cjs \
  tests/agent-current-instructions.test.cjs tests/agent-domain-questions-native.test.cjs \
  tests/core-write-v15.test.cjs tests/core-write-v16.test.cjs \
  tests/core-write-period-update.test.cjs tests/agent-capabilities.adapters.test.cjs \
  tests/agent-capabilities.w2-fixes.test.cjs
```

After a wording clarification about notes/permissions, the affected conductor unit target passes 107 tests. Backend/frontend `tsc --noEmit --incremental false` pass with empty logs. Docs links and diff checks pass. No release build/full repository suite.

Proof includes the real registry-to-service path for all added controls, native question/approval HTTP and human history, instruction refresh, partial-answer/SIGKILL recovery, context save/read/rebuild and actual adaptation prompt transport. The new context-read test initially caught dropped data in `coreOf`; the read view was corrected before acceptance. All generation transports in tests are controlled/free. Scripted transport proves mechanics/data, not spontaneous editorial decisions by a real provider.

Child preflight_recovery delivery accepted: capability/20 focused cases; root owns the integrated 428-case proof. No child commit, service or retained test schema. Only owned backend 3516 was replaced, PID 88711 -> 10246, source e26177768. Frontend 4337 process remains. [Local stand](http://localhost:4337/agents).

All 22 chats have equal messages/pending/execution before/after, including the one existing question. CORE, derivation and DRAFT are unchanged; all 12 protected original dirty-file hashes match. Authenticated frontend GET is 200. Zero new usage rows since audit start. No paid inference/search, production change, push or deployment.

Preservation inventory also observed temporary external MainThread 8077 / language_server 50564 listeners disappearing independently; neither process was signalled by this task. All retained foreign listener owners match. Do not restart/restore unrelated tooling on that basis. Only the verified owned backend received SIGTERM. The writing-profile change above is intentional; historical chat/draft outcomes were not rewritten.

## Remaining limits

The historical partial digest was not regenerated or factually completed. Real-provider/editorial qualification remains `content-factory-next-eqh5`. No paid run was used to certify that a provider will always ask the right question or select perfect length/content.

Direct source fetching remains disabled. Telegram's current material adapter supports one post, and this change does not add automatic multi-post splitting. When the requested scope cannot fit an actually supported output, the limitation must be explained and the material choice resolved; no unsupported series/format knob is advertised. Other channel-profile defaults remain unchanged.

docs-reviewed: updated - cause, capability matrix, confirmed owner preference, acceptance and limits.
graph-reviewed: used - borrowed owner graph dd67538d is stale for current intake; focused earlier query returned no neighbors. Exact current code establishes this bounded data path. No graph refresh or external extraction.
