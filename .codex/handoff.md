# Content Factory Handoff

Current stage id: `content-factory-next-vme`
Last accepted stage id: `content-factory-next-e3y`
Selected Beads goal: `content-factory-next-vme`

`vme` closed 31.08.2026 by the owner, and `cft` with it: the tree is published as
[`content-factory-app`](https://github.com/maslennikov-ig/content-factory-app) —
public, no history; the private repository stays the archive and this working copy
points at it. `vme.21`, `9gd` and `7ph` closed with the move.

## Wave ten — the owner walked the product from the start, and the section did not read

01.09.2026 the owner registered, onboarded and opened «Контент» for real:
thirteen tasks, eleven closed, **twelve commits local and unpushed**
(`7bf12bcc` … `acec40b0`); no PR — neither was authorized.

**The section was dead in production from its first day and nobody noticed.**
`r14b`: `SourceEvidence.organizationId` is the scalar of two relations at once,
so Prisma removes it from a create nested under its snapshot; both write paths
sent it as a column, and no source had been created since 20.08.2026 — manual is
the only kind enabled in production. **The guard is the part worth remembering**:
TypeScript, the only honest defence, was off via `PrismaRepository<any>`, and
typing the transaction clients alone left thirteen `as any` casts — one on a
producer written in this very wave, in the very shape that caused the incident.

**Four agent reports disagreed with the tree, every one caught by checking rather
than reading, two only after their work was committed.** The
email stream mutated `sendEmailWorkflow` in place against an unconditional rule;
v1 is back byte for byte, the language rides a versioned successor, and
`temporal-contract-signature.guard.test.cjs` now pins every signature. But its
one caller stayed on v1, so v2 sat registered and unreachable while **every
product email lost its language** — the footer test stayed green because it never
crosses the signal. The funnel proof, reported as «failing independently of my
changes», failed on `User.language` never reaching the database it builds — the
path a deploy uses. `content-search-evidence` was written on `node:test`, left
out of the second half's list, and **ran nowhere** until `test-runner-boundary`
named it. And `odb8.4`'s archive shipped with nineteen green tests and **mounted
in no screen**. The last two are fixed in `acec40b0`, with guards watched to go
red first. The lesson is narrower than «verify»: a green suite proves the unit,
never the wiring.

**`zudl`'s diagnosis was wrong: there is no missing SPF.** Resend puts SPF and MX
on `send.` *under* the sending subdomain, and `send.smtp.aidevteam.ru` carries
both; `outbound-connections.md` said «on the subdomain `smtp`» without the prefix
and now spells it out. **Nothing to change in DNS.** What is left is the owner's:
register once on production and read back `Authentication-Results` — the run's
letter came from the stand, whose `localhost` link confounds the test. Two things
found on the way and left open, both recorded in Beads: the docs contradict each
other on whether `RESEND_API_KEY` is live in production, and eleven repositories
still carry `PrismaRepository<any>`, so Prisma checks none of their writes.

**The section is now three places plus leads and the archive.** «Откуда факты»
shows and does not edit; the detail carrying the decision is that a copy does not
inherit the original's confirmation — structurally, not as a caption. Adding a
fact moved into the brief, or the gate would be a wall. «Откуда идеи» is built
from nothing: the radar never looked at sources at all. The registry is untouched
— written, tested, off in production, no longer what a person looks at. Open:
«Материалы» (the factory's library) and «Что уже написали» (three layers,
including what predates the product) overlap and the map lists only the second.

Acceptance on the tip, Node 22.23.2: **jest 233 suites / 3207 tests**, `node
--test` 101 pass 0 fail, python 29 OK, `pnpm run build` 0, `git diff --check`
clean, process verification OK, brand scan 0 unexplained; funnel proof 16 PASS,
0 skipped, Docker clean.

**Not verified, and it is the same gap everywhere: no screen was opened in a
browser** — which is exactly how an unmounted archive survived to a commit.
Everything rests on tests and types; 320px was checked by classes. No real letter
sent, no feed connected, no paid call made. The `docs/operations/` schema files
never went through `validate-prisma-migration-sql.cjs`: it needs a live `migrate
diff`, a deploy step and the owner's.

## Current state

Production runs **`a74aaa76f99b`** (01.09.2026, source commit `4c3cff0b8648`);
rollback target `e7fea25cab30`. **Wave ten's commits are not in it** — they are
local and unpushed. The tag names a **public** commit: since 31.08 the image is
built from the published tree, tied by a `Source-Commit` trailer, and the release
refuses without a green receipt. Retention ran 01.09 on the owner's separate
word: `0840cc5f2c6c` deleted by name, 40 images to 39, 23 GB freed.
`CONTENT_FACTORY_RELEASE` had drifted two releases behind — the error collector
blamed the wrong code — and now matches. The fixed `postgres-backup.sh`
(`ec6885a6`) is delivered and never fired there. `test:time-travel` was green at
+400 and +1100 days on 01.09, and has not been re-run over wave ten.

### Waves eight and nine — the voice epic, closed

All of it is in spec §5.1–5.4 and
`.codex/stages/content-factory-next-pl1/evidence/README.md`. Three facts cost too
much to re-derive:

- **While the rule is one-class, any composition described to the model loses to
  it** — one-class surprise is maximal *at the mode*, where a generator given the
  author's habits sits more evenly than the author. New composition plus
  likelihood ratio: **74,5 / 77,0 / 85,7 %**, and **the epic's 80 % goal is taken
  on one corpus of three, not two** — quote that number. Related: a metric handed
  to the model as an instruction stops discriminating, so
  `COMPOSITE_JUDGING_METRICS` is pinned.
- **The norm moved** to `voice-norm/ru-2026-08-30` and **changed every number a
  person has read**; a profile stores the version it was computed against. Trap:
  the stand's corpus cache has no `externalRef`, so recency measured from it
  reports «the window did not narrow» — a cache property, not the product.
- **The verdict still has one voice.** `measureSimilarity` decides by impostor
  voting alone, `compositeConfidence` is called by nothing. By owner decision the
  composite ships as a second voice, verdict taking the more cautious of the two;
  the rule combining them is undecided, and a second voice costs the author's own
  posts on one corpus of three (82,3 → 77,7 % on `avetov`).

## Explicit defers

Owner decisions; do not absorb or close them elsewhere (`content-factory-next-`):
`or3.9` pricing/trial/card; `3aw` and `c6k.16` owner choices; `cxd` needs the
owner's private GPG key; `2ua` a Tavily key and paid-call authority; `71m.7` a
Google channel. Parent epics `71m`, `c6k`, `ry5`, `saas` stay open with them.

**The legal pair is shelved, its bans are not.** `saas.6` (provider, data region,
legal entity, retention, subprocessors) and `rry` (Art. 50 EU AI Act marking) are
closed 01.09.2026 as **shelved, not decided**; the lawyer's review of
`privacy.*.md` waits with them. Two bans survive: no production deploy as SaaS
and no public residency/SLA promise. The product is **not** declared outside the
EU market — that needs its own ADR, and the marking grace period ends 02.12.2026.
Reopen on the legal pass, on an external launch or public promise about data, or
as that date nears undecided. `2la` is decided 31.08.2026: 48px against a
published 100px and no link, accepted as risk, reviewed for YouTube alone of 35.

## Durable entrypoints

- Voice: contract `brand-voice/voice-wiring.contract.ts`, judging set
  `voice-composite.ts`, layout `post-layout.ts`; stand `voice-eval.cjs` and norm
  `build-voice-norm.cjs` under `scripts/evidence/` (free, offline); spec
  §5.1–5.4, evidence `.codex/stages/content-factory-next-pl1/`.
- Content section: `docs/product/content-section-map.md` (map and every decision
  of 01.09.2026); mockups `docs/design/desert-lab/content/`; design orders under
  `docs/prompts/`, the section brief carrying a stale-map warning; deliverability
  `docs/operations/email-deliverability-spf.md`.

## Next recommended

Next stage id: `content-factory-next-vme`. Recommended action: **settle whether
wave ten's commits should be pushed** — none were, no PR opened, neither
authorized. Then the four owner questions below.

**Four questions wait on the owner; none may be answered for him.** Dependent
work is deliberately unbuilt so code does not decide them:

1. **Tag or a field of its own for the editorial stage** (`pdbe`). Recommend a
   field — `Post.state` is delivery, not editorial, and a `DRAFT` post can be
   «в плане» and «на проверке» at once. Stage selection and showing the stage in
   calendar, list and editor all hang on this.
2. **Does an accepted lead become reference material automatically** (`odb8.3`).
   Recommend no; no automation exists in either direction.
3. **Is search textual or semantic, over what** (`odb8.4`). Recommend textual; no
   index exists, but the archive and its filters — the footing either needs — do.
4. **Two bars disagree and one is decoration** (`lh5s`). The brief gate grounds a
   fact on a statement plus ANY link; the unified context demands an accepted
   snapshot, so a brief can be built on search links with nothing provable behind
   it. Levelling them breaks existing briefs, so it stays a question.

Two smaller ones also wait on him: whether «Материалы» and «Что уже написали»
merge, and whether a domain owner may step over `robots.txt` for his own site
(shelved, not answered). Two actions are his alone — the control registration for
`zudl`, and, whenever this deploys, terminating the orphaned `send_email` v1
execution, which waits on a `condition()` with no timeout and will never retire
by itself (no mail is lost; the queue drains at cutover). Two tasks stay open with their remainder in comments: `rrs9` (the way
back to onboarding exists; onboarding still describes only the Postiz loop) and
`4zef` (order written, no letter reformatted). One piece of debt is named and
unqueued: eleven repositories still carry `PrismaRepository<any>`. Older and
unchanged: `or3.9`, `3aw`, `c6k.16` are owner decisions; `2ua` and `cxd` need
access nobody here has; `saas.6` and `rry` are shelved with their bans intact.
What `pl1` left unproven is in the closing reasons of `pl1.7` and `pl1.8` — the
combination rule needs a **number**, and the composite's working point was
snapped against a weak adversary.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff and `.codex/project-index.md`. Settle
first whether wave ten's eight local commits should be pushed. Four owner
questions sit under «Next recommended» — do not answer any for him; the dependent
work is deliberately unbuilt. The voice epic `e3y` is closed; do not re-open its
two owner decisions. Before any voice check run `rebuild-voice.cjs --dry-run`: an
analysis older than the ruler carries no print and every verdict reads «сравнить
не с чем», which looks like a defect and is not.

Traps that cost time this wave: `/home/me/.local/bin/node` shadows nvm — check
`node -v` is 22.23.2 first. A full Jest run leaves every frontend page answering
500 until `apps/frontend/.next` is removed *and* the server restarted;
`libraries/` changes need `apps/backend/dist` and `tsconfig.tsbuildinfo` gone;
`tsc --noEmit` is separate and carries old errors that are not yours. `pnpm test`
is three runs joined by `&&`, so a red first half means the other two never ran.
Beads rolls back closures while agents run: close in one batch, `bd dolt push`,
verify by name with `--status closed`.

**A red check must actually go red, and check it yourself rather than believing
the report.** This wave a guard was typed only where it was easy, leaving the
newest write path outside the compiler; four reports were contradicted by the
tree; and a green suite twice hid unwired work — it proves the unit, never the
wiring. Never `git checkout` a file you have edited to undo a mutation: keep a
copy outside the tree and verify with `git diff`. Deleting on the shared host,
paid calls, DNS, deploys and secrets each need fresh owner authority.