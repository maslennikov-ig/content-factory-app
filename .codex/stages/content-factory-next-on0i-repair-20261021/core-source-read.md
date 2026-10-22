# CORE research source read

Status: both owned sources frozen; focused service checks pass. Root owns integrated acceptance.

CORE research is saved by `PieceService.researchCore` under its existing exact organization/actor/piece/snapshot key, distinct from Intake snapshots. The public `readCoreResearchSnapshot(organizationId, pieceId, actorUserId, snapshotKey)` now reads that actual envelope. It first requires the current tenant piece, then validates supported version, matching stored identities, a future finite expiry using the existing injected clock, and evidence/facts arrays. Missing storage/key, malformed data or a deleted piece returns null.

The returned evidence is the complete retained array, including optional fullText. Input provenance uses the stored resume-plan input or stored original body. Current piece edits do not authorize a write and do not prevent reading prior evidence; deleted pieces refuse. The method does not accept research, invoke a writer/provider, mutate a cache/index, or refresh expired content. The separate reader adapter owner wires fallback only with explicit pieceId and researchId.

The existing research flow fixture now covers twelve new cases: v1/v2 complete-source round trips through the actual researchCore envelope, foreign/deleted/missing ownership, exact key and inner-envelope identity mismatch, version/expiry tampering, malformed state, and legacy provenance. All 51 existing and new tests pass; backend TypeScript and diff checks exit zero. Setup model/search fixtures are synthetic; read itself causes no repeat call or storage mutation. Commands, RED/GREEN evidence, owned SHA hashes and related app hashes at type-check completion are in `core-source-read.json`.
