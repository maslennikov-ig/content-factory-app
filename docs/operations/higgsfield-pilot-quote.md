# Higgsfield pilot: cost-only operator boundary

`hgg-qualification-reads.cjs --mode quote` sends one `generate_image` or
`generate_video` request with object `params`, `count: 1`, and `get_cost: true`.
It does not enable paid generation, register an application endpoint, promote
a wallet, or change the existing generation/Temporal contracts.

The operator supplies the exact retained image-detail and video-catalogue files
accepted by `video-hgg-pilot-evidence.v1.ts`. Their byte hashes select GPT Image
2.5 and Kling 4.0 without publishing private model IDs or accepting aliases.
Every session also verifies the current complete `tools/list` digest.

The strict request JSON shape is `HggPilotQuoteInputV1` in
`libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-quote.v1.ts`.
Both kinds require the prepared English prompt and source binding: pilot/revision,
the full canonical `SourceArtifactRefV1` object (including its SHA-256 string
`revision`), separate source content digest, scenario digest and accepted text-review
digest/input hash. These are retained caller bindings; this operator boundary
does not claim it checked a current native parent or performed a content review.
`parentRevision` is a number; source revision exists only inside the canonical
reference. A separate `sourceRevision` field is rejected.

- Image: `kind: image_frame`, `slot: first | last`, explicit variant/quality/
  resolution settings, optional background, and `references: []` or one first
  frame for the last-frame quote. The owner's initial comparison choice is
  Flare/high/2k/9:16 for the historical comparison. The current lower-resolution
  request explicitly uses Flare/high/1k/9:16, count one, background omitted.
- Video: `kind: video`, `frames: []` for a planning quote or an ordered first/last
  pair. Mode is explicitly image-to-video, duration five seconds, resolution
  the explicit top-level `resolution: 720p | 1080p`, aspect ratio 9:16.
  Omission retains historical 1080p; revised lower-resolution requests pass 720p. Each frame binds owned Media ID, actual byte SHA-256,
  confirmed provider media UUID, connection and account generation. URLs cannot
  replace provider media IDs.

After the exact source/request is reviewed and the operator call is authorized:

```bash
node scripts/operations/hgg-qualification-reads.cjs \
  --mode quote --stand "$CF_TASK_STAND" \
  --qualification "$CF_TASK_QUALIFICATION" --output "$CF_TASK_QUOTE_OUTPUT" \
  --expected-source "$CF_TASK_SOURCE_SHA" \
  --request "$CF_TASK_QUOTE_REQUEST" --request-sha256 "$CF_TASK_REQUEST_SHA256" \
  --image-detail "$CF_TASK_IMAGE_DETAIL" --video-catalogue "$CF_TASK_VIDEO_CATALOGUE"
```

All file arguments are absolute. Existing operator checks require a clean exact
source, the managed loopback stand, its signed active administrator session and
current grant/generation. Tokens are never refreshed by this command. Metadata
responses retain the finite 8 MiB budget; the quote response has a 1 MiB cap and
20-second response deadline, inside the finite 180-second operator session.

Artifacts are private, created once outside the repository. An attempt marker
prevents automatic replay, including after a partial failure. Parsed raw provider
output is retained before semantic quote validation; transport/SDK failures can
leave only the attempt and safe failure diagnostics. A changed request requires
a new reviewed attempt, never an automatic retry.

Any provider adjustment or differing prepared parameter stops the quote. Errors,
allowance choices and unexpected jobs stop without recovery/purchase/submit calls.
The accepted result retains both native finite credit values, including fractions, without
inventing a native expiry, upper bound, charged pool or actual charge. All results
keep `inputValidated`, `canSubmit`, `generationReady` and `paidSubmitEnabled` false,
even if provider media-presence checks pass. The response is never launch approval.

The receipt-bound plural `jobs_wait` mapper is a pure future contract only; this
profile has no polling transport or paid-submit builder. `lookup_failed` stays
unknown, completed outputs require separate byte/media validation, and the mapper
never permits resubmission. Automatic frame generation, durable image intents,
actual multimodal pair review, same-transaction parent checks, finite owner budget,
funding qualification and any paid execution remain separate integration work.
