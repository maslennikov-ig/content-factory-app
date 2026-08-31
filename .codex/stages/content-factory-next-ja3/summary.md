# Stage Summary: Telegram content pipeline MVP

## Goal

Complete the Beads epic `content-factory-next-ja3` as one cohesive,
uncommitted Telegram content-pipeline slice, including organization-scoped web
research and observable local acceptance proofs.

## Scope status

All 29 child tasks `ja3.1` through `ja3.29` are closed in Beads with evidence.
No criterion was narrowed or removed. The release closeout passed, the stage is
accepted, and the epic itself is closed in Beads.

## Observable behavior

- A Telegram channel can receive manual and scheduled content, AI-generated
  text and images, and automatic posts from a permanent public source.
- English and Russian are explicit content languages across generator, editor
  copilot, chat agent and AutoPost; a channel persists its default language.
- AutoPost uses provider-specific character limits, includes the original link,
  and can optionally enrich a rewrite with organization-scoped web research.
- Search settings are tenant-owned, reload without a process restart, never
  fall back to another tenant or an environment key, and produce structured
  facts and dated sources. International research starts in English; a local
  subject adds a query in the subject language.
- Research sources persist on a post and are visible in the editor and preview.
- Telegram update handling has one durable consumer for connection commands,
  reactions and linked discussion comments. Subscriber snapshots and local
  production analytics provide the metrics the Bot API can support.

## Live local proofs

- `ja3.2`: editor-generated Russian text and one generated image saved as a
  Telegram draft; no publish.
- `ja3.3`: a real Telegram AutoPost rewrite exceeded the inherited X-sized
  limit while remaining inside Telegram's provider limit.
- `ja3.4` and `ja3.9`: identical requests produced explicit English/Russian
  outputs and the Russian channel default persisted.
- `ja3.5`: a permanent public Telegram source runs hourly through an Atom
  bridge and created a Russian, image-free draft with its original source URL.
- `ja3.6`: seven distinct Russian, image-free drafts appear on 2026-08-17
  through 2026-08-23, one per day, all independently verified as `DRAFT`.
- `ja3.28`: the permanent source edit form visibly shows research disabled;
  focused red-green tests prove enabled, disabled, verbatim and unavailable
  search paths and source persistence.

Browser evidence:

- `output/playwright/ja3-28-autopost-research-toggle.png`
- `output/playwright/ja3-6-russian-week-calendar.png`

## Evidence correction (independent audit, stage `content-factory-next-c6k`)

An independent audit of this stage found that part of the browser evidence did
not show what it was cited for. Recorded here rather than edited away, because
accepted history stays readable.

- `ja3-3-autopost-draft.png` and `ja3-5-permanent-source-draft.png` were
  byte-identical (`md5 6e5774f3f4e09c3d23879740f8a46921`): one file was
  presented as proof for two different criteria. The duplicate was deleted.
- Neither file showed a post. Both were a weekly calendar scrolled to the
  00:00-06:00 band, so no draft card was in frame.
- The durable evidence for `ja3.3` and `ja3.5` is the database check, not the
  screenshot: `ja3.3` created Post `cmsrjdxqv0000c19oase7lnde` and `ja3.5`
  created Post `cmsrlmtj50001c1ixyepxyokh`, both `state=DRAFT`,
  `creationMethod=AUTOPOST`, with the original source URL and `image=[]`.
  Those ids were verified through Prisma and remain checkable.
- The remaining screenshots show the operator's personal email address in the
  sidebar. Deleting the files now would not remove it, because it is already in
  the history of commit `575404c7`; removing it needs a history rewrite, which
  is the owner's decision and is not part of this stage.

## Provider cost and safety

- Organization AI provider: OpenRouter.
- Text model: `openai/gpt-5.6-luna`; image model: `openai/gpt-5-image`.
- The seven-day generator proof used 32 Luna text calls, including one rejected
  long-format result, for USD 0.005495193 against an announced USD 0.02 cap.
- Search was not called because no Tavily key is stored. No live Telegram
  publication, deployment, OAuth connection or real-user message occurred.
- The permanent source remains active by user choice. It creates drafts only;
  research and image generation are off.

## Acceptance boundary

The root release closeout runs exactly:

- `pnpm run build`
- `pnpm test`
- `node scripts/branding/brand-scan.cjs`
- `pnpm run docs:check`
- `scripts/orchestration/run_process_verification.sh`
- `git diff --check`

No commit, push, pull request or deployment is part of acceptance. The fresh
release closeout passed all three workspace builds, 26 Jest suites with 103
tests, four Python tests, brand scan with zero unexplained hits, the 46-file
docs check, process verification and `git diff --check`.

## Documentation and graph

`docs-reviewed: updated - docs/product/telegram-pipeline-mvp.md records optional default-off AutoPost research, cost visibility, safe fallback and source persistence; docs/architecture/data-model.md records AutoPost.researchEnabled.`

`project-index: reviewed-no-change - the existing stable navigation already points to the Telegram pipeline, Prisma boundary and verification commands; no new entrypoint was introduced.`

`graph-reviewed: updated - Graphify 0.9.14 rebuilt the local code graph and ran local no-label clustering: 6542 nodes, 15730 edges, 542 communities and 0 model tokens. Built-from commit e0dd70d9 matches HEAD while the uncommitted stage changes are intentionally present. graphify-out is ignored; excluded runtime/dependency roots are absent; query logging, external semantic extraction and Git hooks remain disabled.`

## Explicit defers and limitations

- No unfinished epic work is deferred.
- Real Tavily calls remain unavailable until a key and paid-call authority are
  supplied; the disabled path and tenant/search contracts are covered by tests.
- The Prisma field was synchronized only to the local review database. No
  production migration or deployment was attempted.
- Work remains intentionally uncommitted for owner review.
