# Stage summary — `content-factory-next-kcxz` (agent chat), through release 4

State on 27.09.2026 night: owner «Исправь все найденные проблемы и доделай до конца. Даю тебе все
разрешения.» — every open finding of W2 fixed and proven live (`evidence/live-stand-w2-2026-09-27/`
`final-check-…`, `final-recheck-…`, `release-check-…`; correctness review of the fixes
`evidence/correctness-review-followups-2026-09-27.md`), then release 1 (`.17`: «Агент» back in the menu,
help answer, Mastra 29 → 45). Closed with it: `.30`, `.32`–`.38`, `l7tm`, `tbuj`, `ia7s`, `wffi`. Next: W3
`.18`–`.21`.

## W3 (28.09) — avatar, channels, AI settings, onboarding from the chat (code done, not released)

Owner 28.09 «Давай третью волну, W3 с kcxz.18». Each stream: worker → independent correctness review →
fix round (reviews `evidence/correctness-review-w3-{18,19,20,21}.md`, each with «## Fixes»). Decisions for
the owner are in spec §5.3 (avatar), §5.4 (channels), §5.5 (AI settings), §5.6 (onboarding). Main points:

- Sample files attached in the chat go from the browser to the avatar door; the model reads a bounded
  receipt; the composer names the target avatar. Own voice only from the chat.
- Deleting a channel removes only that channel's posts (screen, chat, public API, enterprise — `.41`);
  delete approval bound to the post ids.
- AI key only through the key card (browser → `/settings/ai`); pasted keys stripped in the composer and at
  the chat/MCP doors; guard searches the exact sent key values. **F1 (P1) also on the settings screen in
  production:** a mode switch could re-file the workspace key under the operator's provider — fixed in
  `AiProviderService.updateSettings`; a read-only production check is written in the W3-20 review
  (not run — needs the owner's word).
- «Сделать в чате» pre-fills the composer (never auto-sends); «Бронь» set only for a channel connected in
  this conversation whose mode was never chosen (`planModeChosen`).
- MCP plan/channel times need an IANA zone (`.42`).
- Deferred: `.39` (two simultaneous analyses both paid), `.40` (failed analysis reads «running» 20 min).
- Receipt 28.09 (not a release receipt): Jest 566/9257, node:test 122/0, Python OK, backend tsc clean.
- Owner 28.09 «Разрешаю всё: прогон, проверку базы и выпуск». Production F1 check: one own key, owner
  openrouter = stored provider — no bad row (`evidence/production-check-f1-2026-09-28.md`).
- Live stand (production keys, shredded after): walk 45 ops/0.045 USD, recheck 19/0.020, final recheck
  14/0.015 (`evidence/live-stand-w3-2026-09-28/` + `recheck-…`, `final-recheck-…`); review of the walk fixes
  `evidence/correctness-review-w3-walk-fixes.md`. Every P2/P3 fixed before release 2. Telegram connect on the
  stand went to the polling step (no bot on the stand); the human step was simulated by SQL.
- Deterministic pins added: last step of a turn is text-only (`conductor.steps.ts`, counted per stream so a
  resumed run is not tools-off) plus a controller closing line; step cap 6 → 7 (ADR 0012 §7); manual lines in
  one call; audience self-address removed from cores and adaptations (`audience-remark.ts`); metric words and
  statistics shown in plain words (display only).

## W4 (28.09) — ideas, facts, analytics, help and media from the chat (code done, not released)

Owner 28.09 «Давай W4 с kcxz.23», then «делай исправь все это». Each stream: worker → independent correctness
review → fix round (`evidence/correctness-review-w4-{23,24,25}.md`, `…-w4-25-vision.md`, each with «## Fixes»).
Decisions for the owner are in spec §5.7 (ideas), §5.8 (facts, texts, analytics, help), §5.9 (media). Main points:

- Ideas: topic subscription is confirm (card states the daily check and its cost), feed is write; re-adding an
  archived subscription revives it (screen too); a paid call refused before spending gives the step back;
  «Взять в работу» in the side panel pre-fills the composer.
- Facts: retract is confirm, restore is write; a superseded fact can be neither retracted nor restored (service,
  screen too). Analytics from the chat/MCP never refreshes tokens nor disconnects a channel (`mayRefresh: false`).
  Help is a Mastra skill over the single FAQ source.
- Media: owner 28.09 «агент видит картинки» — a pasted picture goes to the model for that request only (first
  model step), never stored (placeholder in history, proven with provider request echo); «В медиатеку» card
  (`media.keep`) uploads from the browser; generation = two AI operations, allowance pre-checked for both.
  `/agent/chat` body limit ~14.3 MB.
- Open for the owner: MCP may add facts as the person's own word (§5.8); screen «Свежо до» still ends at the
  day's start; one picture = two operations (§5.9); a lead title can steer archive/dismiss/take (no card).
- Full suite 28.09 on 6 W4 commits: Jest 573/575 suites (9801/9803) — the two reds (a main.ts import mock,
  the word «модель» in a new copy line) fixed at root and re-run green; node:test 122/0; Python OK. No live
  stand walk yet (needs the owner's word on production keys).

## Release 3 (29.09) — owner decisions of W4, avatar bugs, MCP (W5), released

Owner 28.09 «Давай сразу всё реализуем и выкатим… всё до завершения доведёт». Each stream: worker →
independent correctness review → fix round (re-review where a P1/P2 or a High was found).

- Owner decisions 28.09 on the W4 open items: MCP adds facts as the person's word — left as is (§5.8);
  «Свежо до» is the named day whole in the person's zone, one shared function for the facts door, the dormant
  form and the chat (`fact-valid-until.ts`, `.43`; no migration; a past day is refused for every caller; a
  known fact can be re-dated through the chat while in work); one picture = one AI operation — the picture
  prompt runs inside the single `image_generation` admission, on the editor's window and in the chat (`.44`);
  lead actions: **in the web chat `ideas.archive`/`.dismiss`/`.take` always ask on a card** (`.45`, §5.7) —
  two review rounds showed that a grant read from the person's words (action + named lead) kept admitting
  bypasses («Отклони все, кроме «Футбол»», short attacker-chosen titles), so one press is the price; dismiss
  takes a batch of ≤10 on one card, one transaction; the side panel's «Взять в работу» needs no card; MCP
  unchanged (the client approves). Every card of one step now carries its words (was: only the first).
- Avatar: one analysis per avatar at a time (Redis claim with owner token, 120 s renewed; `VOICE_ANALYSIS_RUNNING`,
  the screen waits for the other run) and a run that failed after saving its numbers reads as failed
  (`proposalFailedAt` in `metrics`), `.39`/`.40`; AI proposals keep `deviations` (lost since 25.08).
- MCP (`.26`): `/mcp` Streamable HTTP, stateless, on the registry; per-person OAuth (RFC 9728/8414 metadata,
  DCR for public clients, PKCE S256, resource binding, 1 h access / 30 d refresh with rotation and replay
  revocation), role re-read per request, USER reads only, confirm/input/secret excluded; org API key refused;
  per-token throttle; paid calls admitted under the OAuth person; the connect block and «Отключить» in
  «Настройки → Одобренные приложения» for every member; guide `docs/operations/mcp-connect.md`. New tables
  `McpOAuthClient`, `McpOAuthGrant` (pointed psql, applied on production 29.09).
- Live stand with production keys: walk 41 ops / 0.043 USD, recheck 9 ops / 0.013 USD
  (`evidence/live-stand-w4-2026-09-29/`); every P2/P3 fixed before the receipt.
- **Release 3:** production `9d2b8ba85a2f` (source `0bb9f8880`), rollback `47a57ed3fe9f`,
  `MCP_ENABLED="true"`, Mastra 45 unchanged — `evidence/release-3-2026-09-29.md`.
- Open: real Claude/ChatGPT connection not yet tried by a person (the protocol version each speaks is not
  stated in their docs; the SDK client flow is proven); the grant rule (`Deny` etc.) and the consent throttle
  are per person; the chat's run claims still wait on Redis without a bound.

## Release 4 (29.09) — W6, CopilotKit gone

- `.28`: the post-editor helper on CopilotKit is replaced by «Спросить агента» in the post window: a new agent
  thread with the request pre-filled, never sent (piece + channel by `cnt-NN`, or the post's text to make a
  piece, or the one-thought request); hidden in the browser extension. Autocomplete in the signature, autopost
  and plug fields is gone (decided for the owner, §4.4). `/copilot/chat`, its runtime and `@copilotkit/*` /
  `@ag-ui/*` removed; `/copilot/credits` and `/copilot/research` stay. Review + fixes, live walk 5 ops.
- **Release 4:** production `d6130a6f4dc0` (source `ecbd102b5`), rollback `9d2b8ba85a2f`, schema unchanged —
  `evidence/release-4-2026-09-29.md`. Open P3s are listed there.

## Decisions (owner)

- 26.09: place `/agents`; autonomy «почти всё сам» (paid steps and reserve without asking; delete,
  connect, publish now, firm date, move, autopilot, «Ко всем N», bot rename ask first); web + MCP; no
  secrets through the model; personal threads `{orgId}:{userId}`.
- 27.09: latest Mastra, build natively, don't hand-roll what Mastra has; screen = chat plus artifact
  (Codex/Claude; canvas variant C, sources `docs/design/desert-lab/agent/`); MCP fix ships with release
  1; USER may chat (write/paid capabilities not offered); an operator impersonating a member sees that
  member's threads; topic subscription and usage-mode switch are confirm-class (my default, unopposed).

## W2 (27.09) — what was decided for the owner (reversible, say if wrong)

- Adapting into an **autopilot** channel asks consent before spending (§1.4, premortem A1); over MCP
  refused (`AUTOPILOT_NEEDS_CONSENT`). The service itself refuses to queue without consent under the
  channel lock (`queueAllowed`).
- Accepting research/review/rewrite is a **pause inside the paid call** (selection card), so the
  snapshot key and the signed review token stay server-side; «Решите за меня» keeps the screen's defaults.
- A question card has an id hashed from its stored payload; a resume must send `cardId`.
- «Да» on publish-now/schedule/move is bound to the post text shown; changed text →
  `APPROVAL_CONTENT_CHANGED`, card shown again.
- The chat uses the calendar's zone (`getTimezone()`), sent as `x-agent-timezone`.
- `piece.answer` on questions opened in the same request is refused (the person answers first).
- A new check/rewrite of a text whose proposal card is open is refused (`PROPOSAL_CARD_OPEN`) — the person answers the open card first.
- «Отменить бронь» (chat and piece page) follows the channel only when that keeps the post out of reserve and queue.
- «Бронью» on a «Без плана» channel sets the post's own mode to reserve (the screen's two steps).
- «Подключим Telegram» starter is admin-only (server rule).

## Follow-up fixes 27.09 night — decided for the owner (reversible)

- A draft's plan card shows no time: the server sends a date only for a queued or reserved post, as the
  piece screen does (a draft's `publishDate` means nothing).
- An open-card refusal (`PROPOSAL_CARD_OPEN`) ends the turn (`stopWhen` in `conductor.agent.ts`) when it
  was the step's only tool call: the model says nothing after the refusal the person already sees.
- «Решите за меня» never invents the author's own experience (`core-write/v16`, `handedQuestionsOf`); the
  agent is told which questions stayed a gap. Decide-all closes the link question as «Без ссылки».
- Humanize (`review-prompt.v9`): a replacement that repeats the post becomes a deletion only for a single
  sentence ≥80 % repeated, else a note; a note on a sentence made of clichés becomes a proposed deletion
  (shown, the person accepts); a deleted opening restores the sentence's capital; never-say misses are
  logged and noted. Notes reach the agent (`leftAsIs`), not the card.
- `web_research` usage row carries model tokens only when the model key and the search key share a source;
  Tavily credits and request counts go to `serviceTier`, never into `costUsd`.
- A calendar/agent date change refused because the post left the queue (`POST_STATE_CHANGED`) touches no
  workflow; the calendar keeps its upstream «reschedule a published post».
- Production host disk: our previous image `55467395ea18` removed and build cache older than 48 h pruned
  (other projects' images, volumes and data untouched) — 1.3 → 6.2 GB free before the pull.

## Where things are

| What | Path |
|---|---|
| Spec / ADR | `docs/product/agent-harness-spec.md`, `docs/adr/0012-agent-harness.md` (+ «Поправка 27.09.2026») |
| Native-Mastra research | `evidence/mastra-native-2026-09-27.md` |
| Premortem W1 | `evidence/premortem-w1.md` (checks P1–P7, runbook R1–R6) |
| Mastra upgrade | `deploy/production/upgrade-mastra-storage.sh`, `mastra-storage-*.sql`, `.delta`; proof `scripts/operations/verify-mastra-storage-upgrade.sh [--from-dump]`; evidence `evidence/w1-mastra-upgrade/` |
| Registry | `libraries/nestjs-libraries/src/chat/capabilities/` (contract `agent-parts.contract.ts`, `approval-summary.ts`) |
| Agent | `libraries/nestjs-libraries/src/chat/conductor/` |
| Doors | `apps/backend/src/api/routes/agent.controller.ts` (+ throttle, request) |
| Screen | `apps/frontend/src/components/agents/` (contract mirror `agent.contract.ts`, `agent.transport.ts`) |
| Tests | `tests/agent-*.test.cjs`, `tests/agent-scenarios*.cjs`, `tests/fixtures/agent-scenarios/`, `tests/mastra-*.test.cjs` |
| Reviews / walks | `evidence/correctness-review-w1.md`, `evidence/live-stand-2026-09-27/` (+ `recheck-2026-09-27/`), `evidence/correctness-review-w2.md` (+ Fixes), `evidence/live-stand-w2-2026-09-27/` (50/60 ops, D1–D15) |

## Traps learned

- Production Mastra `mastra_workflow_snapshot.snapshot` is **text**; 1.27.1 init never converts it and
  silently skips its jsonb indexes. The upgrade converts it in-transaction; the latest backup with a
  `mastra.dump` is `20260826T180521Z-pre-avatars` (later backups are product-only), fingerprint equals
  production `310d75fc…`.
- A mocked-backend browser walk missed a P0: `customFetch` + ai@7 transport sent
  `content-type: application/json, application/json` and every real message got 400. Test the
  transport through real fetch.
- `SystemPromptScrubber` in Mastra 1.71 calls a model per answer (unbilled) — not used.
- Jest cannot load `@mastra/core/agent`; agent tests run a real Agent with a scripted model in a child
  Node process (`tests/helpers/agent-capabilities.agent-probe.cjs`, `agent-scenarios.runner.cjs`).
- Stand workspace «Stand kcxz2» `b5832987-…` (EDITOR + USER users, two fake Telegram channels) is kept;
  the stand instance limit is 2000 operations a month (owner 27.09: `InstanceAiDefaults.monthlyOperations`
  on the local stand DB, beats `AI_INCLUDED_MONTHLY_OPERATIONS` from any loaded env).
- MCP mounts nothing until `kcxz.26` (its old tools were removed); `/copilot/credits` stays for the media
  picker, now with a policy.

- W2 trap: the live model answered a new piece's questions itself (D1) although every scenario
  passed — recorded scenarios script the model; behaviour rules that matter go into hooks.
- `nvm use 22` does not take in these shells (~/.local/bin shim); run jest with
  `export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH`.

## Next (before 27.09 night — kept for history)

Short live check of `.32` on the stand (4 operations left of the owner's 20 for the recheck; keys only on the owner's word): an approval card further up answered «Нет»/«Да», a question card further up, a repeated rewrite refused with the open card. Also `wffi` (N3). Service bugs split off: `l7tm` (D3
«Убрать следы ИИ» misses clichés), `tbuj` (D13), `ia7s` (D15). Release 1 = `.17`: unhide `/agents` from
`HIDDEN_MENU_PATHS`, owner runs Mastra R1–R6, MCP fix goes with it.
