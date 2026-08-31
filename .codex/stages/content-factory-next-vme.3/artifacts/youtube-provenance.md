---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.3/stage-manifest.json
stream_owner: subagent:youtube-provenance
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-vme.3.youtube-provenance
stage_id: content-factory-next-vme.3
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 4588f020
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root reran the focused asset gate and artifact/diff checks; the temporary source package was removed and no repository asset was added or changed.
risk_level: medium
risk_tags:
  - provenance
  - supply-chain
affected_surfaces:
  - assets
invariants:
  - immutable-source
  - no-recolour
verification:
  - "pnpm exec jest tests/platform.card.test.cjs --runInBand: passed (1 suite, 41 tests)"
  - "pnpm run docs:check: passed (79 files)"
  - "sha256sum apps/frontend/public/icons/platforms/youtube.png apps/frontend/public/icons/platforms/youtube.svg: passed"
changed_files:
  - docs/design/desert-lab/platform-card.md
  - .codex/stages/content-factory-next-vme.3/artifacts/youtube-provenance.md
explicit_defers:
  - provider-protocols
  - youtube-svg-promotion-until-immutable-official-exact-bytes-exist
  - youtube-current-display-trademark-compliance-review
---

# Summary

Decision: keep the existing vetted raster and keep `youtube` out of
`VETTED_VECTOR_IDENTIFIERS`. No resolver, provider protocol, test contract or
asset bytes changed.

Primary-source check on 2026-08-20 found the current official YouTube Icon page
and its direct Google-hosted package:

- `https://brand.youtube/youtube-icon/`
- `https://www.gstatic.com/marketing-cms/78/29/3e68a1414bb28d0b7e47b44c3c91/youtube-icon.zip`
- `https://developers.google.com/youtube/terms/branding-guidelines`
- `https://developers.google.com/youtube/terms/api-services-terms-of-service`

The official ZIP SHA-256 is
`ca9b5104387e0f7afcfda3a79c910449561112f1077177dd0d64f8c72f56e476`.
It contains PNG, AI, EPS and PDF variants but no SVG. Its response reports
`Last-Modified: Tue, 18 Nov 2025 19:34:15 GMT` and
`Cache-Control: public, max-age=3000`, with no `immutable`, `ETag` or
content-digest. The opaque 32-hex CMS identifier does not match the package
MD5 (`0200993c37b301c761dd287a0716c863`) or SHA-256. The source is official,
but an immutable exact SVG URL is therefore not proven.

Local bytes:

- retained `youtube.png`: SHA-256
  `514baa2a99ddf85059571ae3ebe84817a1442f6e120e8b18260b7c7177b2efbe`;
- rejected `youtube.svg`: SHA-256
  `c9bad509c5f6b66101624eb0f4fcef9fcb129a9484fae0a4626c4df2c20cd083`.

The SVG entered upstream in commit
`004ffcabb0a5ae46e95152c7cf83b04acdc30f44` without a primary URL or terms.
It is not byte-identical to anything in the current official package because
that package contains no SVG. No unofficial mirror, redraw, recolour,
reformatting or asset promotion was used.

# Verification

- `platformAsset('youtube')` remains `/icons/platforms/youtube.png` and the
  existing focused asset gate checks that only four proven vectors are used.
- The official package was read in a temporary directory only. Its member list
  and member hashes were inspected without copying any member into the repo.
- Focused Jest passed: one suite and 41 tests. Documentation link validation
  passed for 79 files. Final local SHA verification matched both recorded
  digests.

# Risks / Follow-ups

This is a fail-closed provenance decision, not legal approval of the existing
display. Current official conditions say to use the latest asset, retain the
white triangle and approved colors, avoid stroke/shadow/rotation/distortion,
link the mark to YouTube content or a YouTube component, avoid prominence or
an endorsement implication, and keep digital icon height at least 100px.
Existing product surfaces render the mark at 48px or less. That pre-existing
size/link compliance question is outside this bounded provenance stream and
must be reviewed before claiming trademark-guideline compliance or promoting
any new YouTube asset.

Provider protocols, credentials, production and delivery were not touched.
