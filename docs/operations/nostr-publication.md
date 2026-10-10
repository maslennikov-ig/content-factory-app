# Nostr publication acknowledgement

The provider confirms only a positive relay `OK` for the exact signed event ID.
An older author's event, `EOSE`, a different ID or a rejected/malformed response
cannot produce `completed`. This follows the acknowledgement contract in
[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): subscription
results and end-of-stored-events messages are separate from publication replies.
A positive duplicate acknowledgement is valid for that same event.

Existing HEX credentials are decoded to a 32-byte signing key. The signed author
must match the channel before opening a connection. Post/comment response fields
stay compatible: local `id`, signed-event `postId`, Primal event URL and
`completed`. Media formatting and existing reply/author tags are preserved.
No credential migration or new setting is needed.

The provider signs once and sends that same event to the existing five relays.
At least one matching positive acknowledgement confirms publication; later
failures do not erase it. Each relay has a six-second deadline covering connection
and acknowledgement. Every owned socket is terminated on success, refusal,
transport error, premature close or timeout, including sockets still connecting.
Installed nostr-tools2.23.3 does not close CONNECTING sockets through Relay.close;
the small provider-local exchange uses the existing ws8.21.0 package directly.
Metadata/profile discovery still uses the existing SimplePool. No subscription
or new transport framework is involved in publishing.

If every relay fails to acknowledge, the provider throws the fixed
`Nostr publication not acknowledged` error. Raw transport errors, response
reasons, event bodies or keys are not logged by this exchange. Absence of an
acknowledgement is **not proof that no relay stored the event**.

Current V106 publication claims (also used by V107/V108) mark that outcome
uncertain and refuse another provider invocation. A later relay attempt within
the original call always reuses its timestamp, event ID and signature; it does
not create another event. Confirmed activity retries read the stored receipt.
No cross-invocation cache, automatic resend or historical reconciliation is
added. Use the existing [publication recovery procedure](publication-recovery-v106.md)
to inspect/reconcile a pending publication without resending it.

Temporal source contracts and historical retry policies remain unchanged.
Future delivery must retain the existing journal-schema/current-starter/recovery
loop gates under dbxe.8. No old post is automatically republished to correct its
previous receipt. A fresh explicit provider call can sign a new event, so an old
workflow's retry policy is not a promise of durable same-event replay.

Local acceptance uses actual installed signing, controlled protocol/deadline
cases, actual ws against disposable loopback relays, and actual V106 logic with
memory persistence. This proves our acknowledgement/cleanup/claim boundary;
public relay availability, live acceptance, native Temporal execution and
deployed storage remain separate release checks. No schema or live service was
changed. Stage: `.codex/stages/content-factory-next-dbxe-nostr-identity-stage/`.
