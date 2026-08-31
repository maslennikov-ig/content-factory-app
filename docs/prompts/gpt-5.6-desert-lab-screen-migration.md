Target: ChatGPT (GPT-5.6) with write access to `/home/me/code/content-factory-next`, on a branch off `main`.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Put the desert-lab primitives to work. Ten of them have no consumer at all, because the epic that built them could not touch the screens that would use them. Migrate the screens, wire `ChannelMark`, and move the calendar's post preview into a modal.

Success criteria:
- Every `ui/*` primitive has at least one consumer, or a recorded reason why it does not.
- `ChannelMark` is used for channel lists and provider marks without displacing a real account picture where one exists; it is a fallback and a provider mark, not an avatar replacement.
- The calendar preview icon opens a modal with the same content as `/p/[id]`, with a working copy-public-link button inside it; `/p/[id]` still opens directly and stays public; the post markup is extracted into a shared component rather than duplicated; no iframe; Escape and outside-click close it and focus returns to the button.
- Each screen is its own commit, so a single screen can be reverted on its own.
- `pnpm run build`, `pnpm test` and `node scripts/branding/brand-scan.cjs` are green, reported verbatim.

Context:
- Read `AGENTS.md`, then `docs/design/component-authoring-rules.md` before the first interface edit, then `docs/prompts/desert-lab-screen-migration-spec.md`. That specification was written 2026-08-14 against commit `1e1e6d74`, carries the measured consumer counts, and is authoritative wherever this prompt is shorter.
- The primitives are in `apps/frontend/src/components/ui/`: `layers.tsx` (Dialog, Popover, MenuItem, Toast), `surface.tsx` (Panel, Status, PageHeader, EmptyState, ErrorState, RestrictedState, Skeleton, SkeletonRows), `table.tsx`, `field.tsx` (Field, Input, Textarea, Select, Toggle), `button.tsx`, `brand/channel-mark.tsx`. Most application points are under `components/launches/**`, `new-launch/**` and `agents/**`.
- `Button` already has 66 consumers, `Status` three, `EmptyState` two. The work is the rest.
- `calendar.tsx:1016` currently calls `window.open('/p/' + post.id + '?share=true', '_blank')` while the neighbouring statistics button opens `modal.openModal`. Deleting `/p/[id]` is forbidden: it is the public client link, already sent out, and it must keep working. Only the entry point from the calendar changes.
- Three tests fail the build rather than a review: `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs`, `tests/foundation.test.cjs`. Nine typography tokens are available as `cf-*` classes.

Constraints:
- Never change screen behaviour in the same commit as its appearance.
- Do not touch `libraries/nestjs-libraries/src/openai/**` or the AI-provider settings screen: a parallel stream owns them.
- No jsdom harness, no edits to `jest.config.cjs` or `package.json` to make React tests possible. If a check cannot be made behaviourally, record it as a limitation instead of working around it.
- No new dependencies, no new colours, no hex literals in JSX, no `text-white`, no sans typeface on `label-sm` or `caption`.

Output: what changed by screen and file; the consumer table recounted before and after, per primitive; the verbatim result of each verification command; anything left unmigrated with its reason; assumptions listed as assumptions.

Stop: Stop when the branch builds, tests pass and the report is written. Do not merge, push to `main` or deploy. If a screen cannot be migrated without changing its behaviour, leave it, and say which one and why.
