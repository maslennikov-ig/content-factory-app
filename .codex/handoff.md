# Content Factory current handoff — 1 November 2026

## Delivered release

Task `content-factory-next-io17`: owner authorized cleanup, closeout, push, merge
and deployment after checking host capacity. Work is isolated in
`/home/me/code/content-factory-next-worktrees/release-chat-quality-20261101`,
branch `codex/release-chat-quality-20261101`. Private source `2e7f6c660ae7`
is merged through PR https://github.com/maslennikov-ig/content-factory-next/pull/1213.
Production is `658f835b5f18`; rollback `1fd383418d7a` remains verified.
Capacity was sufficient before pull (24.6 GB free versus 14.8 GB required).
After canonical retention, free space is 24.58 GB (22.89 GiB).

The candidate includes native Mastra questions/answers and approval recovery,
question batches, source reads, semantic author comments, series grouping/history,
context/avatar/channel selection, responsive UI and source/length guidance.
[Scope and verification boundary](stages/honey-6013/release-closeout-20261101.md).
[Chat/editor guide](../docs/operations/agent-chat-editor-guide.md).

All nine root-owned release checks passed: application builds/types, the complete
Jest/Node/Python suite, branding, docs, process checks and clean diff. Exact-source
[public Build CI](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41306821235)
and [Code Quality](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41306821234)
passed. Runtime, source archive, empty schema diff and preservation passed before
and after retention. Public login passed at 390/1440 px; no production model calls.
Image comes from the separately copied public tree, never private Git history.
Registry remains `ghcr.io/maslennikov-ig/content-factory-next`.

Evidence and temporary resources are under
`/home/me/.local/state/content-factory-next/release-chat-quality-20261101`.
It contains private rollback material; do not publish it. Owned PG/Redis fixtures,
their volumes/network, temporary public clone, build outputs and host schema helpers
have been removed. Accepted source, branch refs, unique evidence and rollback remain.
Shared caches, original worktrees and their live services were preserved.

## CI maintenance delivered — xanf

PR https://github.com/maslennikov-ig/content-factory-next/pull/1216 merged at
`5069e0614622`; public CI source `dfa9ae0c6b83`. Build/CodeQL are green, including
full Jest/Node/Python and +400-day execution. Private PR/main jobs are deliberately
skipped before runner allocation. Main/PR/merge-queue coverage remains public;
ordinary branch pushes no longer duplicate PR runs. Cold component/SDK imports
moved to test setup; the default 5-second behavior deadline remains unchanged.
Production image remains `658f835b5f18`; original chats/drafts/services preserved.
[Proof and limits](stages/ci-xanf-20261101/outcome.md).

## Local stand and preservation

Live accepted source remains the dirty worktree
`/home/me/code/content-factory-next-worktrees/honey-6013-20261027`.
Local frontend http://localhost:4337/agents and backend 3516 stay running.
Verified baseline: 37 chats, 10 pieces, 31 derivations, 31 posts; original histories,
drafts and foreign edits were preserved. The ordinary checkout and existing public
clone also have unrelated edits; do not reset, switch or clean those trees.
No local chat, avatar, channel or test data is copied to production.

Owner-selected primary/advanced model is now Terra 6.1, Luna for classification.
Production instance defaults were updated through InstanceAiDefaultsService using
the authorized owner identity after the healthy switch. Encrypted keys, workspace
overrides and spending limits are unchanged; the previous row is retained privately.
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
Next stage id: owner-selected-follow-up
Recommended action: owner walkthrough of the delivered chat/editor; take a bounded
follow-up only when requested. Do not repeat release gates or start deferred paid work.

## Starter prompt for next orchestrator

Read current Linear/Beads, AGENTS.md and this handoff. Linear is canonical;
local bd uses the protected central tunnel. Never reinitialize task databases.
Use $orchestrator-stage when coordination materially helps. Resume from the
release evidence directory and current owner request, reusing valid checks.
