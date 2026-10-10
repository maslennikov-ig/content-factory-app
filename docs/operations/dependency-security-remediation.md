# Dependency security remediation — 9 October 2026

Scope: Beads `content-factory-next-dbxe.8`, local changes only. The original
acceptance criteria and all other epic tasks remain unchanged.

Baseline official production-lock lookup:12 critical /131 high records.
Exact locked remediation eliminates120 of143 baseline records; the remaining
2 critical /21 high production records have current-consumer exceptions.
The complete shipped graph includes dev/build tools:5 critical /21 high remain.
These counts are advisory/range records, not incidents or exploited paths.

## Versions and compatibility

| Package | Before -> selected | Actual consumer / verification |
| --- | --- | --- |
| `@babel/plugin-transform-modules-systemjs` | 7.29.0 -> 7.29.4 | shipped-build: Babel/extension compiler; no external code compilation service. Next/extension builds. |
| `@grpc/grpc-js` | 1.14.3 -> 1.14.5 | runtime: Temporal client/worker gRPC transport; trusted service schemas. tests/dependency-security.compatibility.test.cjs + Temporal contract guards. |
| `@modelcontextprotocol/client` | 2.0.0 -> 2.2.0 | runtime-conditional: @mastra/mcp 1.18.0 MCP client; OAuth target trust depends on configured server. MCP SDK against in-process product routes: tests/mcp.e2e.test.cjs. |
| `@modelcontextprotocol/sdk` | 1.27.1, 1.30.1 -> 1.31.0 | runtime: libraries/nestjs-libraries/src/chat/start.mcp.ts and @mastra/mcp use actual MCP SDK. tests/mcp.e2e.test.cjs + mcp-oauth/server. |
| `axios` | 1.14.0 -> 1.20.0 | runtime: posts.service.ts and social providers; HTTP downloads/multipart uploads. actual loopback upload/gzip + webhook delivery tests. |
| `brace-expansion` | 1.1.12, 2.0.2, 5.0.4 -> 1.1.20, 2.1.6, 5.0.11 | shipped-build: minimatch tool patterns, separate1.x/2.x/5.x lines. installed imports and all builds. |
| `browserslist` | 4.28.1 -> 4.28.7 | shipped-build: Babel/webpack/autoprefixer repository target configuration. Next/extension builds. |
| `compression` | 1.8.1 -> 1.8.2 | runtime: apps/backend/src/main.ts: HTTP compression and NDJSON filter. actual gzip round trip + stream tests. |
| `fast-uri` | 3.1.0 -> 3.1.7 | runtime-conditional: AJV schema validation dependency. MCP input/policy tests + builds. |
| `fast-xml-builder` | 1.0.0 -> 1.1.7 | runtime: AWS fast-xml-parser5 dependency. XML parser installed-parent probe + application builds. |
| `fast-xml-parser` | 4.5.4, 5.4.1 -> 4.5.5, 5.5.6 | runtime: source-parser.ts and community-topic-discovery.service.ts (4.x); AWS XML builder (5.x). actual 4.x/5.x parse + source registry/fetch gateway. |
| `flatted` | 3.3.4 -> 3.4.2 | shipped-build: eslint/file-entry-cache serializes local trusted cache files. installed imports and builds. |
| `form-data` | 2.3.3, 3.0.4, 4.0.5 -> 2.5.6, 3.0.5, 4.0.6 | runtime: request (Telegram), axios, transloadit and direct provider imports use different major lines. actual parent-resolved randomness and CRLF probes + upload round trip. |
| `handlebars` | 4.7.9 -> 4.7.10 | runtime-conditional: @langchain/classic templates and ts-jest; no product-supplied untrusted AST/options found. actual malicious AST rejection and ordinary string rendering. |
| `hono` | 4.12.10, 4.12.5 -> 4.12.25 | runtime-conditional: Mastra server/MCP packages; vulnerable CORS defaults depend on middleware configuration. MCP product route end-to-end and builds; no claim of previously reachable wildcard credential CORS. |
| `http-cache-semantics` | 4.2.0 -> 4.3.0 | runtime-conditional: cacheable-request transitively in SDK/toolchain. locked parent resolution, affected provider/source tests and builds. |
| `immutable` | 5.1.5 -> 5.1.8 | shipped-build: Sass dependency, repository stylesheet inputs. Next frontend build. |
| `ip-address` | 10.1.0 -> 10.3.1 | runtime-conditional: socks/express-rate-limit dependency. installed parent resolution, HTTP/SSRF tests and builds. |
| `js-cookie` | 3.0.5 -> 3.0.6 | shipped-build: js-beautify dependency; not the product session cookie reader. editor/formatting checks and frontend build. |
| `js-yaml` | 3.14.2, 4.1.1 -> 3.15.2, 4.3.2 | runtime-conditional: Nest Swagger and LangChain plus trusted build configuration, separate3.x/4.x lines. application/MCP imports and all builds. |
| `linkify-it` | 5.0.0 -> 5.0.2 | runtime-conditional: markdown-it transitively in formatting/tool packages. rich-text/editor checks and frontend build. |
| `lodash` | 4.17.23 -> 4.18.0 | runtime: product helpers including images.slides.ts; template imports are not exposed by current source. ordinary affected product tests and application builds. |
| `multer` | 1.4.5-lts.2, 2.1.1 -> 2.3.0 | runtime: Nest multipart routes and brand-voice.upload.ts; direct1.x and Nest2.x consolidated into2.3. actual nested-field/buffer/size error HTTP test + voice/material/upload tests. |
| `nanoid` | 3.3.11, 5.1.6 -> 3.3.18, 5.1.16 | runtime: Uppy frontend identifiers and PostCSS compiler, retained3.x/5.x lines. frontend upload/editor tests and build. |
| `next` | 16.2.6 -> 16.3.8 | runtime: Linux Node22 Bookworm image; next start App Router, static local rewrites; no custom server, next/og or configured remotePatterns. Next frontend build and loopback login/image rejection smoke; patched AVIF/libheif path conservatively. |
| `nodemailer` | 7.0.13 -> 10.0.6 | runtime: node.mailer.provider.ts uses createTransport(password SMTP) and text/HTML sendMail, no raw/OAuth options. actual no-network streamTransport message/envelope + email configuration tests. |
| `path-to-regexp` | 8.3.0 -> 3.3.0, 8.4.0 | runtime: Nest controllers and Express router. MCP/access HTTP route tests and backend build. |
| `picomatch` | 2.3.1, 4.0.3 -> 2.3.2, 4.0.4 | runtime-conditional: Mastra workspace skill matching (4.x), file toolchain (2.x); scope both patched lines. installed resolution + affected agent/editor checks and builds. |
| `piscina` | 4.9.2 -> 4.9.4 | shipped-build: @swc/cli worker pool uses repository-owned input; no product worker pool. all application builds; patched4.9.4 before acceptance. |
| `postcss` | 8.4.31, 8.5.8 -> 8.5.18 | shipped-build: Next/Tailwind/Sass CSS pipeline, including direct dev8.4.38. Next build and affected frontend checks. |
| `probe-image-size` | 7.2.3 -> 7.4.0 | runtime-conditional: @mastra/memory image metadata dependency. installed parent resolution + actual media/Sharp checks and builds. |
| `prosemirror-view` | 1.41.6 -> 1.42.3 | runtime-browser: TipTap HTML editor; user/core/adaptation editing. actual TipTap adaptation-rich-text/inline-marks/emoji tests. |
| `protobufjs` | 7.5.4 -> 7.6.1 | runtime: Temporal/gRPC/OTLP serializers; application-defined schemas, no user descriptors. actual Temporal encode/decode + actual gRPC unary round trip. |
| `proxy-addr` | 2.0.7 -> 2.0.8 | runtime-conditional: Express req.ip via proxy-addr; app does not configure vulnerable mapped trust subnet. actual mapped-subnet spoof regression and backend routes. |
| `rollup` | 2.79.2 -> 2.80.0, 4.59.0, 4.62.4 | shipped-build: Vite/plugin/transpiler build graph; separate2.x line. extension Vite build. |
| `sharp` | 0.33.5, 0.34.5 -> 0.35.5 | runtime: posts.service.ts, social.abstract.ts, LinkedIn/Bluesky/X providers; uploaded image metadata/resizing. actual native PNG/JPEG conversion + LinkedIn real PDF/media checks. |
| `shell-quote` | 1.8.3 -> 1.11.0 | shipped-build: Mastra CLI / concurrently quoting; no product shell command assembled from object operators. actual object/operator and comment-followed-by-newline rejection; ordinary quote/parse. |
| `source-map-js` | 1.2.1 -> 1.2.2 | shipped-build: PostCSS/Sass/compiler maps of repository-owned code. frontend/backend/commands/orchestrator builds. |
| `svgo` | 3.3.3 -> 3.3.5 | shipped-build: @svgr/webpack optimizes repository SVG, not client uploaded SVG. Next frontend build. |
| `undici` | 7.22.0, 7.25.0, 7.29.0 -> 7.29.1 | runtime: explicit SSRF-safe dispatcher; SDK/cheerio/jsdom7.x copies. source-fetch gateway loopback/TLS tests, SSRF/webhook tests and MCP E2E. |
| `vite` | 6.4.1 -> 6.4.3 | shipped-build/dev: apps/extension vite build; production image does not start Vite dev server. actual extension build; Linux/Windows developer path range patched6.4.3. |
| `ws` | 7.5.10, 8.18.3, 8.19.0 -> 7.5.11, 8.21.0 | runtime-conditional: SDK/WebSocket transport;8.x and jayson7.x; peer-only isomorphic-ws keeps broad contract. MCP SDK product E2E and installed imports/builds. |

Scoped overrides retain parallel form-data2/3/4, XML Parser4/5, ws7/8 and
other declared major lines. Direct XML Parser stays4.5.5; AWS uses5.5.6.
ws7 is scoped to jayson, preserving broad WebSocket peer contracts. Next16.3.8
and eslint-config-next align; React19.2.4, Prisma6.5.0, Nest11 and Temporal1.15
stay on their existing lines. Sharp0.35.5, Multer2.3.0 and Nodemailer10.0.6
are the necessary API-compatible transitions: actual native conversion, Nest
multipart buffer/nested fields/limit errors and SMTP message/envelope are checked.
All selected engines support Node22.23.2; pnpm10.6.1 is unchanged.

Release packaging disables `experimental.turbopackFileSystemCacheForBuild` in
Next config. The installed Next16.3.8 compiler enables its persistent build cache
by default; the first release candidate copied322MiB of compiler state into the
runtime image and failed the unchanged25% image-weight gate. Release containers
do not reuse that build state. Development caching and compiled server/static
assets retain their existing behavior. This is the documented
[Next build-cache option](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache),
not a change to the weight threshold or application data retention. The corrected
candidate requires a new exact-commit release receipt and a measured native image.

## Retained exceptions and reevaluation triggers

These are applicability decisions for inspected callers, not removed findings.
New callers/configurations invalidate the corresponding decision.

| Package / locked version | Current evidence | Reevaluate when |
| --- | --- | --- |
| `happy-dom` 15.11.7 | shipped-build/test: @wyw-in-js/transform0.5.5 optional VM feature and Vitest3.1.4 test environment; no imports in apps/libraries and no Happy DOM handling of user HTML/scripts. Next config has no Pigment/WYW plugin. Current Jest uses jsdom/node. [GHSA-37j7-fg3j-429f](https://github.com/advisories/GHSA-37j7-fg3j-429f), [GHSA-6q6h-j7hj-3r64](https://github.com/advisories/GHSA-6q6h-j7hj-3r64), [GHSA-w4gp-fjgq-3q4g](https://github.com/advisories/GHSA-w4gp-fjgq-3q4g) | Reassess before enabling happyDOM feature, running untrusted tests/scripts or moving it into product SSR. Upgrading15->20+ would cross a dormant parent contract. |
| `tar` 6.2.1 | native-install-only: Only @mapbox/node-pre-gyp1.0.11 (bcrypt/canvas) installs vendor native archives; no product tar import/extract/update route. Installer paths/options originate in locked package metadata. Runtime starts three native apps and nginx, not installer. Windows drive-relative and macOS APFS cases additionally do not match Linux runtime. [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v), [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx), [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97), [GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w), [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256), [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96), [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m), [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) | Reassess any customer-controlled archive extraction or untrusted binary_host/local tar override.7.5.21 is outside declared6.x parent range; do not force major solely to erase a counter. |
| `braces` 3.0.3 | shipped-build/test: chokidar/micromatch under Tailwind/Jest/fast-glob use repository-owned file patterns. Runtime Mastra workspace matching uses patched picomatch, not braces; no product input to braces/micromatch/fast-glob found. Official advisory has no patched version. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Reassess user-supplied glob patterns/build jobs or an upstream branch fix. |
| `basic-ftp` 5.2.0 | dormant-sdk-tool: Only get-uri6 under pac-proxy-agent/proxy-agent under @neynar/nodejs-sdk -> @openapitools/openapi-generator-cli. Product imports generated Neynar client, does not execute generator or configure FTP/PAC URI input. Source fetch paths accept public HTTPS and explicit safe dispatcher, not FTP. [GHSA-6v7q-wjvx-w8wg](https://github.com/advisories/GHSA-6v7q-wjvx-w8wg), [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r), [GHSA-chqc-8p9q-pq6q](https://github.com/advisories/GHSA-chqc-8p9q-pq6q), [GHSA-rp42-5vxx-qpwr](https://github.com/advisories/GHSA-rp42-5vxx-qpwr), [GHSA-rpmf-866q-6p89](https://github.com/advisories/GHSA-rpmf-866q-6p89) | Reassess enabling FTP/PAC transport or runtime generator; minimum6.2.1 is outside get-uri declared5.x range. |
| `cross-spawn` 5.1.0 | shipped-native-tool: Vulnerable5.1.0 only bin-check4.1.0 -> execa0.7.0 under @swc/cli -> bin-wrapper; fixed SWC binary check command. Runtime MCP uses non-vulnerable7.0.6. Windows-oriented path escaping has no user-supplied command at this caller. [GHSA-3xgq-45jj-v275](https://github.com/advisories/GHSA-3xgq-45jj-v275) | Reassess user-controlled commands/native tool selection.6.0.6 is outside old execa5.x contract. |
| `music-metadata` 7.14.0 | runtime-inapplicable-parser: Only images.slides.ts:getAudioDuration calls parseBuffer(buffer, "audio/mpeg") on ElevenLabs MP3 response. Installed7.14.0 ParserFactory resolves MIME to mpeg before content sniff; vulnerable ASF parser cannot be selected at this caller. No parseFile/other parseBuffer consumer. [GHSA-v6c2-xwv6-8xf7](https://github.com/advisories/GHSA-v6c2-xwv6-8xf7) | Reassess MIME removal/change or ASF ingestion; upstream advisory names11.12.3, whereas registry range currently stops11.12.1. Do not infer11.12.2 is accepted from range alone. |
| `@nestjs/microservices` 11.1.21 | unused-transport: All app entrypoints verified: Nest HTTP backend, Temporal module worker, command app. No createMicroservice/connectMicroservice or Transport.TCP/RMQ listener/caller in apps/libraries. A package import/peer is not a TCP/RabbitMQ listener. [GHSA-m8vh-jmq9-5rjg](https://github.com/advisories/GHSA-m8vh-jmq9-5rjg) | Reassess enabling Nest TCP/RabbitMQ transport; coordinated Nest11.2.4+ update then proves that new consumer. |
| `@tiptap/core` 3.20.1 | runtime-inapplicable-helper: Current editor uses TipTap HTML/JSON, StarterKit/commands and product inline-mark conversion. No @tiptap/markdown, markdownTokenizer or createAtomBlockMarkdownSpec/createBlockMarkdownSpec/createInlineMarkdownSpec consumer in apps/libraries. Vulnerable Markdown attributes are not used. [GHSA-j95f-988m-3j2f](https://github.com/advisories/GHSA-j95f-988m-3j2f) | Reassess enabling these Markdown helpers. Patched3.30.5 requires exact matching @tiptap/pm and would expand sibling editor update; preserve existing3.20.1 contract. |
| `langsmith` 0.5.17 | runtime-inapplicable-prompt-pull: @langchain core/community/classic dependency; no LangSmith public prompt pull, hub.pull or manifest loader caller in apps/libraries. Tracing is not the public prompt-deserialization API cited by the advisory. [GHSA-3644-q5cj-c5c7](https://github.com/advisories/GHSA-3644-q5cj-c5c7) | Reassess adding remote prompt/hub loader;0.6.0 crosses the0.5 minor contract. |
| `vitest` 3.1.4 | shipped-unused-test-ui: Dev-only Vitest3.1.4 is copied by Dockerfile but root scripts/test acceptance use Jest, node:test and unittest. Native production processes do not launch Vitest UI/API/browser server. Linux runtime also does not match the Windows UI path precondition. [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | Reassess enabling/exposing Vitest API/UI or Windows browser tests;3.2.6 is vendor-patched for that surface. |
| `tinypool` 1.1.1 | shipped-unused-test-worker: Only Vitest3.1.4 uses tinypool1.1.1. No product worker or test command invokes this pool; current tests use Jest, node:test and Python. No untrusted code is run in this dormant test pool. [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | Reassess Vitest adoption or any product worker consumer. Minimum2.1.2 crosses declared1.x; no force override of an unused worker contract. |

## Official evidence and verification

Each critical/high record has the exact baseline and current locked versions,
range, official advisory link, consumer, platform/trigger and check in
`.codex/stages/content-factory-next-dbxe-dependencies-stage/applicability.json`.
Selected package metadata comes from the official npm registry; no unbounded
pnpm metavulnerability expansion or audit heap increase. The bounded traversal
covers optional dependencies and aliases and has zero unresolved snapshots.

The repeat audit exposed a separate shell-quote1.9.0 comment/newline critical
advisory;1.11.0 is the minimum corrected version. This prevents stopping at
the first nominally patched advisory while another version remains vulnerable.
Lower-severity12 low /68 moderate production range records are still visible;
this bounded stage prioritizes critical/high and does not claim all advisories
are eliminated. Linux system libraries/image packages require the release scan.

## Acceptance and release

Local acceptance is recorded in the stage root receipt and acceptance-receipt.
It covers frozen install, actual library behavior, affected product tests, the
four production app builds and Vite extension build; it does not connect real
social accounts, publish posts, send email, run paid models or touch production.

Beads dbxe.8 remains in progress until its original next-release acceptance
criterion passes. The next authorized release must run the configured full
release checks and exact-commit suite receipt, build from the public copied tree,
check the resulting native image and active service, and retain verified rollback.
Do not deploy automatically or bypass the existing registry/source separation.
No Temporal workflow/activity signatures, persisted schema or credentials change.

Rollback before delivery: restore this stage manifest/lock and frozen-install
the previous dependency graph. Runtime image/data remain unchanged during this
local stage; the later release owns its image rollback proof.
