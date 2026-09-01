# Content Factory Handoff

Current stage id: `content-factory-next-vme`
Last accepted stage id: `content-factory-next-e3y`
Selected Beads goal: `content-factory-next-vme`

`vme` closed 31.08.2026 by the owner, and `cft` with it: the tree is published as
[`content-factory-app`](https://github.com/maslennikov-ig/content-factory-app) —
public, no history; the private repository stays the archive and this working copy
points at it. `vme.21` closed the same day on the owner's word, no run evidence.
## Current state

Production runs **`a74aaa76f99b`** (01.09.2026, source commit `4c3cff0b8648`);
rollback target `e7fea25cab30`. The tag names a **public** commit: since 31.08
the image is built from the published tree and the receipt is tied to it by a
`Source-Commit` trailer. The release weighs every tag and refuses without a green
receipt; all four Actions jobs are green there, two required on `main`. Retention
ran the same hour on the owner's separate word: `0840cc5f2c6c` deleted by name,
40 images to 39, nothing of anyone else's touched, 23 GB free.
`CONTENT_FACTORY_RELEASE` had drifted two releases behind — the error collector
was blaming the wrong code — and now matches. The fixed `postgres-backup.sh`
(`ec6885a6`) is delivered; it never fired there, the wrapper pins no moment.

Full local acceptance on the tip, 01.09 under Node 22.23.2: **227 Jest suites /
3118 tests**, `node --test` 93 pass 0 fail, python 29 OK, brand scan 0 unexplained,
docs 111 files, process verification and `git diff --check` clean. `tsc --noEmit`
still shows five old errors. `test:time-travel` is green at +400 and +1100 days.

### Wave eight — `pl1.7`, and the answer is not the one the task expected

**The composition was half the answer, and not the binding half.** The composite
scored a text by one-class surprise under the author's own marginals, and such a
quantity is maximal **at the mode** — while a generator handed the author's habits
sits at that mode more evenly than the living author (a link in 15,6 % of the
owner's held-out posts against 0 % of generations; the mode goes to generation
100 % of the time against his 84,4 %, on all six habits and all three corpora).
Consequence, independent of which measurements are chosen: **while the rule is
one-class, any composition described to the model loses to it**. This also
explains finding №3 of the epic in retrospect.

Neither half works alone. AUC «author's held-out post against generation under
his own voice», crop 800:

| composition | rule | owner | avetov | britva | worst |
| --- | --- | --- | --- | --- | --- |
| current (5) | surprise | 43,2 % | 47,0 % | 65,1 % | 43,2 % |
| current (5) | likelihood ratio | 54,5 % | 71,0 % | 81,3 % | 54,5 % |
| new (8) | surprise | 45,4 % | 46,5 % | 50,5 % | 45,4 % |
| **new (8), product code** | **likelihood ratio** | **74,5 %** | **77,0 %** | **85,7 %** | **74,5 %** |

Shipped on 28.08.2026 — 40,3 / 30,8 / 42,8 %. `pl1.7`'s acceptance — «no worse
on any corpus, better on at least one» — is met on all three, fourfold. **The
epic's 80 % goal is taken on one corpus of three, not two**, and that is the
number to quote.

**The stand was measuring with its own arithmetic, and it cost up to 5,5
points** — 77,8 / 82,5 / 85,2 by its definitions against 74,5 / 77,0 / 85,7 by
the shipped code (rounding, sentence splitting, `\r\n` folding; each cause alone
is nothing). Since 30.08.2026 `composition` calls the product and prints it.

**Post layout is a group the product did not measure at all**, and it is what the
generator fails to reproduce because nothing tells it about breaks: soft breaks
per thousand characters, owner **4,26 against 0,00**, britva **5,09 against
1,25**. `oneSentenceBlockShare` is the strongest single measurement of thirteen.

**Three results contradicted the expectation.** `sentenceSpread` was right to
remove, but for redundancy, not its stated reason; `capsWordShare`, `exclamPer1k`
and `questionShare` give exactly 50,0 % everywhere; selecting by these numbers
does not transfer — greedy on two corpora collapses to 54,1 / 75,5 / 50,0 on the
third. Four answers per measurement: spec §5.1–5.4.

**Judging and describing are different sets** — a measurement handed to the model
as an instruction stops discriminating. `COMPOSITE_JUDGING_METRICS` is pinned as
a list, so a new descriptive measurement cannot move the verdict silently.

**The norm now knows what judges**: rebuilt from 280 no-voice texts (was 48),
fourteen metrics (was nine), version `voice-norm/ru-2026-08-30`. **It changes
every number a person has already read** — post length median 1836,5 → 1999. A
profile stores the version it was computed against.

### Wave nine — the owner read his own description, and it aged him

He answered `pl1.6` on 30.08.2026: the description is him, and he picked his own
posts out of ten. With the «да» came a remark worth more than it: **the
description was drawn from posts he has moved on from**.

Recency had shipped on 26.08 for quotes only, and that split ran along the wrong
line. The right one is this wave's: **describing against judging**. Scales,
corridors, lexicon, punctuation, habits and layout answer «how does he write now»
and take the recent window; the print takes the whole training corpus.

His real corpus, 153 posts, window 40, the newest 26 % of the channel: emoji
6 → **3** per thousand characters, links 33 % → **53 %** of posts, own measured
figures 48 % → **60 %**, clerical nouns 10 % → **5,6 %**, soft breaks 4 → **2**.
Half the emoji and half the clerical prose is a different manner, not a refinement.

Verified the rule fires at all: 1301 of 1396 samples in the database carry a
numeric message id, and **every** sample in the owner's space does. A trap: the
stand's corpus cache has no `externalRef`, so measuring recency from the cache
reports «the window did not narrow» — a property of the cache, not the product.

### What is built and what is not

Built, committed, tested: `post-layout.ts` wired through nine places (the new
field enters the validator's known-key list **together with its own check**);
`voice-composite.ts` — the second ruler's core, proven equal to the stand to
1e-12; `composition` and `recognise` stand commands; spec §5.1–5.4 and §3.1.5.2.

**Not built: the verdict still has one voice.** `measureSimilarity` decides by
impostor voting alone. `compositeConfidence` maps the composite score into 0…1 so
the shipped `calibrate` is correct by construction, and nothing calls it yet.

Owner's decision of 30.08.2026: the composite ships as a **second voice**, and
the verdict takes the more cautious of the two. The combination rule itself is
undecided and needs a number, not an argument — see «Next recommended». The same
day the owner called the epic finished: «мы уже оверинжинирим с этой историей,
пора её запускать и закрывать задачи». `pl1` and its three children are closed;
what stayed unproven is named in each closing reason rather than implied.

Measured cost of a second voice, threshold on the `none` background: it costs the
author's own posts on one corpus of three (82,3 % → 77,7 % on `avetov`) and cuts
generation through everywhere, on `avetov` by half. The shipped ruler alone is
95,9 / 79,9 / **61,7**; the composite alone 82,3 / 82,6 / **87,6**; rank fusion is
worse than the composite alone on the worst corpus. Full tables: evidence README,
wave eight.

## Explicit defers

Owner decisions; do not absorb or close them elsewhere (`content-factory-next-`):

- `or3.9` — pricing, trial, and card requirement.
- `3aw` and `c6k.16` — owner choices; `cxd` needs the owner's private GPG key.
- `2ua` needs a Tavily key and paid-call authority; `71m.7` a Google channel.
- Parent epics `71m`, `c6k`, `ry5`, `saas` stay open where their children do.

**The legal pair is shelved, its bans are not.** 01.09.2026 the owner took the
legal questions off the queue for a later pass: `saas.6` (provider, data region,
legal entity, retention, subprocessors) and `rry` (Art. 50 EU AI Act marking) are
closed as **shelved, not decided**, and the lawyer's review of `privacy.*.md`
waits with them. Two bans survive that closure: no production deploy as SaaS and
no public residency/SLA promise; and the product is **not** declared outside the
EU market — that conclusion needs its own ADR, and the marking grace period ends
02.12.2026. Reopen on the legal pass, on an external launch or public promise
about data, or as that date nears undecided.

`cft`, `9gd`, `7ph` and `vme.21` are closed with the move. **`2la` is decided
31.08.2026**: 48px against a published 100px and no link, accepted as risk,
reviewed for YouTube alone of 35 marks.

## Durable entrypoints

- Contract: `brand-voice/voice-wiring.contract.ts`. Judging set and its rule:
  `brand-voice/voice-composite.ts`. Layout: `brand-voice/post-layout.ts`.
- Stand: `scripts/evidence/voice-eval.cjs` — `composition` gives `pl1.7`'s
  numbers, `recognise` the owner's answer material; both free and offline. Norm:
  `scripts/evidence/build-voice-norm.cjs`.
- Spec §5.1–5.4 holds the composition, the four answers per measurement and the
  removal reasons. Evidence: `.codex/stages/content-factory-next-pl1/`.

## Next recommended

Next stage id: `content-factory-next-vme`. Recommended action: **nothing is
queued** — the programme is closed and the move is done. What stays open is owner
decisions (`or3.9`, `3aw`, `c6k.16`) and work needing access nobody here has
(`2ua`, `cxd`); the legal pair `saas.6` and `rry` is shelved on 01.09.2026 with
its bans intact, see «Explicit defers». Below is what `pl1` left unproven:

1. **The combination rule needs a number.** «Agreement or silence» is safest and
   not free: the epic already silences a third of an author's own posts. Measure
   all three rules — both-must-agree, either-may-say-FAR, cautious-of-two — on
   all three corpora before wiring any of them.
2. **The composite's working point is taken against a weak adversary.** Snapped
   on the `none` background, and 72,9 / 56,3 / 79,2 % of `product` generation
   walks through it. Calibrate as the votes were on 28.08.2026 — two negative
   populations, the stricter point. Both are named in the closing reasons of
   `pl1.7` and `pl1.8`, not left implied.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff, `.codex/project-index.md` and
`.codex/stages/content-factory-next-pl1/evidence/README.md`. The voice-fidelity
epic `e3y` is closed; do not re-open its two owner decisions. Before any stand or
production check of the voice run `rebuild-voice.cjs --dry-run`: an analysis
older than the ruler carries no print and every verdict reads «сравнить не с
чем», which looks like a defect and is not. **The norm moved on 30.08.2026** —
a profile computed against `ru-2026-08-25` keeps its old numbers until refreshed.

Traps: a full Jest run leaves every frontend page answering 500 until
`apps/frontend/.next` is removed *and* the server restarted; `libraries/` changes
need `apps/backend/dist` and `tsconfig.tsbuildinfo` gone; `tsc --noEmit` is
separate and already carries five errors that are not yours;
`/home/me/.local/bin/node` shadows nvm. Beads rolls back closures while agents
run — close in one batch, `bd dolt push`, verify by name. **A red check must
actually go red**: mutate what it guards and watch it fall — this wave caught an
agent leaving its own mutation in the tree, where a divide-by-zero guard had
quietly gone. Never `git checkout` a file you have edited to undo a mutation;
keep a copy outside the tree, and verify the restore with `git diff`. Keep the
explicit defers intact: deleting on the shared host and every paid call each need
fresh owner authority every time.
