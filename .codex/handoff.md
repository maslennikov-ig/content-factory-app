# Content Factory Handoff

Current stage id: `content-factory-next-vme`
Last accepted stage id: `content-factory-next-e3y`
Selected Beads goal: `content-factory-next-vme`

`vme` closed 31.08.2026 by the owner, and `cft` with it: the tree is published as
[`content-factory-app`](https://github.com/maslennikov-ig/content-factory-app) —
public, no history. The private repository stays the archive and this working copy
points at it. `vme.21` closed the same day on his word, with no evidence of the
run in the task; the caveat is recorded there.
## Current state

Production runs **`e7fea25cab30`** (30.08.2026); rollback target `0840cc5f2c6c`.
`ac9e978a582a` and thirteen tags of 26.08–28.08 carried personal source texts and
are deleted everywhere — found by weight alone. The release weighs every tag and
refuses without a green suite receipt for `HEAD`. Actions run again on the public
repository, where `full-suite`, `docker-backed-operations` and CodeQL are green
and the first two are required on `main`; the receipt stays the release gate.

Full local acceptance on the tip, 31.08 under Node 22.23.2: **224 Jest suites /
3076 tests**, `node --test` 93 pass 0 fail, python 29 OK, brand scan 0 unexplained,
docs 111 files, process verification and `git diff --check` clean. `tsc --noEmit`
still shows five pre-existing errors in four untouched files.

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
points.** The same eight give 77,8 / 82,5 / 85,2 by the stand's definitions and
74,5 / 77,0 / 85,7 by the shipped code — rounding to one decimal, sentence
splitting by the language pack, `\r\n` folding. Каждая причина по отдельности —
ничто. Caught only because the stand was made to call the product. Since
30.08.2026 `composition` prints the product number and reports it.

**Post layout is a group the product did not measure at all**, and it is what the
generator fails to reproduce because nothing tells it about breaks: soft breaks
per thousand characters, owner **4,26 against 0,00**, britva **5,09 against
1,25**. `oneSentenceBlockShare` is the strongest single measurement of thirteen.

**Three results contradicted the expectation.** `sentenceSpread` was right to
remove but not for its stated reason — alone it is second of thirteen, in the set
it is redundant and makes all three worse. `capsWordShare`, `exclamPer1k`,
`questionShare` give exactly 50,0 % everywhere. And selecting by these numbers
does not transfer: greedy selection on two corpora collapses to 54,1 / 75,5 /
50,0 on the third. Details and the four answers per measurement: spec §5.1–5.4.

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

Recency had shipped on 26.08, but only for quotes; numbers went on being counted
over the whole corpus because thirty posts make a noisy corridor. That split ran
along the wrong line. The right one is the same this wave drew for the verdict:
**describing against judging**. Scales, corridors, lexicon, punctuation, habits
and layout answer «how does he write now» and take the recent window; the print
answers «is this the same person» and takes the whole training corpus.

His real corpus, 153 posts, window 40, the newest 26 % of the channel: emoji
6 → **3** per thousand characters, links 33 % → **53 %** of posts, own measured
figures 48 % → **60 %**, clerical nouns 10 % → **5,6 %**, soft breaks 4 → **2**.
Half the emoji and half the clerical prose is not a refinement — it is a
different manner, and the old description told him who he had been.

Verified the rule fires at all: 1301 of 1396 samples in the database carry a
numeric message id, and **every** sample in the owner's space does. A trap worth
keeping: the stand's corpus cache carries no `externalRef`, so measuring recency
from the cache reports «the window did not narrow» on all three corpora — a
property of the cache, not of the product.

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

- `saas.6` — provider, data region, and legal model.
- `or3.9` — pricing, trial, and card requirement.
- `sb1` — owner debt after rollout, incl. the legal review of `privacy.*.md`.
- `3aw` and `c6k.16` — owner choices; `cxd` needs the owner's private GPG key.
- `2ua` — Tavily key and paid-call authority are missing.
- `71m.7` — needs a connected Google channel.
- Parent epics `71m`, `c6k`, `ry5`, `saas` stay open where their children do.

`cft` (the move to a public repository) and `9gd` need fresh owner authority;
`7ph` proves the tree is ready and stops there. `vme.21` still needs the owner's
own run on production. **`2la` is decided 31.08.2026**: 48px against a published
100px and no link, accepted as risk, reviewed for YouTube alone of 35 marks.

## Durable entrypoints

- Contract: `brand-voice/voice-wiring.contract.ts`. Judging set and its rule:
  `brand-voice/voice-composite.ts`. Layout: `brand-voice/post-layout.ts`.
- Stand: `scripts/evidence/voice-eval.cjs` — `composition` gives `pl1.7`'s
  numbers, `recognise` builds the owner's answer material, both free and offline.
  Norm: `scripts/evidence/build-voice-norm.cjs`.
- Spec §5.1–5.4 holds the composition, the four answers per measurement and the
  removal reasons with numbers. Evidence: `.codex/stages/content-factory-next-pl1/`.

## Next recommended

Next stage id: `content-factory-next-vme`. Recommended action: **nothing is
queued** — the programme is closed and the move is done. What stays open is owner
decisions (`saas.6`, `or3.9`, `3aw`, `c6k.16`, `rry`) and work needing access
nobody here has (`2ua`, `cxd`). Below is what `pl1` left unproven:

1. **The combination rule needs a number.** «Agreement or silence» is the safest
   shape and it is not free: the epic already silences a third of an author's own
   posts, and a second voice can only add to that. Measure the three candidate
   rules — both-must-agree, either-may-say-FAR, cautious-of-two — on all three
   corpora before wiring any of them.
2. **The composite's working point is taken against a weak adversary.** The
   threshold above is snapped on the `none` background, and 72,9 / 56,3 / 79,2 %
   of `product` generation walks through it. Calibrate it the way the votes were
   calibrated on 28.08.2026 — two negative populations, the stricter point.

Both are named in the closing reasons of `pl1.7` and `pl1.8`, not left implied.

## Starter prompt for next orchestrator

Use $orchestrator-stage. Read this handoff, `.codex/project-index.md` and
`.codex/stages/content-factory-next-pl1/evidence/README.md`. The voice-fidelity
epic `e3y` is closed; do not re-open its two owner decisions. Before any stand or
production check of the voice run `rebuild-voice.cjs --dry-run`: an analysis
older than the ruler carries no print and every verdict reads «сравнить не с
чем», which looks like a defect and is not. **The norm moved on 30.08.2026** —
every profile computed against `ru-2026-08-25` describes itself with the old
numbers until refreshed through the operator door.

Traps: a full Jest run leaves every frontend page answering 500 until
`apps/frontend/.next` is removed *and* the server restarted; `libraries/` changes
need `apps/backend/dist` and `tsconfig.tsbuildinfo` gone; `tsc --noEmit` is a
separate step and already carries five errors that are not yours;
`/home/me/.local/bin/node` shadows nvm. Beads rolls back closures while agents
run — close in one batch, `bd dolt push`, verify by name. **A red check must
actually go red**: mutate what it guards and watch it fall — this wave caught an
agent leaving its own mutation in the tree, where a divide-by-zero guard had
quietly gone. Never `git checkout` a file you have edited to undo a mutation;
keep a copy outside the tree, and verify the restore with `git diff`.

Keep the explicit defers intact. Publication (`cft`), deleting on the shared
host, and every paid call each need fresh owner authority every time.
