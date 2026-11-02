# Telegram editorial quality and approved generation settings

Owner task: `content-factory-next-ncj4`.
Baseline: private `origin/main` 271a94009; worktree `codex/telegram-editorial-quality-20261102`.

## Outcome and accepted decisions

Produce readable Telegram posts from ordinary requests. Preserve source dates and actual product availability through research, intake and writing. Check whether the result explains practical value for its audience. Allow the agent to recommend generation-setting changes, with an explicit editable proposal showing current value, proposed value and reason before applying it. Accepted changes default to the current post; saving channel defaults is a separate choice (owner confirmed 2 November).

Current incident showed: paragraph separators collapsed during Telegram HTML conversion; no structural emphasis; an official release/availability source was downgraded in intake; model-selected automatic length bypassed channel settings without a visible decision; the advisory review prioritized emoji count over useful reader action.

## Design and scope

- Formatting: shared structured text/HTML rendering for preview and publishing. Retain ordinary Telegram messaging for its existing contract; route supported structural headings/lists through Telegram Bot API rich messages. Validate output and never silently retry a possibly successful publication. Ordinary paragraphs keep blank separation. Compatibility for existing posts and media is required.
- Evidence: carry publication metadata separately from explicit event and availability passages. A dated primary announcement saying "today" may establish that announcement event; a crawl/publication date by itself may not. Preserve confirmed availability and per-claim uncertainty even when overall research coverage is partial.
- Editorial settings: use the existing native suspension/resume and shared controls, no parallel approval engine. Proposal includes changed fields, old/new values, public reason, current-post scope and explicit channel-save option. Reject/change/accept and cold resume must retain ownership and original defaults. No model-authored approval tokens. Defaults apply when there is no approved override.
- Quality: reuse the existing advisory review, without an extra paid model call or automatic rewrite loop. Assess audience-relevant benefit and actionable next steps when appropriate to the requested genre; distinguish suggested experiments from verified capabilities and never invent facts/personal experience.
- UI reference: existing agent selection/question cards, channel writing controls, editor and CF design tokens are the build target. Preview uses the same formatting contract as the provider.

## Ownership and acceptance

1. Telegram formatting stream: provider/shared rendering and preview integration plus exact payload/formatting regressions. Dedicated worker; no settings or intake edits.
2. Evidence/value stream: intake source envelopes, writing and advisory review plus regressions. Dedicated worker; no channel-directives/settings/provider edits.
3. Root: native proposal/settings persistence and UI, shared integration, docs and final acceptance. A read-only mapper identifies reusable approval contracts first.

Final checks: affected Jest/Node suites for provider, editor, intake, coverage and native proposal transitions; backend/frontend type checks when affected; focused browser demonstration of proposal edit/accept/reject and formatted preview at desktop/mobile; `git diff --check`. Frozen/synthetic source fixtures, no live model generation. Independent correctness review for proposal authority/persistence and publication behavior. Full release suite is outside this local implementation boundary.

No production deployment, actual Telegram sends, paid calls, credential changes or mutation of existing user chats/posts. Keep raw incident evidence private. Existing unrelated worktrees and dirty work remain untouched.
