# Higgsfield V1 submit recovery

Checked 2026-11-03 against the official model and shared API references. This
is documentation evidence plus synthetic transport testing, not account access,
funding verification or a generated-video acceptance receipt.

## Provider contract

- [Idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency): reuse the
  same key for the same endpoint, JSON, webhook and retention header after an
  ambiguous response. Object-key order is immaterial; array order, missing/null
  fields and URL changes matter. A parameter mismatch is 422; never manufacture
  a replacement key to bypass it. A replay yields the existing request ID;
  polling supplies the current result. The page gives **no key-expiration TTL**.
- [Webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks): the generation URL
  takes the HTTPS `hf_webhook` query parameter. This change preserves optional
  webhook configuration; it does not add an inbound receiver or trust unsigned
  delivery data.
- [Billing](https://docs.higgsfield.ai/docs/concepts/billing-and-retention): quote
  the exact model parameters through the account estimate endpoint. That quote
  does not document an enforceable charge ceiling. Successful requests are
  charged; failed/moderated requests and confirmed queued cancellations are
  refunded under the documented conditions.
- [Retention](https://docs.higgsfield.ai/docs/enterprise/data-retention): default
  files last seven days after completion. `Hf-Expires-After` can shorten this
  from 3600 seconds up to the account retention. The accepted receipt can report
  `expires_after`; terminal status reports `expires_at`. Expiration deletes
  files while preserving status and billing records. The
  [status schema](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status)
  has no documented settled-cost field.

The existing selected model endpoints and their explicit body fields were
rechecked, without widening the product route set:

| Existing model | Text endpoint reference | Image endpoint reference |
| --- | --- | --- |
| Wan 3.0 | [Text](https://open.higgsfield.ai/models/alibaba/wan-3.0/text-to-video/api-reference) | [Image](https://open.higgsfield.ai/models/alibaba/wan-3.0/image-to-video/api-reference) |
| Kling 3.0 Standard | [Text](https://open.higgsfield.ai/models/kling-video/v3.0/std/text-to-video/api-reference) | [Image](https://open.higgsfield.ai/models/kling-video/v3.0/std/image-to-video/api-reference) |
| Kling 3.0 Pro | [Text](https://open.higgsfield.ai/models/kling-video/v3.0/pro/text-to-video/api-reference) | [Image](https://open.higgsfield.ai/models/kling-video/v3.0/pro/image-to-video/api-reference) |

## Local behavior and limits

`VideoGenerationJob.request` stores optional `submission` settings and the
first-submit `submitRecovery` digest, original key and replay deadline. The
local policy allows one immediate retry for an ambiguous Higgsfield response,
within 60 seconds of the persisted submission timestamp. This short deadline
is our policy, not a provider TTL. Before retrying, the service rereads and
checks the stored request, metadata and payer/configuration identity. It never
re-quotes or changes a parameter/key to recover. Interrupted submissions after
restart remain uncertain, including legacy rows lacking this optional metadata.

A rejected replay cannot disprove acceptance of the first request. Such a job
retains uncertainty, unknown actual cost and its reservation. Neither a quote
nor an undocumented response charge becomes a settled cost. Existing budget
admission and provider-account pinning stay in their owning services.

Provider deletion time is persisted with the result. Saving an expired captured
URL first polls the existing receipt, permitting a refreshed available result.
An expired fresh result becomes `save_failed` without a file download or a new
generation. Save retries only poll/import; already-owned bytes attach even
after provider expiry. Actual account retention and settled billing still need
provider/account evidence.

## Focused verification

Node 22.23.2 / pnpm 10.6.1:

```sh
pnpm exec node --test tests/video-higgsfield-recovery.test.cjs tests/video-provider-v1.contract.test.cjs
git diff --check
```

Coverage includes full request replay identity, jsonb object reordering,
metadata/key/payload mismatch, the expired local deadline, rejection after an
ambiguous submit, legacy interrupted jobs, unknown actual cost, retention
refresh, expired missing output and already-owned files. No full suite, build,
real account request, paid generation or deployment is claimed by this stream.
