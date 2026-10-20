## Goal
Implement the content assistant through native Mastra end to end, with the model deciding the work and product services preserving identity, authority, accounting and side-effect safety. Owner19Oct explicitly requests epic preparation and a new-chat implementation handoff first; no product implementation during preparation.

## Scope
Upgrade the latest stable compatible SDK family as part of Task1 (reviewed core1.78.0, memory1.38.0, pg1.31.2, ai-sdk1.11.1 and used server1.78.0; assess CLI/MCP compatibility). Read current tags at implementation entry, pin versions, test old data and public interfaces. No new epic is needed. Gemini Argon is the implementation executor, not the product model.

Native AgentController/Session and isolated chats; durable/background/recovery and native signals; compact evidence with full source reads and composable research/writing tools; native questions/plans/tasks/goals/subagents/skills/tool discovery and explicit agent-only follow-up schedules; configured native model selection and fully accounted auxiliary calls; existing UI wired to native controls; deletion of replaced custom runtime and semantic hardcodes. Cover all relevant native harness facilities, with conditional adjacent features explicitly classified rather than inventing new products.

## Acceptance Criteria
In addition to the original criteria: trusted native scopes/authors, typed queued signals, native live/history/attachment reads, durable run fencing, atomic working memory, beforeApproval and resumed card/history events have actual consumers and A23-A28 proof.
The actual authenticated UI/API and shared capability entrances use the native path. Existing history/pending approvals/sidebar/drafts and domain permissions, quotas, receipts and Temporal contracts survive. All source evidence remains accessible while prompts stay compact; saved research composes into drafts without mandatory repeated intake/search. Reconnect, real process restart, concurrency, late results, approval/content changes and no duplicate writes pass. Native goals/delegation and configured model routing have real product consumers and metered main/classifier/judge/memory/subagent calls. A1-A28 outcome scenarios and final build/full3test halves pass; real model/retrieval quality is evaluated locally before claiming the full epic achieved. No push/image/deploy/production mutation or real social action.

## Plan and Handoff
Design/native capability catalog/replacement map/tasks/risks/acceptance: docs/superpowers/plans/2026-10-19-native-mastra-harness.md.
Checked implementation prompt: .codex/stages/content-factory-next-on0i-native-harness-20261019/upgrade-and-argon/new-chat-prompt.md.
Baseline29d98372f, planning branch codex/on0i-native-harness-plan-20261019 in /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018. Preserve existing sidebar fix and unrelated original checkout changes.

## Boundaries
Local implementation/testing only in the new chat. Use existing authorized configured model/search access with locally available credentials and synthetic test objects; never implicitly copy production secrets or replay the original user objects. Prior owner delegation permits necessary model costs, not a new arbitrary task cap. Keep real-provider quality evidence distinct from offline native probes. Native source availability is not product integration. Linear through Beads owns task state.
