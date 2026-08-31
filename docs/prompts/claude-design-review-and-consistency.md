Status: executed and closed. The session this brief opened has run, the platform card shipped, and the Codex goal run it warns about finished and merged into `main`. Kept as the record of what was asked; the parallel-run section below describes a state that no longer exists, so do not follow its instructions.

Target: Claude Code CLI, fresh context window, in `/home/me/code/content-factory-next`, working interactively with the owner.
Audience: Manual start by the owner. A Codex goal run is already working in the same repository; read the parallel-run section before touching anything.

Goal: The design session for the platform element card has come back. Judge what it produced, say plainly whether it is ready or what it still owes, and then — the larger half of this — audit the whole interface for consistency with what was planned, not only the surface this pass touched. Implementation follows the owner's go-ahead, not this document.

Input: The owner pastes this document together with the design session's own output — expect a conversation transcript rather than a packaged deliverable, possibly carrying comps, code, or links to rendered artifacts. Read it as evidence, not as a report: separate what was actually decided from what was merely discussed, and say which of the two a given claim is. A transcript that shows an intention which never became a decision is a gap, and it is the kind that survives into implementation if nobody names it.

The brief that produced it is `docs/prompts/design-platform-element-card.md` — read that first, because it states what was asked, and therefore what a gap in the answer means. Its two appendices carry the mark's size table and the thirty-five platforms in eight families.

If the session produced artifacts worth keeping — comps, a palette, a written rationale — they belong beside the existing ones in `docs/design/desert-lab/`, recorded as what the design pass decided, with the date. Do that only for what the owner accepts, not for everything the transcript contains.

Context: Content Factory is an AGPL-3.0 fork of Postiz, deployed and serving real data. `AGENTS.md` is the authoritative repository contract and `CLAUDE.md` its compact entrypoint; read both before changing code. `.codex/handoff.md` holds current state, `.codex/project-index.md` navigation. Runtime is Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` with the committed lockfile — never npm, never yarn. Beads is the only durable tracker. The design system is dark-first: canvas `#14150F`, accent `#7FB03A`, signature ochre `#C8922A`, with a fully-supported light theme on sand `#EFE9DB`. The sections below carry the rest.

## A Codex run is working in this repository right now

This is the constraint that shapes everything else. A Codex goal run is executing Beads epic `content-factory-next-aay` — seven tasks, seven branches off `main`, one commit each. It was told never to push, never to merge, never to deploy. Its brief is `docs/prompts/codex-remaining-tasks.md`.

**It is running in the primary checkout, `/home/me/code/content-factory-next`, with uncommitted work in the tree.** That was observed on 2026-08-17: branch `work/schema-drift-guard` checked out, two new untracked files, and `docs/operations/production-deploy.md` modified mid-task. So this is not a branch-level collision to be careful about — it is the same working directory, and two agents editing it at once will corrupt each other's work.

**Therefore your first action is to give yourself an isolated tree:**

```bash
cd /home/me/code/content-factory-next
git worktree add /tmp/cf-design work/design-platform-card main
cd /tmp/cf-design
ln -s /home/me/code/content-factory-next/node_modules node_modules   # if the tooling needs it
```

Work only there. Do not edit, stage, stash, clean or switch branches in the primary checkout — its dirty state belongs to the other run. Read from it freely.

Verify before you start, and say what you found: `git -C /home/me/code/content-factory-next status --short` and `git -C /home/me/code/content-factory-next branch -vv`. If the tree is clean and no `work/*` branch is checked out, the run has finished and the isolation is cheap insurance rather than a necessity — keep it anyway.

Three of its tasks touch the frontend and can collide with design work even across worktrees, because they will eventually merge into the same `main`:

- `content-factory-next-rmp` adds a profile area listing linked sign-in methods.
- `content-factory-next-omx` adds an admin view of product events.
- `content-factory-next-ry5.2` adds a newsletter subscription flow.

- Before editing a shared primitive — anything in `libraries/react-shared-libraries/src/form` or `apps/frontend/src/components/ui` — check whether a Codex branch already changed it: `git branch --list 'work/*'` then `git diff main..<branch> -- <path>`. If it did, say so and propose the order rather than editing over it. A shared primitive changed by two branches is a merge conflict somebody resolves badly at midnight.
- **Close nothing in Beads while that run is active.** This project has a recorded failure: closures roll back when several agents touch the tracker, and `bd close` reports success before the rollback. Keep closing reasons in a draft, close at the end, then verify name by name with `bd show` and `bd dolt push`.
- Do not run anything against the server or the production database. The product is deployed at `https://factory.aidevteam.ru` and serving real data.

## Read before judging anything

In this order:

- `docs/prompts/design-platform-element-card.md` — the brief that was answered.
- `DESIGN.md` — the canonical values. This is the arbiter; comps do not override it.
- `docs/design/desert-lab/mark.md` — the card the platform card descends from, including the shedding rule.
- `docs/design/component-authoring-rules.md` — what an author of a component must satisfy. This is the contract implementation will be held to.
- `docs/design/content-factory-interface-specification.md` and ADR-0008 — what was planned, which is what the audit measures against.
- `bd show content-factory-next-0cy` — the task, its acceptance and its notes. `content-factory-next-a4p` is closed and carries the reasoning for why platform logos are not redrawn; do not reopen that argument.

## Facts you do not need to re-derive

Measured in this tree on 2026-08-17, at commit `53fc73c6`:

- Nine typography tokens exist as classes: `cf-heading-xl`, `cf-heading-lg`, `cf-heading-md`, `cf-body-lg`, `cf-body-md`, `cf-body-sm`, `cf-label-md`, `cf-label-sm`, `cf-caption`. `label-sm` and `caption` are monospace; the rest are not.
- Guards in place: `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs` (49 pairs), `tests/foundation.test.cjs`, `tests/raw-control.guard.test.cjs`, `tests/layout-primitives.test.cjs`, `tests/shared-form-control.contract.test.cjs`, `tests/choice-control.contract.test.cjs`, `tests/channel.mark.test.cjs`, `tests/desert-lab-screen-review.test.cjs` (23 screens).
- Two shrink-only ledgers, which fail on both `added` and `stale`: `tests/design-geometry-allowlist.json` at 1242, and `tests/raw-control-allowlist.json` at 22 — 18 under `apps/frontend/src` and 4 under `libraries/react-shared-libraries/src`.
- The four screens the card is for: `apps/frontend/src/components/launches/helpers/pick.platform.component.tsx`, `apps/frontend/src/components/new-launch/picks.socials.component.tsx`, `apps/frontend/src/components/agents/agent.tsx`, `apps/frontend/src/components/launches/launches.component.tsx`.
- The avatar badge today: `general.preview.component.tsx:78` uses `min-w-[20px] min-h-[20px]`, and `plugs.tsx:210` passes `width={18.41}` — an inherited number nobody designed. The brief declared the badge size open.
- Full suite at that commit: 70 suites, 590 tests, green on Node `22.23.2`.

## What to do, in order

**1. Judge the comps against the brief.** Not against taste. For each of the five deliverables the brief asked for, say: delivered, partial, or missing. The brief made three things load-bearing, so check them by name:

- The platform logo is untouched — not recoloured, not redrawn, not tinted to the family colour, and it sits in the symbol position.
- The shedding rule is inherited: what drops at which size, and whether the result is one object across sizes or two unrelated ones wearing the same name.
- The three near-duplicate pairs — `instagram` / `instagram-standalone`, `mastodon` / `mastodon-custom`, `linkedin` / `linkedin-page` — are distinguishable at picker size by something in the frame. This was called the hardest case; if the comps skipped it, that is a gap, not a detail.

Also check what the brief demanded of every state: default, hover, focus-visible, selected, selected+hover, disabled, zero channels versus several — in both themes. And that selection is distinguishable without colour.

**2. Check the numbers, do not trust the labels.** If the comps state contrast figures, verify them against `DESIGN.md` values rather than accepting the claim: 4.5:1 for text, 3:1 for a selection marker, in both themes. Eight family colours on two canvases is sixteen checks; the brief warned that eight distinct colours may not all clear the threshold and asked for a proposed merge if they do not. If the comps introduced a colour role that does not exist in `DESIGN.md`, that is a finding, not an implementation detail.

**3. Then the wider audit, which is the point of this session.** The owner asked for the consistency of the whole design, not this pass. Measure the shipped interface against what was planned:

- Where does the product still not use the nine tokens — off-ramp type sizes, hand-typed weights, letter-spacing that no token declares?
- Where does geometry sit outside the 4px rhythm without being in the ledger, and where does the ledger excuse something that is gone?
- Which screens of the interface specification were never migrated, and which were migrated in a way that drifted since?
- Where do two components make the same decision in two places — a repeated header band, a control height, a spacing step retyped per file? The repository rule is that the second hand-rolled copy is a duplicate to extract, not a pattern to continue.
- Does the light theme actually hold, or has it become the afterthought the ADR says it must not be?

Report this as an ordered list of findings, worst first, each with the file and line, what it violates, and what it would cost to fix. Do not fix them inline while auditing — the owner decides the scope.

**4. Say what is missing before implementation can start.** If the comps leave a decision open that code cannot invent — a family colour that fails contrast, a badge size that was never chosen, a state that was not drawn — name it and ask. One round of questions, batched, not a stream.

**5. Implement only after the owner says go.** Then: the card as a shared component, not a copy per screen; `cf-*` tokens only, no hex literals in JSX; full state coverage; both themes; the ledgers shrink or stay, never grow. Run the focused guards for the surface plus `pnpm test`, `node scripts/branding/brand-scan.cjs` and `bash scripts/orchestration/run_process_verification.sh`.

## Rules that are not yours to relax

- Platform logos are third-party trademarks and are not redrawn, recoloured or restyled. Our style arrives through the frame. `content-factory-next-a4p` settled this.
- `cf-*` semantic tokens only in JSX. No hex literals. Monospace for `label-sm` and `caption`.
- Both themes are supported; light is not an afterthought.
- The two ledgers are shrink-only and fail on `stale` as well as `added`. Do not add a line to buy silence.
- Reuse before adding: extend the component that already does the job; write a new one only when reuse would damage it, and say which.
- Preserve compatibility-sensitive identifiers and AGPL attribution.
- No secret value reaches chat, a document, a commit or a command argument.

## Output

- Lead with the verdict on the comps in plain language: ready, ready with named gaps, or not ready and why.
- Then the deliverable-by-deliverable table.
- Then the consistency audit as an ordered list of findings.
- Then the batched questions, if any.
- Evidence last: what you read, what you measured, what you could not check and why.

## Stop

- Stop after the verdict and the audit. Do not start implementing until the owner says go.
- Stop and ask when a design decision is genuinely the owner's — a colour that fails, a size that was never chosen, a behaviour the comps left ambiguous.
- Stop and report rather than editing a file a Codex branch is already changing.
- Stop and report rather than working around a failing guard.
