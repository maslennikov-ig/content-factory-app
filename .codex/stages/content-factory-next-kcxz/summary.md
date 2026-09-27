# Stage summary — `content-factory-next-kcxz` (agent chat), after W0 + W1 + W2 and release 1

State on 27.09.2026 night: owner «Исправь все найденные проблемы и доделай до конца. Даю тебе все
разрешения.» — every open finding of W2 fixed and proven live (`evidence/live-stand-w2-2026-09-27/`
`final-check-…`, `final-recheck-…`, `release-check-…`; correctness review of the fixes
`evidence/correctness-review-followups-2026-09-27.md`), then release 1 (`.17`: «Агент» back in the menu,
help answer, Mastra 29 → 45). Closed with it: `.30`, `.32`–`.38`, `l7tm`, `tbuj`, `ia7s`, `wffi`. Next: W3
`.18`–`.21`.

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
