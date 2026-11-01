# Content Factory current handoff — 1 November 2026

## Authorized release in progress

Task `content-factory-next-io17`: owner authorized cleanup, closeout, push, merge
and deployment after checking host capacity. Work is isolated in
`/home/me/code/content-factory-next-worktrees/release-chat-quality-20261101`,
branch `codex/release-chat-quality-20261101`. Production is still `1fd383418d7a`
until the recorded switch succeeds. Host has about 24.7 GB free; no pre-release
cleanup is needed. Private PR: https://github.com/maslennikov-ig/content-factory-next/pull/1213.

The candidate includes native Mastra questions/answers and approval recovery,
question batches, source reads, semantic author comments, series grouping/history,
context/avatar/channel selection, responsive UI and source/length guidance.
[Scope and verification boundary](stages/honey-6013/release-closeout-20261101.md).
[Chat/editor guide](../docs/operations/agent-chat-editor-guide.md).

The full release gate is root-owned: all application builds/types, the complete
Jest/Node/Python suite, branding, docs, process checks and clean diff. Failed
intermediate runs are diagnostic only. Exact source receipts gate image push;
public CI, host idle state, schema preflight and preserved-data checks gate switch.
Runtime image must come from the separately copied public tree, never private
Git history. Registry remains `ghcr.io/maslennikov-ig/content-factory-next`.

Evidence and temporary resources are under
`/home/me/.local/state/content-factory-next/release-chat-quality-20261101`.
It contains private rollback material; do not publish it. Native tests use new
owned PG/Redis fixtures, not the live local stand. Before cleanup verify ownership
and consumers; retain unique evidence and the prior accepted production image.

## Local stand and preservation

Live accepted source remains the dirty worktree
`/home/me/code/content-factory-next-worktrees/honey-6013-20261027`.
Local frontend http://localhost:4337/agents and backend 3516 stay running.
Baseline: 37 chats, 10 pieces, 31 derivations, 31 posts; all original histories,
drafts and foreign edits must survive. The ordinary checkout and existing public
clone also have unrelated edits; do not reset, switch or clean those trees.
No local chat, avatar, channel or test data is copied to production.

Owner-selected primary/advanced model is Terra 6.1, Luna for classification.
Production has an old saved Luna instance override. After a healthy switch,
update that profile through InstanceAiDefaultsService using the authorized owner
identity; keep encrypted keys, workspace overrides and spending limits unchanged.
This release performs no paid model/search call. Prior paid local QA is separate
from release verification; provider quota prevented one final quality-review turn
after the draft had already been saved, so do not claim full paid end-to-end proof.

## Explicit defers

`eqh5`: broader editorial and real-provider/owner qualification.
`uhkz`: legacy body behavior. `xyka`: local preview shutdown hang.
Video `.7` and epic retain real account/tool-schema/quote/billing/output-quality
gates. Other owner defers for Store32, finance/retention, legal/pricing, external
ChatGPT, offsite backup and reference population remain unchanged.
[Full prior handoff](stages/honey-6013/handoff-before-release-20261101.md).
No global privacy, retention or host-loss recovery acceptance is implied.

## Next recommended

Accepted stage id: content-factory-next-j9p5-implementation-20261018
The legacy process contract still names that accepted stage; its evidence stays.
Current release has its own task and root-owned nine-command acceptance record.
Next stage id: honey-6013-release-20261101
Recommended action: finish the authorized release, verify current CI and actual
runtime, run canonical own-only retention, preserve local state, then close io17
with evidence. Do not repeat old releases or start deferred provider work.

## Starter prompt for next orchestrator

Read current Linear/Beads, AGENTS.md and this handoff. Linear is canonical;
local bd uses the protected central tunnel. Never reinitialize task databases.
Use $orchestrator-stage when coordination materially helps. Resume from the
release evidence directory and current owner request, reusing valid checks.
