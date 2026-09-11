---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-xbfj/stage-manifest.json
stream_owner: root-r2-research
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-xbfj.1
stage_id: content-factory-next-xbfj
repo: content-factory-next
branch: codex/review-tail-2026-09-11
base_branch: main
base_commit: f20b0f32
worktree: /home/me/code/content-factory-next-review-tail
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root-owned shared integration worktree is retained; no child worktree, network call, paid key or live resource was created.
risk_level: high
risk_tags:
  - ssrf
  - provider-isolation
  - paid-call-admission
  - egress
affected_surfaces:
  - backend
  - network-boundary
  - configuration
invariants:
  - opt-in-paid-level
  - tenant-provider-isolation
  - every-hop-dns-validation
  - fail-closed-egress
verification:
  - 'Focused Jest: 6 suites, 134 tests passed for research, provider, adaptation and settings contracts.'
  - 'Recorded-response tests cover private DNS answers, unsafe schemes, redirect loops, provider kill switches and keyless encyclopedia lanes without network or paid calls.'
  - 'The live WebResearchService import path was inspected; keyless Wikipedia/Wikidata modules remain offline-only until the separately tracked wiring task.'
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.config.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - libraries/nestjs-libraries/src/content-intelligence/research/constrained-static-fetch.ts
  - libraries/nestjs-libraries/src/content-intelligence/research/encyclopedic-reference.ts
  - tests/web.research.service.test.cjs
  - tests/research.phase-one.test.cjs
  - tests/ai-provider.usage-mode.test.cjs
  - tests/ai.search.config.test.cjs
  - tests/ai.provider.component.test.cjs
  - .codex/stages/content-factory-next-xbfj/artifacts/R2-research.md
explicit_defers:
  - Live WebResearchService use of Wikipedia/Wikidata and constrained page fetch is deferred to content-factory-next-m0iy.8.
  - Exa live use still requires the owner's key and paid-call authority; recorded responses remain the offline proof.
---
# Summary

The review-tail implementation makes research admission opt-in: only an
explicit `level` reserves the in-memory quota. Included search routing reads
`AI_INCLUDED_SEARCH_PROVIDER` and its managed key, while workspace provider
changes clear the old search key and disable the new lane until it is enabled.
Exa, Tavily and OpenRouter are bounded by the egress policy and operator kill
switches. Deep requests pass the server preset's 50-source cap.

The constrained fetch broker validates HTTPS/443 URLs, resolves every host,
rejects private or otherwise non-global addresses, follows redirects manually,
and revalidates each hop through the SSRF dispatcher. Wikipedia and Wikidata
callers use that broker when the real fetch is selected; deterministic tests
inject a resolver or recorded fetcher and never touch the network.

# Verification

The focused six-suite run passed 134 tests on Node 22.23.2. No API key, model
call, DNS request or live account was used by the proof. The source review
confirmed that no live `WebResearchService` path imports the keyless modules;
that gap is recorded as a separate Beads task rather than being represented as
released wiring.

# Risks / Follow-ups

The in-memory quota is process-local and is not a durable tariff counter. Exa
and the keyless source order need an owner decision before live use. Any future
live wiring must keep tenant/provider isolation, per-hop DNS checks, redirect
revalidation and the egress budget in the same acceptance boundary.
