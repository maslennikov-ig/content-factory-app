# Research/source repair delivery

Status: frozen for root acceptance. No runtime restart, model/search purchase, commit, push or deployment by this stream.

## Exact path

Native research.search or piece.create research -> WebResearchService -> existing IntakeSnapshotStore and source registry -> piece.read -> selected exact passages in piece.create.from-research -> existing IntakeService finish/writeCore/recordCore. Existing CORE research reads also use the independently owned PieceService.readCoreResearchSnapshot API with explicit pieceId + researchId.

## Diagnosed failure

The actual failed PostgreSQL run made14 research_search and16 piece_read calls. Exa preserved provider rawContent, but WebResearchService saved a6000-character preview (48000-character scan) as the only source text. Real reads reported5682/5799 characters and a false EOF before the relevant section. The research adapter imposed a second silent200000-character cut. The last wrong factKey was a real model selection error; its refusal remains unchanged. See research-source-diagnosis.json and the preserved actual scenario receipt.

## Small generic fix

- Keep complete provider-returned fullText separately from the existing bounded text preview; retain event-selected previews and bump retention cache identity.
- Persist full owned source material without a context-size cut; read bounded ranges or model-selected literal find positions with exact revision. Own input mistakes are revisable; missing/foreign authority remains refused.
- Optional exact passages reuse saved URL/revision/quote through the existing source registry and private snapshot store; no refetch or invented model claim is admitted. Legacy factKeys remain supported.
- Immutable derived captures include scope, parent identity and canonical selections. Immediate-parent/root availability and persisted terminal writer state are checked; existing root continuation claims fence uncertain, changed-selection and legacy collisions. Safe sufficiency rejection occurs before the writer claim and can be repaired with later evidence.
- Native intake continuations rehydrate the original owned state/resumePlan by pointer and reuse existing finish: private author context/answers/decisions, request/temporal constraints, profile and lead provenance survive. Mixed native fact keys and new passages keep their original source support.
- Full bodies do not enter default model output: compact result, reader packer, native research-ready event, main/autopost reference renderers and review excerpts project bounded fields.

## Verification

Controlled source RED:225088 provider characters ->5967 retained, late evidence missing. GREEN:225088 retained with5967-character preview; zero actual provider/model/network calls. Native compact output stays below4000 characters for a224k page.

Focused final:3 suites,118 tests passed,0 skipped. Backend TypeScript passes. Scoped diff check passes. Separate controlled RED/GREEN proofs cover ancestry/TTL + terminal-root replay and native task/context preservation. Targeted scenarios include success, stale/foreign/quote mismatch, safe insufficient input -> late read -> one write, exact completed repeat, lost claim/completion acknowledgement, uncertain and cross-selection/legacy collisions, actor isolation, parent expiry, original human-selection guards, multi-source capture and explicit existing-CORE read scope.

Exact commands, hashes and integrated read-only dependencies: research-source-freeze.json. Final focused log: research-source-focused-regressions.log. Final TypeScript log: research-source-backend-types-final.log. The earlier research-source-backend-types.log preserves the initial optional-Zod-field type failure.

## Tradeoffs and remaining gates

Full provider text increases private snapshot storage, without increasing default model context. Brief preparation can occur before the existing atomic writer boundary so known input gaps remain repairable; distributed preparation can therefore incur model work before another process wins that claim. The writer and saved artifact remain fenced. No new provider, SDK, retry engine, workflow, schema migration or semantic router was introduced.

Root owns independent exact-diff review, the new compiled runtime, the same natural PostgreSQL request with real providers, complete suite and UI/Stop acceptance. Provider capture completeness, actual latency/cost and production behavior are not established by this offline proof.

Graph-reviewed: borrowed original-checkout map read-only (stale baseline dd67538d), confirmed relevant current files; no graph refresh or external semantic backend. No owned runtime resources or secrets need cleanup; keep stage proofs.
