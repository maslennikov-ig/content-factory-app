# dbxe.18 — acknowledged Nostr event identity

Owner-selected bounded local stage, 10 October 2026. Baseline
`de533317b9cd8ff9a970ca7d5c915a2008b27ca4`. Root owns code, proof and closeout;
no extra agents. Beads owns status; only .18 is selected. Epic and .8 stay open.

## Original criterion (verbatim)

Only matching acknowledged signed event produces completed with its ID; older events, all failures and empty EOSE cannot report success. Connections close, comments retain linkage, uncertain retry uses same event where protocol permits. No historical auto-republish or real relay calls required for local acceptance.

## Specification and implementation

1. Preserve all 30 original criteria, 35 Temporal source hashes and the signature
   baseline. Reproduce old-event/empty-ID false success before changing code.
2. Sign once per post/comment with the existing HEX credential decoded to a
   32-byte key; confirm the signer matches the channel before opening a socket.
   Keep provider responses, media formatting and reply/author tags compatible.
3. Replace the author subscription with a provider-local NIP-01 EVENT/OK exchange.
   Only a boolean true OK with the signed event ID and string reason acknowledges
   publication. EVENT/EOSE, other IDs and malformed replies cannot confirm it.
   Preserve all five relay targets and existing fanout; one matching acceptance
   suffices. Every attempt sends the same signed event, including fallback after
   an ambiguous response. All failures throw a fixed error instead of completed.
4. Use the existing ws package with a six-second connection-plus-acknowledgement
   deadline and terminate the one-shot socket on every outcome. Installed
   nostr-tools2.23.3 Relay.close leaves CONNECTING sockets alive; no SDK upgrade,
   private-field access, generic transport abstraction or credential rewrite.
5. Focused root acceptance: actual installed signing plus synthetic protocol
   cases, real ws against disposable loopback relays, and the unchanged actual
   V106 publication claim/receipt path. Test negative/malformed/old acknowledgements,
   lost acknowledgement fallback, cleanup, comments and safe error material.
   Check affected TypeScript consumers, docs/diff and immutable Temporal sources.
6. Update operations/navigation/handoff, close only .18 and make a scoped local
   commit. No full suite/build, push/deploy, public relay, schema or customer data.

Uncertain retry means same-event fallback inside this call. Current V106/V108
claims suppress a fresh provider invocation after an uncertain result; do not add
a cache, timestamp persistence or automatic recovery. Historical workflow retry
policies stay unchanged, with no historical auto-republish in this stage.

## Compact premortem — GO

| Risk | Evidence / mitigation | Owner |
| --- | --- | --- |
| Old/empty event appears completed | Confirmed author-query bug; exact signed-ID OK and negative protocol cases | root |
| No usable signature | Actual SDK rejects stored HEX string; decode and verify actual cryptography | root |
| Sockets/timers survive failure | Confirmed installed CONNECTING close gap; owned socket/deadline, all-path cleanup proof | root |
| Ambiguous send creates another event | Sign once for relay fanout; existing uncertain claim refuses a new invocation | root |
| Executor changes Temporal contracts or overstates fixture | Immutable 35-file/signature check, exact diff, local-only outcome | root |

graph-reviewed: used — focused NostrProvider orientation from stale46ec4108;
provider/base/manager hashes match; current callers inspected. No refresh,
external extraction or hooks. Relevant documentation: NIP-01 and installed SDK/ws
source; live relay acceptance remains outside this local boundary.
