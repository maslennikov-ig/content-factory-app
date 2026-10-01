# Isolated reader search corrections

Owner: `auth_backup_review`; acceptance/integration/release owner: root.
Original base: `5d822447a159f032c9f6527b80a18b7c36827761`.
First implementation commit: `d61e4190ae71f2c53945c09eb02a0ffc86f8838b`.
Branch: `codex/search-relevance-2026-10-01`.
Worktree: `/home/me/code/content-factory-next-worktrees/0qgn-search-relevance-20261001`.
Current exact proof: `evidence/reader-boundary/verification.json`.
The initial `verification.json` and logs describe the historical first commit.

## Delivered behavior

The server-owned `readerResponse === true` opt-in defaults to false and is set
only by `ContentSourceController.searchForEvidence`, together with language.
There is no new DTO/client flag. Both new behaviors require this marker, a
reader language, no supplied queries and a non-discovery task. Language alone
is insufficient: automatic generator and intake calls use it but discard the
search summary. Root corrected the initial language-only assumption after the
bounded caller audit; the first commit/history and its evidence are preserved.

A Russian advertising-labeling reader subject receives bounded article-context
admission after sources recording and before factual use. All five recorded
Telegram sources keep their provenance; two eligible facts survive byte-for-byte.
The HTTP controller maps those admitted facts to its two visible result rows.
Other/English subjects, supplied queries and automatic/intake/discovery calls
retain former admission. Domains and recorded URLs are fixtures, not policy.

An opted-in source-only reader response reuses one cheap accountable structured
summary pass. Five recorded Exa sources/facts remain intact, and citable sources
precede the existing prompt cap. Errors retain the empty fallback without retry.
The real ledger preserves model/search credential attribution, failed Tavily
request and possible billing beside Exa spend. The source-only additional cost
belongs only to the opted-in UI caller; historical multi-answer/language
correction behavior is unchanged for all callers. No provider/query/window/cap,
paid relevance judge, backfill or tariff change was made.

Reader and consumer cache entries are distinct. Two regressions cover either
call order, preserved facts and subsequent cache reuse. Equivalent automatic
language-only and intake language/level calls keep all facts and buy no new
source-only summary. The real controller regression proves server-owned true
even when the passed body contains `readerResponse: false`.

## Verification

Node `22.23.2`, pnpm `10.6.1`; own offline frozen dependencies, zero downloads,
only local Prisma Client 6.5.0 generation; no shared installation mutation.
The original commit had 162/162 focused affected checks. Current correction RED
on unchanged d61: 10 failed / 52 passed. Focused GREEN: 62/62. Final combined
checks: **8 suites, 181/181, zero skips**: 135 checks across the six core suites
(including 26 summary/controller checks), 36 source-admission/boundary checks
and 10 existing UI/controller wiring checks. Backend types and
`git diff --check` exit zero.

The final combined log includes an i18next console-info banner and the warning
`Jest did not exit one second after the test run has completed.` The command
then naturally exited zero. No output/handle collection was suppressed and no
force-exit was used. The focused 62-check run had no such warning. Ownership of
that combined-run asynchronous signal was not diagnosed and does not establish
a production leak; root owns any followup. All raw logs remain available.

## Limits and safe-only cleanup

Offline public-result fixtures/model doubles prove eligibility, data flow,
caller boundaries, cache separation and budget attribution. They do not prove
future live relevance, exact 2026 legal coverage or faithful model prose. Root
owns global tests, live acceptance, integration and deployment; no epic/release
acceptance is claimed by this child.

Retain the committed isolated worktree, its own dependencies/generated client,
and all evidence for root integration. Test commands ended naturally; no active
child test session, server, container, private fixture or external resource
remains. No host/provider/browser/database action, primary checkout/Beads
mutation or shared cleanup occurred. Other workers' worktrees and live/frozen
release files were preserved. Writers stop after the second delivery commit.
