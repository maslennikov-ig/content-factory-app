# Review-tail stage 11.09

Source: owner-pasted independent review against release `cc513632d93d`; Beads
parent `content-factory-next-xbfj` remains the status authority. The branch is
`codex/review-tail-2026-09-11` from `f20b0f32` in the root-owned integration
worktree. The production release boundary is still `cc513632d93d`, with
rollback `4fdac6f1435a`.

## Integrated scope

- `WebResearchService` reserves the in-memory quota only when the caller passes
  an explicit `quick`, `standard` or `deep` level. Legacy level-less facts,
  autopost and copilot callers remain available after the opt-in allowance is
  exhausted.
- Included search uses only `AI_INCLUDED_SEARCH_PROVIDER` and its managed key.
  A workspace provider change clears the previous search key and disables the
  new lane. Tavily remains the default; OpenRouter is the only reserve path.
- Research egress applies global, tenant and provider kill switches and the
  bounded query/source/response/time/cost/concurrency budget before a client is
  built. Deep research passes the declared 50-source cap.
- Constrained static fetch validates HTTPS/443, resolves each hop, rejects
  private or non-global addresses, follows redirects manually and uses the
  existing SSRF dispatcher. Wikipedia/Wikidata callers use it on the real
  network path; recorded fetchers remain network-free in tests.
- Ordinary generation receives the resolved tenant channel profile for hashtag
  and CTA instructions. Adaptation review supplies the visible level
  explicitly, including `standard`.
- Handoff, runbook and historical release evidence now agree on rollback,
  provider wording, transfer terminology, related-query length 200, issue #670,
  and the read-only Mastra fingerprint command.

The five stream artifacts are listed in `stage-manifest.json` and are accepted
by root because the earlier R2 worker stream was unavailable; no parallel agent
claim is retained. The actual live keyless WebResearchService wiring is an
honest defer in `content-factory-next-m0iy.8`. Durable quota accounting is tied
to `content-factory-next-m0iy.9`, which depends on the tariff decision in
`content-factory-next-or3.9`. Closed `m0iy.2` and `m0iy.5` carry comments that
correct their earlier overbroad close reasons.

## Verification

The focused replay currently passes 6 Jest suites and 134 tests. It uses
recorded responses and injected DNS resolvers only; no paid provider, real key,
live account, database mutation or browser run was used.

`orch-prompts docs-resolve --ecosystem npm --package undici --version 6.28.0
--topic "fetch redirect manual DNS lookup dispatcher HTTPS URL IP private
address" --json --no-download` returned `fallback-needed` because the local L1
index is missing. The implementation therefore relies on the pinned Node
22.23.2 behavior and repository contracts; no unsupported external claim is
treated as proof.

The code-only Graphify refresh completed at the accepted integration boundary
from `f20b0f32` with the current working-tree files; focused read-only queries
confirmed the research and generator paths. Root final acceptance remains:
three app typechecks, build, one full `pnpm test` through
`scripts/release/record-suite-receipt.sh`, process/design/brand/docs guards,
`git diff --check` and an empty Prisma schema diff. The release receipt must be
bound to the final committed HEAD.

docs-reviewed: updated - runbook, handoff and release evidence now record the
provider, rollback, transfer, related-query and deferred-wiring decisions;
project-index navigation did not change.
graph-reviewed: refreshed - Graphify was refreshed read-only at the accepted
integration boundary and focused research/generator queries passed.

## Risks / Follow-ups

No release image, public-tree update, remote push, host switch, paid call, real
key or database apply is part of this stage before the owner's production
choice. If local acceptance is green, ask for the exact choice
`[разрешаю выпуск | остановиться после локальной приёмки и стенда]`; a green
local receipt alone is not production authority.
