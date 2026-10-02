# Empty-schedule draft repair

Task: `content-factory-next-2q28.2.1`. Base
`d70c2106295e0c396d3917545447da5c94c331a6`, isolated branch
`codex/empty-schedule-draft-2026-10-02`. Root owns acceptance, integration,
release and all live operations. This stream has no production/provider access.

## Confirmed cause and contract

`AgentGraphService.postDateTime` always calls the global slot search, even when
`PieceService` will save a draft with plan `draft`. IntegrationService returns
an empty minute list for `postingTimes=[]`; PostsService recursively queries
every next day forever. This is consistent with root's B1 post-time observation;
it does not establish a cause for an earlier OOM.

Piece persistence creates DRAFT first. Its subsequent channel lock reads the
effective mode again (own piece/channel override, else current channel mode).
Under draft it sets plan=draft/date=null without scheduling. Reserve/autopilot
already have a separate channel-specific scheduler with horizon 366 days.

Root selected the narrow correction: bypass the preliminary global search ONLY
when the existing org-scoped `adaptPlanMode` resolves draft. Preserve all other
paths and the final locked re-read. A missing plan store returns null and keeps
the historical path. The existing fallback date of a DRAFT row is storage
metadata; it does not select a publication time.

## Cohesive implementation and proof

Owned production files:
- `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`
- `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`
- narrow approved link in `content-intelligence/pieces/piece.service.ts`
- internal type only in `agent/generator-run-input.ts`

No public DTO, controller, repository, schema or Temporal contract changes.
An optional third server-owned start argument carries draft-only intent; body
and options sent through HTTP are never read as that argument. LangGraph must
declare/carry the corresponding state channel so it reaches the actual node.

The public slot service rejects an empty or malformed minute list promptly,
using existing BadRequestException validation. Valid minutes are integer
numbers 0..1439. Malformed JSON/array shapes from the existing integration
reader also become sanitized validation failures; ordinary dependency failures
remain failures. Preserve exact earliest-slot formatting, tenant scope, today
and next UTC day. Bound the existing recursion to today through UTC day +366
(367 daily read attempts), matching the adjacent established horizon.

Focused regression evidence uses actual service methods and the actual
PieceService -> AgentGraphService compiled graph -> draft save path, with
database/provider/model ports substituted. Pin business dates. Demonstrate
draft + [] bypass/save, effective override/current mode, public-body spoof
resistance, non-draft validation, valid today/next day/final horizon slot,
exhausted horizon, failure with no false adaptation/save, ownership and no
additional model/write/workflow calls. A bounded sentinel prevents the old
infinite scan from hanging the local RED run.

Verification is meaningful focused RED/GREEN, one final complete affected
focused set plus backend types/diff checks on stable source. No full suite,
live shutdown, new provider/model calls or shared installation mutation.
Record exact inputs/protected hashes, commands/counts/skips and resource
inventory, commit only the owned isolated slice, freeze and deliver to root.

Graph-reviewed: borrowed root graph explicitly from
`/home/me/code/content-factory-next/graphify-out/graph.json`, baseline c1e44cfd.
Native findFreeDateTime/postDateTime lookups identified integration, graph,
PieceService and public controller; exact d70 sources were read here. The old
graph is orientation, not complete/current impact proof. No refresh or logging.

## Focused technical premortem

Verdict: GO within root's selected source scope; release/live acceptance remains
root-owned. Blast radius: optional server start argument -> graph post-time ->
Piece draft persistence; public find-slot -> read-only bounded UTC slot search.

Confirmed mechanisms and preflights:
- A flag copied from public JSON could change scheduling: keep it out of the
  body/DTO and exercise the actual two-argument PostsController consumer.
- Channel mode alone misses own overrides/current changes: use adaptPlanMode,
  test both own overrides and a change after prepare; retain final lock re-read.
- A dropped LangGraph channel would silently restore the hang: exercise the
  compiled product graph into save, rather than replacing postDateTime.
- Empty/invalid schedules and an occupied horizon could loop or fabricate a
  time: actual integration/repository-read fixtures, strict validation and
  finite 367-day bound; keep successful old UTC formatting.
- Save failure could look complete: assert terminal error/no adaptation, and
  retain the existing DRAFT when only the later derivation save fails.
- Executor/source drift: verify exact owned/protected digests and backend types;
  leave primary, accepted readiness source and other owners untouched.

Recovery is root's ordinary rollback of this code slice, not data deletion or
schedule repair. No schema/migration/background job is introduced. Existing
drafts/derivations/usage records remain; local worktree/dependencies/evidence are
retained for integration. No cleanup of shared resources is authorized here.
