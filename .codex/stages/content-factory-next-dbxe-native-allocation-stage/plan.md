# dbxe.35 — native image allocation

Selected by the owner on 11 October 2026. One bounded stage; Beads owns status.
Base private source: d8aa13f170bb520356d6859c4c85ca1219b2c6bf.
Serving image/public source: 755d19fa731d524b151afe18c4394d8027030d58.
Exact prior release acceptance: private d724f3b792f4518eebc04c854448904f565323fd.

## Outcome and specification

Determine whether uploaded image bytes can trigger the shipped GCC12 aligned-new
overflow, and remove that risk at the actual image consumers. Use a supported
minimum compatible official fix when available, or exact source/ABI/input-bound
evidence excluding the hostile allocation and GNU PBDS erase_if path. Unproved
reachability remains UNKNOWN. The existing native primitive reproduction does
not establish an image exploit.

Preserve Node22.23.2, Sharp support, 1792MiB runtime cap, data, historical Temporal
contracts, source/registry separation and rollback. No allocator preload,
distribution replacement, floating compiler override, real provider/model/client
call or backup restoration. Other tasks, including dbxe.34, remain unselected.

## Execution

1. Bind current source/image/advisory state; trace uploads and every Sharp caller.
2. Trace version-pinned native aligned-new calls and input bounds; check GNU PBDS
   in actual shipped image consumers, including statically linked codec sources.
3. Exercise representative hostile dimensions/metadata in owned, resource-bound,
   no-network native fixtures; record allocation bounds rather than only success.
4. Choose the smallest remedy from the evidence. Any code change gets a focused
   behavioral regression check. Any runtime release gets the exact-source full
   repository gate and native/health/schema/source/weight/capacity checks.
5. Root accepts one set; update Beads, outcome and handoff; save changes and stop.

## Premortem

Verdict: GO WITH CONDITIONS. Inspect before changing runtime.

| Failure | Evidence | Detection / mitigation |
| --- | --- | --- |
| A default pixel limit is mistaken for protection before decoder allocation | plausible: Sharp checks image dimensions after opening | Inspect loader/header and allocator source; hostile-header fixture before acceptance |
| A statically linked codec/PBDS path is missed by ELF imports | confirmed limitation of dynamic symbols | Inspect exact vendor build dependencies/source; label any missing path UNKNOWN |
| An image conversion or source-version mismatch is claimed as exploit exclusion | plausible executor error | Bind versions, binary hashes and bounds; distinguish sample coverage from source proof |
| A library replacement breaks ABI, increases image size or changes adjacent tools | plausible if runtime change chosen | Preserve compatible APIs and exact release/capacity gate; rollback to verified755d |

Research child owns only child-native-* research artifacts; root owns product,
integration, controlled execution, acceptance and delivery. One child supplies
native source expertise while root maps product input; no duplicate reviewers.

Recovery: research-only work leaves serving runtime intact. For a required
runtime change, retain verified755d and revert only this application's image on
failed native/health/source checks; no data rewrite or schema change is planned.
