# Independent video V1 review and corrections

Requested by the owner after local delivery. Reviewed range:
`e326aab7a7940814bc63f6dc229b018e53c759ac` →
`00ffac5dc0a562f063b0c1713f6157169d05c312` on `codex/video-v1-api`.
Two fresh-context read-only reviewers examined persistence/execution/settings
and product/provider/media consumers independently of the implementation history.
Root reproduced findings before fixes; the reviewers subsequently received
separate bounded correction zones. No third review wave or broad release gate.

## Findings and correction contract

| ID | Priority | Confirmed failure in reviewed commit | Required correction and proof |
| --- | --- | --- | --- |
| R1 | P1 | HeyGen submit/status read flat fields instead of `{data:{...}}`, losing an accepted video ID and rejecting status | Provider-local validated unwrap, schema-correct fixture, create/status contracts and persisted presenter journey |
| R2 | P1 | Deadline expiry returning `done:false` successfully closes the workflow while a job remains pending | Continue durably through a busy lease/storage outage until terminal expiry; unit regression and real Temporal continued execution |
| R3 | P2 | The generic AI settings endpoint's first video-only save inherits Prisma's `workspace_key` default | Preserve the inherited payer unless explicitly selected; both settings doors covered |
| R4 | P2 | Concurrent settings read/merge/write can re-enable a disabled provider or lose unrelated key changes | Serializable bounded retry for all three video-map writers; concurrent real-Prisma cases |
| R5 | P2 | An expired importer can create a second Media and overwrite the winning result after its initial SELECT | Final transactional tenant/owner/expiry/empty-result CAS; losing insert rolls back; controlled real-PG interleaving |
| R6 | P2 | Client navigation from the open Media page changes query but never opens the video workspace | Reactive query/back navigation; actual entry click and component regression |
| R7 | P2 | Embedded video save/launch/selection replaces `/agents/:thread` with `/media` | Container-aware URL changes; embedded regression |
| R8 | P2 | Selected video IDs are dropped from the work context; the assistant receives the common library | Preserve exact video identities and resolve current tenant-scoped draft/job data, including mirrored contracts and context keys |
| R9 | P2 | A native chat edit leaves the retained editor on old script/version | Addressable SWR reader and targeted invalidation, preserving unsaved manual edits |
| R10 | P2 | Video approval calls a reservation a spending limit and promises cancellation after submission | Honest reservation/estimate and provider-specific cancel/refund wording; rendered approval coverage |
| R11 | P2 | A long immutable source excerpt makes saving a short edited output fail input validation | Permit the unchanged source/other-mode output while bounding new output edits; real PG cases for both modes |
| R12 | Improvement | A hashed paid snapshot is not itself reviewable in the confirmation card | Show or link the actual saved script/settings before acceptance using existing artifact/approval primitives |

Primary schema evidence for R1: [HeyGen Create Video](https://developers.heygen.com/reference/create-video)
and [Get Video](https://developers.heygen.com/reference/get-video), checked again
during review. The single-resource response is an object under `data`; asset
pagination retains its separate array envelope. The prior flat fixtures were
wrong, so previous mock successes could not establish adapter compatibility.
No real provider request was made to validate this correction.

R11 root cause: the same 12,000-character schema was applied to both editable
outputs and immutable source facts. A 15,500-character original prevented saving
a short output even when the source fact was untouched. Facts remain checked
against their original text/identity; a new overlong output remains rejected.

## Evidence boundary

Correction engineering acceptance PASS. [Root correction receipt](review-evidence/root-acceptance.json)
identifies current files, commands and logs. Historical acceptance at `00ffac5dc`
remains an audit record of its tested cases; its engineering verdict is
superseded rather than relabelled. No confirmed finding remains unfixed.

- 22 unique affected Jest suites / 368 tests PASS; 15 native Node provider
  contracts PASS. Successful unchanged checks were reused; failed cases were
  rerun narrowly. No full repository suite/build.
- Backend/frontend/orchestrator TypeScript checks PASS.
- Actual Next/Nest/Prisma/storage browser journeys PASS for both modes: real
  Media link, document witness proving client navigation, back/forward,
  edit/reopen/launch/play/download, one submission per result, no reload replay,
  reader 403, foreign 404, 390px layout and zero page errors.
- Real isolated Temporal: two mode workflows survive worker/service restart
  with identical receipts and files; a third workflow continues as new while
  deadline expiry is lease-blocked, then terminates with zero extra submits.
- Real PostgreSQL controlled lease expiry rolls back a losing Media insert;
  concurrent key/policy changes preserve disable/removal/other-provider edits
  across all three writers. The common first video save preserves payer mode.

Integration corrections: loading an already cached saved draft exposed a race
between defaults and restored settings. Defaults now initialize only a new
draft, and a saved-draft reader shows loading until its state is applied. All
21 UI tests pass, including presenter settings on reopen. Approval harnesses
disable irrelevant SWR loading timers; the two affected proofs pass cleanly.
The first browser run stalled despite a completed DB job and a Turbopack HMR
panic. Next was restarted locally in documented Webpack mode; its 31.7-second
cold compilation exceeded the first 30-second navigation timeout, after which
the actual warm browser acceptance passed. No bundler/config change shipped.

Reviewer correction streams: `video_review_persistence` delivered and root
accepted the three transactional writers and real-PG/bounded-retry cases;
`video_review_product` delivered and root accepted navigation/context/cache/
approval consumers, all 16 locales and focused cases. Root owned provider,
grounding, final Media fence, workflow and final integrated acceptance. No
worker commits, subtree reverts, unrelated cleanup or external actions.

All databases/Temporal servers used here are new task-owned loopback fixtures.
All provider/text transports are synthetic and the playable MP4 is the existing
unchanged CC0 sample. Real output/speech/language quality, account access/terms,
actual billing and prompt benefit remain UNKNOWN. Epic and `.7` stay open.
No actual credentials, paid calls, push, merge, public refresh or deployment.

graph-reviewed: borrowed the shared checkout's graph read-only at `dd67538d`;
`VideoManager` matched its index manifest. New video symbols are unindexed, so
this review followed the known current source files. No graph rebuild/API use.
