# Native Higgsfield pilot

The native parent owns research/scenario/text review, the actual owner request,
manual or delegated budget authority, execution-mode-bound human approvals, and
the actual independent image-pair review. New pilots default to review mode with
two human checkpoints; historical or explicitly selected autopilot retains one
whole-pilot approval. Videos owns provider context, quotes,
aggregate reservations, three durable jobs and owned Media. Native actions use
the social-factory controller; there is no generic engine, new ledger table or
fabricated VideoPromptDraft.

`HGG_PILOT_SERVICE_V1` / `HggPilotServicePortV1` is the server-only integration.
A binds `HggPilotParentPortV1` once on module init. Its transaction guard checks
semantic source/scenario/review/prompt/ordered-frame/current authority, rather
than equating a frozen audit revision with a progress counter. Reservation and
submit claims invoke the guard in the same serializable transaction. Parent stop
or changed semantics invalidates unsubmitted work; accepted/unknown work retains
its original intent, receipt and financial exposure.

## Prepare without private IDs

`discoverWorkspace` receives the owned parent/preparation identity. It finds the
current actor's granted Higgsfield connection, reads the current workspaces and
bounded image/video catalogues, and validates the selected GPT Image 2.5 / Kling
4.0 contracts. Multiple plausible connections/workspaces are genuine choices;
there is no first-user/account/model fallback. IDs and metadata stay in private
qualification JSON. Native callers supply no model IDs or evidence-file paths.

Only the explicit sole-private-owner target may be selected under the retained
native preparation request. Selection is separate from spend consent and is
journalled before the mutation; uncertain selection is observed, never blindly
replayed. A connection-wide CF lease serializes context-dependent operations.
External changes between requests remain non-atomic: this is observed selected
context, never proof of the billed pool or a provider billing cap. Generic provider
readiness and legacy generation contracts are not promoted.

## Price, authority and settings

`video.pilot_renew_credentials` is a separately confirmed, authored same-grant
renewal action. Its public input is only `pilotId`. The server derives the owned
thread, connection, original workspace and ordered retained frame receipts. The
native parent journals the request before the credential operation; a lost or
unknown acknowledgement permits only `readCredentialBindingV2`, never another
refresh attempt. A confirmed result appends `executionCredentialsV2` separately
from the V1 content context, original budget, first frame and repair history.
Renewal does not quote, select another workspace, create a job or authorize
generation. A new authored quote refresh and fresh epoch-bound native repair
approval are still required. Provider V2 validation independently fences the
current credential epoch and mixed historical first/current repaired last frame;
the original V1 guards and receipts keep their historical meaning.

The initial image price precedes budget/script execution consent. In review mode,
the final clip price is checked only after human pair-and-cap consent and must
fit the original remaining finite limit; it never raises that limit. `quote`
records one exact attempt per intent. A successful expired quote can be explicitly refreshed before any job
exists, preserving prior quote/raw evidence. A known local pre-send busy result
can be explicitly resumed. Network/provider/uncertain attempts do not auto-retry.
`read` / `getByIntent` make no provider calls; they use DB/source/owned-byte checks.

An authored `video.pilot_refresh_last_frame_repair_quote` request refreshes only
an expired, quoted last-frame correction with no job or saved correction consent.
It keeps the same repair, original instruction, plan, intent, preflight, finite
cap and all prior results/costs; the parent journals the authored refresh and
previous snapshot, and Videos preserves prior quote/raw evidence. The new expiry
binds a fresh approval hash and requires a new content-bound native approval.
After an interrupted parent save, a new authored request may adopt the same
confirmed fresh preflight without another quote; only a positively expired
quoted preflight permits a new price claim. Pending, failed, approved or unknown
paid work is never reissued. Interface copy supports Russian and English through
extensible locale dictionaries with English fallback, independently of the
content output locale. This backend-only addition preserves the existing worker
parent binding and expiry-bound approval contract; older workers retain the
optional journal JSON and cannot admit a repair without its saved scoped consent.

Both native cost fields accept finite nonnegative fractional values. Quote-only
replies are valid without echoed params, input checks or provider timestamps.
Missing checks stay unknown; explicit negative required-media flags block paid
admission. The public capture time and admission deadline are local. Provider
input validation and actual charged cost are never inferred from price.

`quotePlanningClip` uses a separate empty-frame intent. Its price can inform an
explicitly labelled estimate; it cannot admit a job, even after spend approval.
The final clip uses another intent with actual ordered saved frames and review.

The current lower-resolution preparation explicitly uses image Flare/high/1k,
background omitted, and video `resolution: 720p`, five seconds, portrait 9:16,
count one. The video input field is top-level and optional; omission retains the
historical 1080p operator contract. Current settings/quote bindings must change
when settings change; historical higher-resolution quotes remain audit evidence.

A manual budget comes from an actual native fact answer. Explicit owner delegation
may instead authorize a finite server-established quoted cap with its retained
instruction and provenance; it is not an owner-entered number or unlimited spend.
The native parent owns that distinction and cap calculation. C consumes only the
trusted finite authorization returned by the parent guard, respects its included
stages and aggregate cap, and never raises the cap or changes connection limits.
Unknown actual costs remain reserved across stages and connections. Even an exact
zero-credit estimate needs finite authority; it does not establish a free pool or
zero actual charge. Submit uses explicit credits, with no API/Unlimited fallback.

## Execute and recover

The existing native scenario card shows «С согласованием — подтверждаю сценарий
и кадры» or «Автопилот». The selector is editable only before production
preparation, then locks without resetting quotes, consents or results. An accepted
scenario offers «Подготовить запуск кадров» to request current access, first
pricing and a finite limit; the prepared card offers «Запросить согласование
сценария и запуска». Both send an explicit user turn, not generation or consent. The first
review-mode native approval displays the exact complete scenario and public copy
and authorizes only the two images plus independent review. After both actual
images pass that review, the parent durably waits without creating a clip plan
or quote. The waiting card exposes «Посмотреть кадры и запросить согласование». Clicking
sends one deliberate USER request with a hidden, server-resolved exact pilot
context; it neither approves nor starts generation. No automatic LLM turn is implied. `video.pilot_launch_reviewed_clip_v2` then asks for separate native
human consent bound to the actual pair, source, scenario, mode and retained cap.
Both owned previews must load before Yes; only afterward does a fresh quote
permit ONE clip within the remaining limit. Decline or Stop preserves prior work.

If the initial image quote expires before consent, explicitly prepare the same
pilot again to refresh its unsubmitted quote, then approve the new card; ordinary
status refresh does not request pricing. «Править сценарий» and «Править визуальные референсы» collect authored changes
and use `video.preproduction_revise_v2` to create a linked immutable TEXT version
in the same chat. The exact original brief, previous scenario and new correction
remain distinct. References-only retains exact public copy/claims and later means
BOTH new images; no old frame, spend consent or budget is silently reused. New
versions default to review and need their own media preparation and human gates.
Active/unknown work in the same revision family blocks circumvention. The saved
repair has its own request-approval button, and a truthful notice makes clear that
plain assistant text or a printed tool call is not a real native approval card. Historical production with no V2 mode
keeps its original autopilot consent and hash. Backend, main worker and frontend
must all run the same accepted V2-aware source before a new review pilot starts;
a V1-only worker must not process its events.

First image -> saved owned image -> reference-conditioned last image -> saved
owned image -> actual parent-owned pair review -> human pair approval in review
mode (or retained autopilot authority) -> asset-bound live clip quote/admission
-> saved video. A receives a durable, idempotent settled-stage event and advances
only within that mode's authority. Reopening reads saved state, never regenerates. Private
`frameReceipt` validates the saved image, bytes, account generation and actual
provider receipt; public readers expose owned Media only.

Each admitted stage uses existing preflight/intent/job uniqueness, Decimal
exposure, leases and CAS. The submit attempt nonce/hash is persisted before the
single mutation. Received raw is immutable and attempt-bound, and can be retained
after a state lease expires or changes owner. State changes still require the
current lease. A later worker adopts a known receipt for status recovery; an
uncertain submit is never repeated. Provider adjustments or differing approved
echoes retain the actual receipt as `input_changed`, stopping acceptance and
continuation. They do not trigger a repair generation.

Images use decoded MIME/dimensions/hash and owned readback; they never enter the
legacy MP4 worker. Video uses existing MP4 validation, an exact portrait height
of 1280 for 720p or 1920 for 1080p, width within 1% of 720 or 1080 respectively,
and five-second duration within 0.75 seconds. This bounded width tolerance accepts
near-portrait output while preserving its actual measured dimensions and original
bytes; it does not resize or transcode the result. Save-only recovery uses the
captured result/stored file and creates owned Media once. Supported recovery actions are status read and
save retry, not generic retry/cancel or inferred settlement.

The additive `hggPilotStageWorkflowV1` / activity carry only org/job/cycle IDs.
Legacy V1 histories are unchanged. Expiry fences the current recovery cycle and
deadline and stays pending under a live lease. Existing recovery routes pilot rows,
including saved continuation and late receipts, to the new workflow. The worker
must load the same accepted source and SocialFactoryModule to bind A's adapter.
A managed isolated QA Temporal server/main queue can use this existing routing;
foreign/old workers must remain separate. Imports alone do not prove a worker is
running or an actual provider job is compatible.

The explicit `video.pilot_recover_vision_fenced_v1` action revalidates the same
saved JSON-fenced vision response after a parsing failure, checking current
ownership, source, frame bytes, model provenance and bindings. It retains the
original failed usage record, raw response and audit; it makes no model, quote
or job call. Provider finish reason remains unknown if it was not captured.
