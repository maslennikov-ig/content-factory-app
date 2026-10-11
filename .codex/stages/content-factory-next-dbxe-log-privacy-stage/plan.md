# Ordinary-log privacy — dbxe.24

Root owns this bounded stage; no delegation has a concrete benefit.
Preserve the selected task and all30 original epic criteria. Beads is status truth.

1. Capture actual EmailService and MediaService console calls with synthetic
   recipient, subject, body, prompt, cookie and provider-payload sentinels.
2. Replace raw mail result/error/recipient and video customParams logging with
   fixed event/code, numeric attempt, boolean retryability and random opaque
   per-operation correlation. Never derive correlation from user/provider data.
   Keep provider arguments, delivery failures, retry count/timers, credit and
   storage behavior unchanged. Invalid-recipient error no longer echoes input.
3. Remove the reachable slide provider's generated-media payload log. No generic
   logger framework, global console interception, settings or retention changes.
4. Exercise success, transient failure/recovery/exhaustion, permanent rejection,
   malformed recipient, missing sender, disabled mail, video validation/provider/
   upload/persistence/credit failures; preserve public errors and replay contracts.
5. Root focused acceptance, docs/Beads/handoff, safe private source delivery.
   No new image/release is necessary for this local acceptance boundary. Record
   changed application source as pending delivery in existing release task29.
   Existing production34 remains unchanged; never label local proof as deployed.

## Technical Premortem

Verdict: GO WITH CONDITIONS. Privacy boundary: application values -> ordinary
stdout/stderr. Scope is the generic mail/video paths from original24.

| Failure | Evidence / mitigation / proof |
| --- | --- |
| Removing logs hides failure or changes retries | Confirmed raw error previously logs then rethrows; retain exact thrown provider object, retryable flag,3 attempts/700ms and safe outcome codes; behavioral fakes |
| Error/code/id contains private input | Confirmed malformed recipient interpolation and arbitrary SDK properties; use constant codes and randomUUID only, no raw name/code/message/status/cause; adversarial nested/error sentinels |
| Video log claims success before upload/save completes | Plausible async boundary; log success only after the existing promise resolves, log fixed failure in catch and preserve generationError |
| Old workflows and SDK independently log mail values | Confirmed unchanged V1/V2/V3 dropped-mail logs; historical contracts cannot be edited, and global logging settings are excluded. Record a separate bounded Beads follow-up before closing original24; no universal stdout-privacy claim |
| Executor contacts real providers or reads customer logs | Avoid by mocked provider/storage/credit/repository and console capture; no real logs, account values or calls |

Recovery: roll forward the small log call sites if safe diagnostics regress;
never restore raw payload logging. Tests preserve failure visibility. No data,
queue, provider, retention or production mutation needs restoration.

Graph: focused local d724 EmailService/MediaService neighbors matched current
source hashes before edits; exact activity/controller/service sources inspected.
Existing Temporal bodies/signatures remain unchanged. No graph refresh is needed
for local call-site changes with no new application import topology except the
Node crypto builtin. No external extraction, hooks or query logging.
