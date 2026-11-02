# Telegram editorial quality — local acceptance

Task: `content-factory-next-ncj4`. Branch: `codex/telegram-editorial-quality-20261102`.
Base: `271a94009`. Worktree: `/home/me/.codex/worktrees/telegram-editorial-quality/content-factory-next`.

Implemented all four requested areas: structural Telegram formatting/preview,
date and availability evidence transfer, visible-length findings, and practical
benefit review. Settings changes use a typed native human card and server-held
continuation; default scope is the current post/material, with an explicit series
notice. No channel profile mutation follows acceptance. Exact confirmed values
are persisted before any later autopilot/interview/generation step.

## Acceptance evidence

Node 22.23.2 and pnpm 10.6.1, existing dependency tree reused via a worktree-local
symlink. No dependency tree in another checkout was modified.

- Final affected set: `pnpm exec jest --runInBand tests/agent-writing-settings-approval.test.cjs tests/agent-writing-settings.test.cjs tests/agent.channel-directives.test.cjs tests/agent.adaptation-coverage.test.cjs tests/material-asks.test.cjs tests/telegram.editorial-format.test.cjs tests/adaptation-rich-text.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs` — **10 suites / 221 tests passed**.
- Compatibility/integration: `pnpm exec jest --runInBand tests/agent-capabilities.adapters.test.cjs tests/agent-domain-questions-native.test.cjs tests/agent-adaptation-length.test.cjs tests/agent-adaptation-saved-result.test.cjs tests/agent-screen.adapter.test.cjs tests/telegram.editorial-format.test.cjs tests/adaptation-rich-text.test.cjs tests/agent.adaptation-coverage.test.cjs tests/editorial-evidence-value.test.cjs` — **9 suites / 189 tests passed**. The later visible-length helper changes are covered by the final affected set.
- Native recorded scenario: `CF_AGENT_SCENARIO_IDS=piece-writing-settings pnpm exec jest --runInBand tests/agent-scenarios.test.cjs -t 'scenario piece-writing-settings'` — **7 assertions passed**, unrelated scenarios skipped. Uses the actual chat door, native suspension/storage, stubbed model, and history reader. No generation admission before approval; edited values reach the adaptation; saved history reconstructs them.
- `pnpm exec jest --runInBand tests/emoji-ceiling.test.cjs` — **52 tests passed** after changing list wording.
- `pnpm exec tsc --noEmit --incremental false -p apps/backend/tsconfig.json` and the same command for `apps/frontend/tsconfig.json` — **passed**. Earlier missing dependencies were resolved by reusing the up-to-date dependency tree; no install or generated-client mutation.
- Evidence/intake contracts: accepted child stream **5 suites / 131 tests passed**, unchanged since its delivery. See evidence-delivery.md for exact coverage and boundaries.
- `git diff --check` — **passed**.
- Real Chromium, actual components in an isolated local bundle with repository tokens/fonts: 1440/390 px, light/dark, invalid platform range disabled, changed 1900-character maximum actually submitted, accepted state rendered, no horizontal overflow. This is component/browser acceptance, not an authenticated production flow. Screenshots retained outside Git under `/home/me/.local/state/content-factory-next/editorial-quality-20261102/`.

Independent review found and resolved three issues: absent native answer-history
projection, platform-clipped ranges falsely reported as applied, and series scope
labelled as a single post. Native scenario also corrected an incomplete test-world
provider response to match production; no production workaround was introduced.

## Limits and delivery

No deployment, remote push, real Telegram publication, paid model/search/image
call, full release build or full repository suite. Those are separate acceptance
boundaries. Telegram rendering is verified against official API documentation and
stubbed transport; it has not been sent to a real channel. Rich limit remains the
existing product 4096, caption 1024. Arbitrary nested lists are outside the canonical
subset. Advisory findings retain drafts and do not trigger automatic paid repair.

The existing conservative send-limit counter includes block markup; the editor
keeps that threshold and explains the separate visible count in its tooltip.
Editorial range findings exclude supported markup. This preserves the existing
publication limit contract without displaying a contradictory number as its threshold.

- docs-reviewed: updated; behavior, limits and stable index/handoff recorded; documentation-decision: direct Tiptap HardBreak dependency uses the existing locked 3.20.1 implementation to preserve line breaks.
- graph-reviewed: no-change-needed; direct source navigation only.
- Child streams accepted in shared isolated worktree; no child worktrees or branches to remove. Source, branch and private read-only audit evidence retained. Task-created browser/server and disposable visual bundle are stopped/removed after screenshots are retained. Shared local stand, dependency caches and unrelated dirty checkouts preserved.
- GitHub sync: skipped — repository-specific Linear/server bridge owns task synchronization; legacy local GitHub/native Linear commands are not used.
