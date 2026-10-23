# Target:
Codex, a new implementation chat for Content Factory. Keep the selected model/effort; communicate with the owner in Russian.

# Audience:
The implementation agent working in an isolated branch/worktree.

# Goal:
Implement video epic content-factory-next-zlq6 / HONEY-5940 through local engineering acceptance. Research .1 is complete; continue .2-.7 using the existing tasks. Start implementation, not another planning/research round.

# Context:
Source checkout: /home/me/code/content-factory-next
Read its AGENTS.md, .codex/handoff.md and .codex/project-index.md, then:
- docs/superpowers/plans/2026-10-22-video-generation.md (revision 3)
- docs/research/video-generation-reconciliation-2026-10-22.md

Follow the accepted plan: source piece -> editable grounded prompt/script -> external API -> durable status -> owned video preview/download.
Higgsfield: generative clips, initially Wan 3.0 and Kling 3.0 Standard/Pro.
HeyGen: presenter speaking our script through POST /v3/videos.
Runway is reserve. Video Agent/Cinema Studio/provider editing are optional, outside the required first release. Output language is user-selected; Russian is one language.

# Constraints:
Before edits, ensure an isolated worktree on codex/video-v1-api from current local main. Reuse a suitable isolated workspace if already provided; otherwise use native worktree tooling or the repository's git-worktree procedure. Preferred fallback location: /home/me/code/content-factory-next-worktrees/video-v1-api. Verify ownership before reusing an existing path/branch; do not switch, stash or reset the shared checkout.

Planning documents may still be untracked in the source checkout and will not appear in a new worktree. Copy only these task-owned files when absent, preserving source files and any differing destination:
- docs/superpowers/plans/2026-10-22-video-generation.md
- docs/research/video-generation-reconciliation-2026-10-22.md
- docs/research/video-generation-2026-10-22.md
- docs/prompts/deep-research-video-providers.md
- docs/prompts/deep-research-video-storytelling.md
- docs/prompts/video-v1-implementation-start.md
Confirm revision 3 and record the branch/base. Read the source handoff for current context; do not overwrite the worktree's entire handoff/index with another checkout's changes.

Reuse existing UI/chat services, tenant ownership, encrypted provider settings, admission, receipts and media storage. No local montage/timeline/renderer/shot DAG/TTS chain or new wallet. Preserve legacy video routes and used Temporal contracts.
Follow AGENTS for tracking and current API evidence. Retain task IDs/dependencies and use the managed Linear bridge through bd.

Local implementation, isolated development databases, focused verification and scoped commits are in scope. Push, merge into main, deployment, paid model/video calls, credential retrieval/wiring and real publishing require separate current authority. Other chats' permissions do not transfer.

# Success criteria:
Complete the engineering scope of .2-.6 and independently executable .7 checks. Both video modes work through actual UI/chat entry points, services, persistence and media download; stub only external paid boundaries. Verify locale/fact preservation, unsupported settings, tenant/payer isolation, one logical submission, restart/reconnect, ambiguous paid outcomes and failed-download recovery.
First establish a thin fixture-based end-to-end path, then both provider adapters. Continue beyond the first demo. Use minimum relevant checks and representative browser flows; broad suites only when repository policy requires them.
Mocks do not establish provider output quality, spoken-language quality, real costs or improved prompts. The proposed 20-generation pilot is a bounded future test, not spend authorization. Do not close .7 or the epic while required provider evidence is absent.

# Output:
Deliver implemented behavior, branch/worktree/commits, exact relevant verification results, updated task/handoff state, and remaining real-provider gates. Prepare concrete configurations and a bounded cost proposal before asking for paid validation. Keep reviewable source and evidence in the implementation worktree.

# Stop:
Finish all independently executable authorized work. Ask only for material missing owner facts or genuinely required authority; continue unrelated in-scope work meanwhile. Stop at a real ownership conflict or external-action boundary, preserve progress, and identify the exact blocker. Do not stop merely after a plan, scaffold or fixture demo.
