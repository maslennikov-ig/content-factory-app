# Quality wave plan — research, «Усилить ресерчем», topic leads (13.09.2026)

Source: owner session 13.09.2026 on top of `evidence/quality-2026-09-13/FINDINGS.md`
(F1–F14) and the owner's second-pass notes (`evidence/walk-2026-09-13/notes/`).
Tasks: `75xn.17`–`75xn.28` plus the ones added below. Design pick:
https://claude.ai/code/artifact/4daaf7ae-9af7-450b-8751-d2bebe469640 — **Variant 1
«Сделали за вас»** (owner, 13.09).

## Owner decisions (do not re-ask)

1. Engines stay: Exa for supports, Tavily for facts and discovery. The weak part is
   what the product does with the answer, not the search.
2. Product rule, everywhere: **decide for the person wherever possible; reduce
   cognitive load.** Fewer settings, fewer choices, result first, details on
   disclosure. Optional work (research, fact check) is an opt-in action, never a
   setting. Recorded in Beads memory `content-factory-product-rule-decide-for-the-person`;
   this wave writes it into `PRODUCT.md`.
3. Verification only on the person's request (the «Нужен ресерч» checkbox; nothing
   runs by itself). Result must be readable: colour marks for confirmed /
   conflicting with a link each.
4. Labels are decided by code, not by the model: the model retells and quotes, code
   checks the quote is verbatim in the source text and only then labels. One
   structured model call per research on intake (cost accepted).
5. Variant 1: corrections applied into the person's thought with old value struck and
   new value marked; one «Продолжить с правками» button, «Оставить мои числа»
   secondary, «Вернуть моё» per correction; unverifiable claims stay the author's
   words with a dotted mark and a note.
6. Leads: Tavily `news` topic first (the only mode returning `published_date`);
   `general` second query only when news yields < 3 rows; undated rows get a page
   date via constrained fetch (≤ 8 per check); still undated → dropped. Junk: rules
   first (social mirrors, PDF, `score` < 0.5, short text, no shared stem with the
   topic), then one cheap `classify`-role call per check that filters relevance and
   writes the «why yours» sentence about the content; no model key → current
   window sentence. No over-engineering, token-thrifty.
7. Cache TTL 30 minutes for every research task.
8. Deep level reads pages — **free by default**: both engines already return the
   page text inside the search response (Tavily `raw_content`, Exa `contents.text`);
   use it. Local Readability-style read only where the engine gave none. No new
   paid endpoint.
9. Deadline fallback goes to the other keyed engine, never OpenRouter; no second
   engine → honest refusal, model key untouched.
10. In «Ключи системы» mode topic/depth are not configurable anywhere: topic is chosen
    by task, depth `advanced`; superadmin screen shows them as facts. No schema
    change this wave.

## Seams

| # | Seam | Tasks | Owner |
|---|---|---|---|
| A | Evidence = claim in own words + verbatim quote + address + status; `factKey` per row; continue without re-run (first-pass snapshot); per-level caps; encyclopedic reservation; pages read from engine text | .18 .19 .21 .22 + new page-reading task | root |
| B | Text hygiene after research («supplied», «>null», English sentence in a Russian core); deadline fallback not to OpenRouter | .24 | root, after A |
| C | Leads quality: news topic, date required, page-date fetch, junk rules, model relevance + reason sentence, cache TTL, stricter «repeated» rule | .23 (F13, F14, F2) | subagent (backend) |
| D | Included mode: search enabled by presence of system keys; config refusal before admission with a plain phrase; no «Убрать ключ» buttons; topic/depth hidden from workspace | .20 .26 | backend root; screen with E |
| E | Superadmin screen: env value shown as current in the field; model key inside the provider card; monthly operations shown; autosave like the workspace screen | .25 .27 | subagent (frontend) |
| F | Checkbox and progress as design-system components; guard on raw `type="checkbox"` and on `Progress` geometry | .28 | subagent (frontend) |
| G | Same-origin check on `POST /admin/telegram/connect` | .17 | root |

Dependencies: B and D-backend after A (all edit `research()`); C, E, F run in parallel
with A. `run-quality-pass.cjs` is extended after A and C.

## Seam A contract (v3, additive)

- Every fact row carries `factKey`: `evidenceId` for found rows, `sha1(kind|statement)`
  for own/external. `researchSelections` accepts keys; a string that matches no key
  is matched by statement (open tabs from before the deploy, one release).
- `research-ready` gains `snapshotKey` (opaque) and `verdicts[]`; facts gain `factKey`,
  `quote`, `verdict`, `correction`. Event names unchanged: the adapter tolerates
  unknown fields, and an unknown event name would only show as a step.
- Snapshot: Redis under `intake:snapshot:{org}:{actor}:{digest}` for 60 minutes,
  through a DI token (same pattern as `RESEARCH_QUOTA_STORE`; never import
  `redis.service` in the library). Payload: `FilledBrief`, evidence entries,
  extraction, urls, foreignShingles, plan digest. Continue = load + apply selections
  + write core. Missing/expired snapshot or no store → today's behaviour (re-run) with
  key/statement matching.
- Digest call (`review` role, structured output, same untrusted-data framing as
  `adaptation-web-review.ts`): input = author claims (own facts + thesis numbers) and
  the accepted sources with text (standard: excerpt ≤ 1.6k chars; deep: page text ≤
  6k chars for the top 5 sources, excerpts for the rest). Output per author claim:
  `{claimKey, verdict: confirmed|conflicting|unverifiable, quote, sourceUrl,
  correction?, note}`; per source: `{evidenceId, claims: [{statement, quote}]}`.
  Code: quote must be a verbatim substring (whitespace/quotes normalised) of that
  source's text, else the row is `unverified`; `conflicting` additionally needs a
  `correction`. Homepage URLs (path `/` or `/index.*`) are dropped before the call.
  Call failure keeps today's rows (excerpt as statement, `unverified`) — never
  fails the research.
- Caps per level: sources 8 / 20 / 50 (preset), claims after digest 8 / 14 / 20.
  `CONTENT_CONTEXT_MAX_EVIDENCE_V1` stays for the context builder and agent.
- Encyclopedic lane runs concurrently with provider queries; two slots of the source
  cap are reserved for it when the level is explicit.

## Technical premortem: seam A (+ the `research()` edits of B/D)

Verdict: **GO WITH CONDITIONS**
Scope: `intake.service.ts` (`run`, `searchForFacts`, new digest), `contracts.ts`,
`web.research.service.ts` (`research`, `searchOne`, cache, lanes), intake adapter
and screen, `piece-facts.v2.ts`, Redis via DI token, `run-quality-pass.cjs`.
Reversibility: code-only, no schema; rollback = previous image; snapshots expire
in 60 min; cache is in-process.

### Blast radius

`research()` → intake (explicit level), `adaptation-web-review` (facts/research),
`piece.service`, `agent.graph.service`, `autopost.service`, `source-registry`,
`web.research.tool`, `lead-topic.gateway`, `content-source.controller`. Facts/sources
shape unchanged; `pages` is additive. Cache TTL affects all of them (more paid calls
on repeats after 30 min). Fallback change affects every caller on a Tavily deadline.
Intake NDJSON → `intake.adapter.ts` (tolerant of unknown fields and events),
`run-quality-pass.cjs`, `content-intake.*.test.cjs`. Redis shared with quota
counters and the app; new keys namespaced.

### Risk register

| Failure symptom | Evidence | Mechanism / surface | Detection | Mitigation | Disposition |
|---|---|---|---|---|---|
| Continue still loses selections on old tabs | confirmed: client sends statements today | old SPA bundle sends statements after deploy | quality pass i5 (14/14) + unit test with statement selections | key first, statement second, for one release | preflight |
| Snapshot from another workspace/user resumed | plausible | key without org/actor, or digest collision | unit test: different org same input → miss | key = org + actor + digest; payload stores org and is re-checked on load | preflight |
| Continue re-runs anyway (no Redis in tests / dev) | confirmed: store optional | `@Optional()` token absent | log line «no snapshot store» once | fallback path = current behaviour; test both paths | monitor |
| Quote «verbatim» check rejects true quotes (typographic quotes, nbsp, ellipsis) | plausible | normalisation gaps → everything `unverified` | quality pass: confirmed count 0 on i2/i3 | normalise quotes, dashes, whitespace, case; allow ≤ 2 edits per 40 chars? No — keep exact after normalisation, log rejects | preflight |
| Model edits the author's thought beyond numbers | plausible | correction applied by string replace of `original` span | unit: correction applies only when `original` is a substring of the thought; else shown as note | code applies corrections, model only proposes `{original, replacement}` | preflight |
| Digest call spends allowance on every intake with research | confirmed | +1 `text_generation` op | `usageByRole` in quality pass | owner accepted; included limit 50/month is the owner's temporary setting | monitor |
| Deep level: 5 pages × 6k chars blow the prompt or the wall clock | plausible | page text concatenated | timing in stream; token count logged | hard caps per source and total (30k chars); `maxWallClockMs` unchanged | preflight |
| Fallback change breaks callers expecting OpenRouter | confirmed: `web.research.service.test.cjs` lines 523–671 assert OpenRouter fallback | tests red, autopost/agent on Tavily deadline now fail closed | jest | rewrite tests to the new rule; callers already handle `WebSearchFallbackError` | preflight |
| Config refusal before admission changes error type for included mode with no key | plausible | `loadAiConfig` before `executeAiOperation` | content-lead tests, intake gates test | keep `WebSearchNotConfigured`; lead service passes the code through (seam D) | preflight |
| Cache TTL doubles paid calls for periodic checks | plausible | checkInterval < 30 min | usage ledger | intervals are ≥ 60 min by product; TTL 30 min | monitor |
| Encyclopedic reservation starves provider rows on quick level (8 − 2) | plausible | cap 8 with 2 reserved | quality pass: quick sources count | reserve only what the lane actually returns, up to 2; unused slots go back | preflight |
| Executor error: `run()` has interleaved yields; snapshot misses a value used after research (extraction, urls, shingles, inputSources) | confirmed by reading `run()` 520–618 | continue path writes a core without borrowed/foreignShingles | i5 and i6 in quality pass: `borrowed` present | snapshot carries every value listed in the contract; unit test asserts equality of cores between direct and continued runs | preflight |
| Executor error: the same digest applied to `addSearchedFacts` (free lane) | plausible | spend where nobody asked | usage ledger | digest only in the explicit-level lane | preflight |

### Recovery

Trigger: stream errors or wrong verdicts on production. Roll back the image to the
previous release per `docs/operations/production-deploy.md` (no schema); snapshot
keys expire on their own; cache is process memory. Partially written pieces are
ordinary pieces and stay.

### Preflight checklist

- [ ] Unit: continue with keys, with statements, and with an expired snapshot each
      yields the same core as a direct run on the recorded i5 fixture.
- [ ] Unit: quote normalisation table (typographic quotes, nbsp, ellipsis, dash).
- [ ] Unit: correction applies only to an exact `original` span; otherwise a note.
- [ ] Unit: digest failure keeps rows and the stream completes.
- [ ] Jest: `web.research.service.test.cjs` rewritten for the keyed-engine fallback.
- [ ] `tsc --noEmit` zero on all three apps; focused Jest sets green.
- [ ] Quality pass numbers (see below) before the release.

## Quality bar (numbers the pass must print)

- supports: 0 header-cut rows, 0 homepage addresses; every found row has a quote
  found verbatim in its source text;
- i9: three false numbers → `conflicting` with corrections; i2/i3: at least one
  `confirmed`;
- i5: 14 of 14 selections reach the piece; continue ≤ 3 s without a research call;
- sources quick < standard < deep; wikipedia/wikidata in ≥ 1 research;
- leads: dated ≥ 90 %, junk ≤ 10 %, reason sentence names the content;
- fresh workspace in system-keys mode checks a topic first time; a configuration
  refusal is not counted.

## Verification and release

Focused Jest per seam during work; root final acceptance: three-app `tsc`, jest,
design guards, `run_process_verification.sh`, suite receipt in the foreground.
Release per runbook (no schema). Then the live-test page (new artifact) with only
what the owner must see, and the numbers above.
