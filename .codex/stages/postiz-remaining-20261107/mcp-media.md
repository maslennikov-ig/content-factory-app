# T13: MCP media upload and attachment delivery

## Delivery and scope

Delivered locally in `codex/postiz-remaining-20261107`, Bead `content-factory-next-npyu.13`. Root integration/acceptance owns the final candidate. No commit, push, deployment, account connection, model call, or real-user message was performed.

The shared registry now exposes `media.upload`, `media.upload_ticket`, `media.upload_status` and `media.inspect` through MCP. `adaptation.image` accepts owned media IDs with post-local alt, owned cover ID or frame timestamp, and returns the actual member post preview URL plus an expiring media preview. T10 owns service/provider validation and propagation; T1/T2 owns the safe media reader. Existing publishing approvals and OAuth admission remain in place.

The widget is an isolated RU/EN MCP App at `ui://content-factory/media-upload/v1`. A client without MCP Apps receives a truthful waiting state and the existing `/media` manual-upload URL. A file attached only to another assistant is not claimed to be uploaded.

## Provenance

Read original GitHub sources via `gh api`, without adding a remote or copying the generic upstream tool layer:

- PR2099, merge `b9e80d05eee6f8dec13ecc477ca4bd98df8f977e`, head `2c29ea3eeb66c34698bb8d2ab45aec6fc539f8d3`: upload widget, ticket/status tools, controller, media-service session methods and MCP App resource registration. Adapted its user-selected upload concept to this repository's shared capability admission, actor ownership and existing uploader; no normalization/transcoding was introduced.
- PR1926, merge `07745d1a84ab59d5f50e28ccd75ef47f811617f9`, head `fd0480f7475cec02785eb1643db071272a094953`: media-list tool and its metadata caveats. Reused the existing owned library, deliberately excluding raw storage paths and unreliable inherited `type`/`fileSize` values. Library defaults are not misrepresented as per-post metadata.
- PR2175, merge `b6d4f3d5ea1fb506d1f8754e1929a1ebca8497da`, head `c1f824ce07416dbd28f798c2c80c0722134e1e8a`: attachment alt/thumbnail/timestamp and preview result. Adapted to owned media IDs and a private member preview instead of arbitrary URLs/public preview authority. Existing frame timestamps are milliseconds; zero is valid, null clears.
- Release target `a5affe62c74e39c1e7ac960d50d8418b807d532c` (v2.25.3) was read back. Its LICENSE is AGPL-3.0; repository licensing and attribution are preserved. No client data or secrets were copied.

## Authority, transport and memory bounds

- Sessions last 15 minutes and belong to one OAuth actor and organization. Ticket issuance passes the existing editor door/policy gate; activated user, live membership, current role and editor policy are rechecked before ticket use. Reads/preview also recheck active membership.
- Tickets last two minutes, are stored under a hash, and are atomically consumed once. A Redis NX binding fixes one selected filename, byte length and cryptographic file nonce for the session. Concurrent tickets cannot upload two files; another actor/workspace cannot poll or reuse the session. File content is measured on the server and returned as a SHA256 receipt; the nonce is not a pre-upload content-hash attestation.
- The widget sends the selected `File` directly in multipart form data. There is no base64/blob/buffer/URL/filesystem-path argument, and no whole-file `arrayBuffer()` or browser hashing allocation. The ticket lives only in host result `_meta` and a CORS-safelisted Accept parameter; it is absent from model-visible content, structured content, URLs and HTML. The sandbox uses `credentials:omit` and `referrerPolicy:no-referrer`; only this ticket route sets a wildcard non-credentialed CORS response.
- The upload interceptor claims before parsing, creates a private per-request temporary directory, and uses disk-backed multipart parsing with its file-size ceiling bound to the claimed byte length, one file and no text fields. Source sniffing, existing 10 MB image/1 GB MP4 ceilings, regular-file/symlink/mutation protections and 64 KiB streaming come from T2's `openDiskUploadV1`. SHA256 is streamed; `uploadFileFromDiskV1` streams to the configured existing storage. Temporary data is removed after success, validation/parser/storage error and interrupted requests. No unrelated directory or stored media is deleted.
- Status is `waiting`, `uploading`, `ready` or `failed`, based on actual uploader transitions. Ready requires the saved owned media row. Missing/deleted rows become unavailable; expired sessions do not imply success. There is no invented processing or normalization stage.
- Media previews are opaque five-minute grants stored under hashed keys, rechecking actor membership and live owned media at every read. Responses stream the safe owned media source with private/no-store, no-referrer and nosniff. Post preview URLs contain only the server-read post ID and use the member-protected existing preview route; no guest grant is minted.

## Installed SDK constraint

Installed `@mastra/mcp` is 1.18.0. It supports `appResources` and tool `_meta.ui`, but its HTTP tools/call serializer drops result-level `_meta`. The narrowly scoped `mcp-app-result.ts` bridge wraps registration of the low-level tools/call handler and appends private metadata after the original handler finishes. An AsyncLocalStorage scope carries the ticket separately; capability return values and the SDK's normal result logs never contain it. Upgrade shape changes fail closed. The real SDK client test verifies the complete HTTP envelope. Native tool construction now respects explicit capability entrances, so these MCP-only upload tools do not enter web chat.

## Files

- New service: `libraries/nestjs-libraries/src/chat/media/mcp-media-upload.service.v1.ts`.
- New transport: `apps/backend/src/api/routes/mcp-media.controller.ts` (controller and ticket interceptor). Root serially registered them and the service in `api.module.ts`.
- New App/registry files: `chat/ui/media-upload.widget.v1.ts`, `chat/capabilities/catalogue/media-upload.capabilities.v1.ts`, `chat/capabilities/mcp-app-result.ts`.
- Existing capability registry/types/index, Mastra/MCP adapters, `start.mcp.ts`, media-library guidance and `adaptation.image` declarations were extended. A narrow RU/EN recovery-code entry was added in `agent.copy.ts`; component inventory includes the sandbox widget.
- New `tests/mcp.media-upload.test.cjs` and `tests/helpers/mcp-media-upload.runner.cjs`; existing capability fixtures/entrance assertions and MCP USER read-list assertions were updated to cover the additive tools.

## Verification

Runtime for checks: Node 22.23.2, pnpm 10.6.1. No dependency installation, Prisma generation or shared build was run by this stream.

- `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/mcp.media-upload.test.cjs tests/agent-capabilities.registry.guard.test.cjs tests/agent-capabilities.adapters.test.cjs` — PASS, 3 suites, 316 tests, after disk/nonce correction.
- The controlled flow uses the actual MCP SDK HTTP client, product McpServers/capability adapters, production Nest ticket/upload/preview controller and actual disk sniff/stream helper. The actual widget resource script executes against that SDK and uploader. It verifies host-only metadata, upload/status/attach/member preview, foreign/deleted rows, active membership and editor-role loss, malformed argument no-echo, invalid bytes, ticket expiry, immutable file binding, simultaneous single-file claims, server SHA256, claimed-byte limit, disk-only transfer and cleanup on success/error/abort.
- Matching earlier affected checks passed: `tests/mcp.server.test.cjs`, `tests/mcp.e2e.test.cjs`, `tests/agent-capabilities.mcp-redaction.test.cjs` and `tests/agent-media.test.cjs`. Initial explicit-tool-list/fixture assumptions exposed by the new MCP-only entrances were corrected; their affected suites subsequently passed. No failed run is called green.
- `git diff --check` — PASS on the shared candidate at this delivery point.
- Root owns affected application types and integrated acceptance. Provider worker independently owns the actual local/R2 streaming-storage regression evidence.

## Limits and cleanup

No deployed/runtime/provider/account acceptance or actual Claude/ChatGPT iframe-host rendering is claimed. The executable widget protocol flow and real SDK transport are locally verified; actual host-specific rendering remains external acceptance. No full repository suite was requested or run by this stream.

Only test-created temporary upload directories are cleaned, and tests verify they are gone. Stored originals and other owners' edits remain intact. No worktree/process cleanup was performed on the shared checkout. Graph-reviewed: no local graph was present in the assigned/owner checkout; work stayed within explicit assigned paths and direct contract reads, with no graph generation or refresh.
