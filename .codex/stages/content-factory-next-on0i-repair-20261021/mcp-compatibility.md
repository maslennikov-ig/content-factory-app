# MCP compatibility decision

**Keep the intentional `@mastra/mcp@1.18.0` compatibility pin in this repair.** The package was assessed against published 2.4.1; this is not an overlooked available update. No dependency or application source was changed for this assessment.

The published 2.4.1 package has a compatible Core peer (`>=1.76.0-0 <2.0.0-0`), but it changes the server wire contract. Its `dist/server/server.d.ts` declares MCP revision 2026-07-28 only and rejects requests without that envelope. Its `MCPServerHTTPRequestOptions` has request-security options rather than the former `serverless` option. These declarations were read directly from the [immutable published 2.4.1 tarball](https://registry.npmjs.org/@mastra/mcp/-/mcp-2.4.1.tgz), alongside current `pnpm view` metadata; the package was not installed.

Concrete current consumers:

| Product/test boundary | Current contract | Consequence of a package-only update |
| --- | --- | --- |
| `libraries/nestjs-libraries/src/chat/start.mcp.ts`, `McpServers.serverFor` | `MCPServer` with role-filtered capability tools and server-built identity through `mapAuthInfoToUser` | This is an externally served MCP server; newer client-side fallback support does not preserve its old server protocol. |
| Same file, `McpServers.handle` | `startHTTP({ req, res, httpPath: '/mcp', options: { serverless: true } })` | 2.4.1 removes this option from the public HTTP options type. |
| `tests/helpers/mcp-e2e.runner.cjs`, `rpc` | JSON-RPC requests with `mcp-protocol-version: 2025-06-18` | 2.4.1's v2-only server does not accept this existing client contract. |
| `libraries/nestjs-libraries/src/chat/capabilities/mcp.adapter.ts` | Actual capability policy/confirmation boundary plus input/error redaction hardening | Its existing client-facing refusal and consent checks remain required; no adapter change was made. |

The [official migration guide](https://mastra.ai/reference/migrations/mcp-v2) explicitly supports retaining 1.x with current Core when serving older clients. It documents removal of the old handshake/session semantics and the changed HTTP options. The [upstream major-release notes](https://github.com/mastra-ai/mastra/releases/tag/%40mastra%2Fcore%401.68.0) likewise identify the v2 server as a breaking protocol migration.

The [2.4.1 changelog](https://raw.githubusercontent.com/mastra-ai/mastra/main/packages/mcp/CHANGELOG.md) fixes malformed external tool schemas entering `MCPClient`. The product integration inspected here uses `MCPServer` and does not instantiate `MCPClient`, so that patch does not supply a direct server-side benefit for this repair. The currently pinned 1.18.0 peer range accepts Core 1.78.0.

This completes the requested compatibility assessment while preserving existing MCP clients. It does not claim that 2.4.1 was runtime-tested or upgraded. Research used the installed package, published tarball declarations, npm registry metadata, Context7 `/mastra-ai/mastra` and primary upstream documentation only. No paid call, production access, dependency install, commit, push or deployment occurred.
