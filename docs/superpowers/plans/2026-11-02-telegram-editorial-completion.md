# Telegram editorial completion

Owner follow-up, task `content-factory-next-g4qy`. Production trace confirms an
unproposed length change, a title stored only as metadata, and an explicit
instruction to stop after advisory findings. Earlier May Telegram playbooks
in the read-only donor informed channel defaults, but not a complete authoring
contract. No private chat content or identifiers belong in this document.

## Decision and scope

- One shared Telegram policy feeds opening, body and review: informative in-post
  headline for digests/explainers, coherent sections, supported reader benefit,
  dates/access, sources under the chosen link policy, genre-specific exceptions.
- Before generation, the native agent proposes 2–3 task-specific numeric ranges
  with tradeoffs and one recommendation. Manual channel defaults are a secondary
  explicit choice, not a ceiling. The person selects or edits the range on the
  existing card; accepted values persist per material. Exact numeric requests and
  delegated automatic size use that same approval. Only technical platform
  limits constrain proposals; an estimate is not an actual count.
- Extend the existing semantic review with an optional corrected candidate and
  its final findings. This is one existing call, not a retry loop. Only generated,
  not-yet-saved Telegram text may be corrected. Preserve topics, author meaning,
  required links, media metadata, source bindings, number/order of posts and
  permissions. A missing/invalid/unavailable correction preserves the paid draft.
- Recompute length and foreign-copy findings for the actual selected text. A
  model verdict never overrides deterministic failures or missing source bindings.
  Return applied corrections separately from remaining findings. Never invent
  evidence or silently increase settings to clear a warning.
- Existing saved edits and publication approvals remain unchanged. The owner subsequently authorized push, merge and deployment. Paid QA and
  external sends remain outside the release scope.

## Implementation / acceptance boundary

Files: `agent/channel-directives.ts`, `agent/telegram-editorial-policy.ts`,
`agent/adaptation-coverage.ts`, `agent/agent.graph.service.ts`, the existing
quality-review contract, conductor/capability instructions and focused tests.
Document the common rules and their research basis in the existing operations
guide; supersede only the previous no-correction policy for pre-save Telegram
generation. No DB or Temporal contract change.

Checks: focused generation/review tests (safe correction, unavailable/invalid
response, shape/URL/length/copy protection, no added calls), settings-approval and
saved-result regressions, backend/frontend TypeScript, design guards and diff check. The authorized
release adds the canonical full suite receipt, build, process verification,
exact-source public CI and production smoke acceptance.
Live model adherence remains unverified without an authorized paid run.

Graph-reviewed: unavailable — neither this worktree nor checked sibling worktrees
have a graph. Used current project-index ownership and exact source paths.
