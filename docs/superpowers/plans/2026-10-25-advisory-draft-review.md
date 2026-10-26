# Advisory draft review and bounded complexity audit

**Goal:** Save usable generated drafts with honest, optional quality findings;
editorial checks must not turn a completed generation into a failed task.
Owner accepted this behavior on 25 October 2026.

**Approach:** Keep one final semantic review and free copy/length findings.
Return the original draft with `passed`, `partial` or `unavailable` review data.
Remove automatic quality rewrite/re-review loops. Keep generated citation metadata only for admitted source ids; missing/unknown bindings are an advisory, not a reason to buy another draft. Use the existing adaptation
event, tool result, artifact card and Mastra Memory to retain review data across
reloads and native continuation. Do not add a review queue, database migration,
parallel runtime or provider-specific workaround.

**Boundaries:** Auth, tenant ownership, real provider failure, admitted source identity,
publication consent, spending admission and exactly-once operation receipts
retain their existing contracts. A saved draft is not editorial acceptance.
Preserve historical failed chats and drafts. No paid calls, push, deployment,
production changes or foreign service restarts.

## Scope and acceptance

- Generated content survives incomplete/invalid/unavailable quality review,
  copying and overlength findings without being relabeled as verified.
- Keep findings and exact saved adaptation identity in native output; show one
  collapsed advisory on the saved artifact, including after reload.
- Audit the adjacent generation, post-save and conductor paths; remove proven
  redundant checks/retries that can discard a draft or buy an unsolicited
  quality rewrite. Preserve necessary structural and side-effect boundaries.
- Verify the real generator -> PieceService save -> capability result path
  without external inference, plus focused frontend and native continuation
  checks. Verify current chats, records, usage and foreign process/file hashes.
- Keep a concise audit with fixes, justified retained controls, and limits.

## Implementation and proof

Root owns the generation graph, review contract, domain event and capability
producer. A read-only delegated audit covers adjacent gates independently; a
bounded frontend stream can consume the final artifact contract. Current work
is isolated in `codex/local-real-model-20261025` so the original checkout's
eleven foreign edits are untouched.

Affected areas: `agent.graph.service.ts`, `adaptation-coverage.ts`, shared
`voice-wiring.contract.ts`, `piece.service.ts`, adaptation capability/conductor,
agent artifact renderer and corresponding focused tests. Rollback is one local
source change; no schema or history rewrite is needed.

Final acceptance: focused changed-behavior Jest suites, backend/frontend
TypeScript, `git diff --check`, local browser replay without model calls,
identity-checked owned backend refresh and preservation snapshots. Full release
build/suite is outside this local change. Real API editorial acceptance remains
unverified because paid calls are prohibited.


## Delegated delivery

- `chat_complexity_audit` (GPT-6 Luna/max): read-only findings delivered and
  accepted. Root authorized a bounded research-reuse correction with exact
  scope-clarification preservation; no resources created or cleanup needed.
- `saved_draft_advisory_ui` (GPT-6.1 Sol/high): five frontend/test files delivered
  and accepted; 51 focused tests passed. Root owns integrated verification.
  Follow-up read-only routing review found no concrete bugs. No resource cleanup.


## Acceptance

Implemented under `content-factory-next-zcdn`. Final root acceptance and bounded
limits are recorded in `.codex/stages/agent-chat-5961/advisory-review-audit.md`.
The delegated research correction preserves exact explicit scope clarification
through the existing assessment object; no parallel runtime or schema change.
All delegated writers completed; safe-only cleanup requires no service changes.
