# Review-tail stage 11.09

Source: owner-pasted independent review against release `cc513632d93d`; Beads
parent `content-factory-next-xbfj` remains the status authority. The branch is
`codex/review-tail-2026-09-11` from `f20b0f32` in the root-owned integration
worktree. The production release is `aaaf00afe664` on 11.09.2026, with rollback
`cc513632d93d`. The public tree is `aaaf00afe664863244800dd2f37ee0682b2cb718`
and the image digest is
`sha256:a90c089d6a6c01deceb292c6447d1d16a969910732fc4e7d934f857cef20b9cc`.

## Integrated scope

- `WebResearchService` reserves the in-memory quota only when the caller passes
  an explicit `quick`, `standard` or `deep` level. Legacy level-less facts,
  autopost and copilot callers remain available after the opt-in allowance is
  exhausted.
- Included search uses only `AI_INCLUDED_SEARCH_PROVIDER` and its managed key.
  A workspace provider change clears the previous search key and disables the
  new lane. Tavily remains the default; OpenRouter is the only reserve path.
- Research egress applies global, tenant and provider kill switches, the
  approved provider list and the per-level query count before a client is
  built; bytes, sources and cost are not metered by this check (corrected
  11.09 by `content-factory-next-6xi0`). Deep research passed its 50-source
  preset straight to the provider, which Tavily rejects above 20; the
  provider cap is restored in `6xi0.1`.
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
confirmed the research and generator paths. The release receipt bound to the
released source is the ignored local receipt for
`e4ea8a3cf2724257dd15622593551a0eb996094d` (Jest 417/5392, Node 125/0,
Python OK); the stage acceptance receipt remains the integration closeout
record. Production checks after the switch found the marker aligned, health
healthy, zero restarts, and the three HTTP probes at 200. Prisma diff was empty
and no schema apply occurred. The dedicated Mastra database had 29 tables and
the stable canonical schema SHA
`310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7`.

docs-reviewed: updated - runbook, handoff and release evidence now record the
provider, rollback, transfer, related-query and deferred-wiring decisions;
project-index navigation did not change.
graph-reviewed: refreshed - Graphify was refreshed read-only at the accepted
integration boundary and focused research/generator queries passed.

## Risks / Follow-ups

The live keyless research wiring remains deferred to
`content-factory-next-m0iy.8`; durable quota accounting remains tied to
`content-factory-next-m0iy.9` and the tariff decision in `content-factory-next-or3.9`.
Exa still needs the owner's key. No paid provider call or real key was used for
acceptance. The release and rollback were retained by the scoped host-retention
script; other host assets were not touched.
