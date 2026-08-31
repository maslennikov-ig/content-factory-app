# Design evidence: content-factory-next-ry5.4

Проверено 2026-08-18 по первичным источникам.

- GlitchTip install/config: https://glitchtip.com/documentation/install/ — PostgreSQL 14+, 512 MB recommended, 256 MB all-in-one minimum, Valkey optional; current retention variables and defaults.
- GlitchTip official sample: https://glitchtip.com/assets/compose.sample.yml — `glitchtip/glitchtip:6`, all-in-one, low-RAM switches for Valkey/logs/uptime.
- GlitchTip Next.js SDK: https://glitchtip.com/sdkdocs/javascript-nextjs/ — separate client/server/edge config; low/zero tracing is supported.
- GlitchTip Node SDK: https://glitchtip.com/sdkdocs/node/ — Sentry-compatible Node SDK; sessions are unsupported and must be disabled.
- GlitchTip backend release: https://gitlab.com/glitchtip/glitchtip-backend/-/tags — current release `v6.2.6`; Docker manifest for `glitchtip/glitchtip:6.2.6` exists.
- Sentry JS security advisory: https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-6465-jgvq-jhgp — sensitive headers issue fixed in `10.27.0+`; chosen SDK is `10.70.0` from the npm registry on 2026-08-18.
- Self-hosted Sentry resources: https://github.com/getsentry/develop/blob/master/src/docs/self-hosted/index.mdx — minimum 4 GB, recommended capacity above the available shared-host margin.

`orch-prompts docs-resolve` for the previous `@sentry/nestjs`/`@sentry/nextjs` 10.26.0 returned `fallback-needed`: its local L1 source was missing or floating and exact download was unavailable. The implementation therefore uses current first-party GlitchTip/Sentry sources and validates the installed 10.70.0 exports/types rather than trusting recalled APIs.

License provenance: GlitchTip backend `v6.2.6` publishes an MIT license in its official GitLab tag; both selected Sentry SDK packages report MIT and the official `getsentry/sentry-javascript` repository. The configuration and SDK dependency are compatible with the repository's AGPL-3.0 distribution; no donor or non-releasable implementation code is copied.

Local comparison: `deploy/production/docker-compose.yaml` caps the app, product PostgreSQL, Redis and Temporal at 1792/512/192/768 MiB and describes a shared host. Existing admin stats use a 30-day default (`apps/backend/src/api/routes/admin.controller.ts`). The ignored local Graphify artifact is absent in this worktree, so architecture was confirmed by direct source reading; no graph refresh or external semantic backend was used.

The official Next reference makes direct browser delivery possible, but it does
not remove connection metadata: collector ingress and its reverse proxy still
see the visitor IP and User-Agent. The branch therefore uses only the documented
Next server/edge entrypoints. Direct browser capture is rejected until a
first-party relay or equivalently proven privacy-safe ingress exists
(`content-factory-next-ry5.10`).
