# Synthetic subscription protocol fixtures

The OAuth issuer, account subject, MCP tool names, schemas, eligibility,
credit quotes and responses in this directory are **invented local contracts**.
They are not captured Higgsfield or HeyGen account responses. The reviewed
production schema digest allowlists remain empty and production subscription
runtime definitions remain disabled.

The fixtures exercise the actual pinned MCP SDK against an owned loopback HTTP
server. Tool schemas are hashed through the application's canonical
`subscriptionHash`, sorting `{name,inputSchema}` by name. Unexpected endpoint
origins are refused before transport. Only synthetic opaque access/refresh
tokens are issued. Counters distinguish quote, submit, poll and refresh.

For result ingestion, reuse the unchanged CC0 MP4 and provenance in
[`../video-v1/README.md`](../video-v1/README.md). No media renderer is used.
Nothing here establishes real account access, pricing, billing guarantees,
subscription terms, live tool compatibility, sample quality or trial quota.
