# Production Delivery Receipt — `content-factory-next-on0i` (`aeb7cfe2cf50`)

## 1. Release Identity

- **Date (UTC)**: `2026-10-20`
- **Owner Authorization**: Explicit `"Push, Merge, Deploy."` (2026-10-20)
- **Epic & Scope**: `content-factory-next-on0i` (`on0i.1`–`on0i.7`, `A1`–`A31`) + `content-factory-next-rafo` (sidebar chat navigation)
- **Private Source Commit (`maslennikov-ig/content-factory-next`)**: `acfd770aba75600939e727be27d5bafe62020a81` (`acfd770aba75`, merged to `main` and pushed to `origin`; follows initial `5180155733f4`/`41e8e56a56a0` with disposable `postgres:17-alpine` fallback in test probes `agent-durable-recovery` and `agent-native-history` for CI runners without `127.0.0.1:5433`)
- **Public Tree Commit (`maslennikov-ig/content-factory-app`)**: `aeb7cfe2cf5054fcff73a231497efbbbd6c9310c` (`aeb7cfe2cf50`)
- **Production Image (`ghcr.io/maslennikov-ig/content-factory-next:aeb7cfe2cf50`)**:
  - Registry Manifest Digest: `sha256:1c4a9479bce534f1e007390487b96ed5487a94c97907c027d854265a9dec1d10`
  - Runtime Image Config ID: `sha256:b3b10ca7c1810ce3dda68f1474ffe680faa0abf344ff3b4cd6531c33a4065f69`
- **Corresponding Source Archive (`/api/public/source/archive`)**:
  - Bytes: `13099261`
  - SHA-256: `86a45ed9b13af7528b4d2f1a01f3587e7e70fad218c5d71ff473cba90950351d`
- **Verified Rollback Target on Host**:
  - Tag: `dd89af1b4a29`
  - Config: `sha256:b69ad9e702c4572d25ad209ea796ea5b715381aba8a3ff0fd2934051cd2afc59`
  - Rollback Command: `CF_DEPLOY_HOST=helixa-prod scripts/release/switch-host-image.sh dd89af1b4a29`

## 2. Suite & Build Verification

- **`scripts/release/record-suite-receipt.sh`** on `acfd770aba75600939e727be27d5bafe62020a81` (and earlier `5180155733f4311346fdc7cd3f42bcc0d407ee70`):
  - Jest: `704 passed`, `7 skipped`, `0 failed` (`12,660 passed`, `70 skipped`, `0 failed` tests)
  - Node `--test`: `126 passed`, `4 skipped`, `0 failed`
  - Python `unittest`: `50 passed`, `0 failed` (`OK`)
- **Image Pre-Push Gates**:
  - `scripts/release/verify-nginx-config.sh content-factory-next:aeb7cfe2cf50`: PASS
  - `apps/commands --help` inside container against dev PostgreSQL/Redis: PASS (5 commands printed, exit 0)
  - Weight check (local & registry compressed): `0.70 GB` vs `0.70 GB` (`0%` delta, within `25%` budget)

## 3. Production Database & Mastra Storage Upgrade (`R1`–`R5`)

- **R1 (Pre-Upgrade Backup)**: `/var/backups/content-factory-next/postgres/20261020T061226Z`
- **R2–R4 (`deploy/production/upgrade-mastra-storage.sh`)**:
  - Upgraded Mastra separate database (`45 -> 47` tables for `@mastra/pg` `1.31.2`: added `mastra_memory_run_fences`, `mastra_workflow_run_owners`, and 7 nullable columns)
  - Rows preserved: `threads=34`, `messages=342`, `experiments=0`, `experiment_results=0`, `datasets=0`, `dataset_items=0`
  - Invalid indexes: `0` before, `0` after
  - Canonical fingerprint before (`45` tables): `a8cdfd9101f62ed7316e5744611007ba055adc50be740cba23fe71b007d47d97`
  - Canonical fingerprint after (`47` tables): `a71e1b3535b5a871c523624edbb84318e5b295f2b7971292d9cc45dae4fe8cf0` (exact match to runbook reference)
- **R5 (`scripts/operations/check-postgres-role-isolation.sh`)**: PASS (`PostgreSQL role isolation preflight passed.`)
- **Product Prisma Schema Preflight (`scripts/release/schema-preflight.sh aeb7cfe2cf50`)**:
  - Before switch: `{"ok":true,"diffExitCode":0,"sqlLines":0,"schemaApplied":false,"prismaVersion":"6.5.0","engineVersion":"173f8d54f8d52e692c7e27e72a88314ec7aeff60","engineSha256":"431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2"}`
  - After switch: `{"ok":true,"diffExitCode":0,"sqlLines":0,"schemaApplied":false,"prismaVersion":"6.5.0","engineVersion":"173f8d54f8d52e692c7e27e72a88314ec7aeff60","engineSha256":"431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2"}`
  - Product DB tables: `77` (`0` `mastra_*` tables in product DB)

## 4. Production Runtime & Host Retention Verification

- **Switch (`scripts/release/switch-host-image.sh aeb7cfe2cf50`)**:
  - `cf-next-app`: `running`, `healthy`, `restarts: 0`, `CONTENT_FACTORY_RELEASE=aeb7cfe2cf50`
  - PM2 processes: `backend` (`online`, `0` restarts), `orchestrator` (`online`, `0` restarts), `frontend` (`online`, `0` restarts)
- **HTTP Verification (`https://factory.aidevteam.ru`)**:
  - `/auth/login` -> `200`
  - `/api/` -> `200`
  - `/api/public/source` -> `200`
  - `/api/public/source/version` -> `{"commit":"aeb7cfe2cf5054fcff73a231497efbbbd6c9310c","shortCommit":"aeb7cfe2cf50","builtAt":"2026-10-20T07:15:24Z"}`
  - `/api/public/source/archive` -> `200` (`13099261` bytes, SHA-256 `86a45ed9b13af7528b4d2f1a01f3587e7e70fad218c5d71ff473cba90950351d`)
- **Host Isolation & Retention (`scripts/release/retain-host-artifacts.sh`)**:
  - All `22` containers (`17` foreign + `5` `cf-next-*`) and `21` volumes preserved
  - Retained tags: `aeb7cfe2cf50` (active) and `dd89af1b4a29` (verified rollback)
  - Removed intermediate `41e8e56a56a0`, obsolete own tag `88867e1cb4c7`, and allowlisted old `.env.bak`/`app.env.bak` copies
  - Temporary `/tmp/cf-preflight-bin` removed
  - Free disk after retention: `25,291,116,544` bytes (`69%` used)
