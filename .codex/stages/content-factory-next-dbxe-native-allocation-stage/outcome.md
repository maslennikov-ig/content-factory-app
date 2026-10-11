# dbxe.35 — uploaded images / native allocation

The selected aligned-new defect cannot be triggered through the verified
Sharp0.35.5/libvips8.18.7 image chain in serving755d19fa731d. Exact vendor source
and machine instructions exclude the overflow at its sole aligned allocation:
JPEG ICC payload size minus14, constant alignment4, a minimum-length guard and
a16-bit JPEG marker bound. GNU PBDS source/template use is also excluded in the
bound native image consumers. This is source/ABI/input-bound acceptance of35,
not a claim that the GCC12 OS allocator has been patched or every parser is safe.

No product code or runtime change was necessary. Added a reproducible isolated
header/ICC probe, exact native/source provenance, consumer map and fail-closed
evidence verification; corrected the formerly unresolved finding in operations
documentation. Node22.23.2, supported formats,1792MiB cap, data, source/registry
separation and rollback remain intact. No rebuild, deployment, schema change,
provider/model/customer call or backup restoration occurred.

## Verification

- Seven direct product Sharp calls and Next's image optimizer use the same
  verified addon/libvips. Local and current live native hashes match the official
  release artifacts. No configured preload/library/module override.
- Twelve controlled inputs, each with actual native metadata and conversion:
  hostile PNG/JPEG/GIF/TIFF/BigTIFF/AVIF dimensions, a vendor UltraHDR control,
  a short ICC profile and a maximum APP2 ICC marker with huge claimed fields.
  Normal PNG/TIFF/BigTIFF and genuine vendor JPEG controls pass. Large actual
  dimensions reject; the huge GIF logical canvas retains its bounded frame;
  invalid ICC profiles leave bounded processing. No crash or oversized write.
- No-network/read-only256MiB fixture removed; preexisting containers preserved.
  Source/ABI proof supplies the general exclusion, rather than extrapolating
  from these samples or from Sharp's post-open pixel check.
- Current service and native worker health pass, zero restarts, API/login/source
  endpoints200, archive matches its manifest, rollback and host capacity pass.
  Unchanged runtime reuses its exact private d724/public755d full release gate;
  no new suite/build/release is claimed for this evidence-only stage.

Root acceptance, exact commands and hashes: `root-acceptance.actual.json`.
Native research: `research/child-native-report.md`; original33 audit/primitive
evidence remains unchanged and is superseded only for these two image findings.

## Status and continuation

Beads35 CLOSED;33 CLOSED after its dependent proof. Beads8 IN_PROGRESS,
34 OPEN and epic OPEN. Original criteria and all unselected statuses are kept.
The old allocator/scanner findings remain recorded with reevaluation triggers:
Sharp/libvips/codec/Node/native input/consumer changes or an official compatible
vendor fix. General Node/application paths outside this image chain and other
parser vulnerabilities are outside the acceptance claim.

Next recommended bounded stage:34, actual global npm/pnpm/PM2 and bundled-binary
callers. It is not started. No continuous epic goal; stop for owner choice.
Private source/evidence delivery is recorded in `delivery.actual.json`; public
serving source/image remain755d19fa731d.
