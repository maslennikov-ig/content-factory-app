# Production Delivery Receipt — `content-factory-next-on0i` (`41e8e56a56a0`)

## 1. Release Identity

- **Date (UTC)**: `2026-10-20`
- **Owner Authorization**: Explicit `"Push, Merge, Deploy."` (2026-10-20)
- **Epic & Scope**: `content-factory-next-on0i` (`on0i.1`–`on0i.7`, `A1`–`A31`) + `content-factory-next-rafo` (sidebar chat navigation)
- **Private Source Commit (`maslennikov-ig/content-factory-next`)**: `5180155733f4311346fdc7cd3f42bcc0d407ee70` (`5180155733f4`, merged to `main` and pushed to `origin`)
- **Public Tree Commit (`maslennikov-ig/content-factory-app`)**: `41e8e56a56a0af0b1f3c88b9beac0aadbab747be` (`41e8e56a56a0`)
- **Production Image (`ghcr.io/maslennikov-ig/content-factory-next:41e8e56a56a0`)**:
  - Registry Manifest Digest: `sha256:43280fcde3912e3c006270130f7f1ad2fc2c0531cead67c30f85c0b46d53aef7`
  - Runtime Image Config ID: `sha256:eedefea94986113c3e87887b20be3b41483a67fabe4e72ed68c960bd9cf4d0a6`
- **Corresponding Source Archive (`/api/public/source/archive`)**:
  - Bytes: `13095346`
  - SHA-256: `33397864bbd3cbd0b9cd345adf0cecbd5b466642db45ae4226d878962eacd1b4`
- **Verified Rollback Target on Host**:
  - Tag: `dd89af1b4a29`
  - Config: `sha256:b69ad9e702c4572d25ad209ea796ea5b715381aba8a3ff0fd2934051cd2afc59`
  - Rollback Command: `CF_DEPLOY_HOST=helixa-prod scripts/release/switch-host-image.sh dd89af1b4a29`

## 2. Suite & Build Verification

- **`scripts/release/record-suite-receipt.sh`** on `5180155733f4311346fdc7cd3f42bcc0d407ee70`:
  - Jest: `704 passed`, `7 skipped`, `0 failed` (`12,660 passed`, `70 skipped`, `0 failed` tests)
  - Node `--test`: `126 passed`, `4 skipped`, `0 failed`
  - Python `unittest`: `50 passed`, `0 failed` (`OK`)
- **Image Pre-Push Gates**:
  - `scripts/release/verify-nginx-config.sh content-factory-next:41e8e56a56a0`: PASS
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
- **Product Prisma Schema Preflight (`scripts/release/schema-preflight.sh 41e8e56a56a0`)**:
  - Before switch: `{"ok":true,"diffExitCode":0,"sqlLines":0,"schemaApplied":false,"prismaVersion":"6.5.0","engineVersion":"173f8d54f8d52e692c7e27e72a88314ec7aeff60","engineSha256":"431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2"}`
  - After switch: `{"ok":true,"diffExitCode":0,"sqlLines":0,"schemaApplied":false,"prismaVersion":"6.5.0","engineVersion":"173f8d54f8d52e692c7e27e72a88314ec7aeff60","engineSha256":"431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2"}`
  - Product DB tables: `77` (`0` `mastra_*` tables in product DB)

## 4. Production Runtime & Host Retention Verification

- **Switch (`scripts/release/switch-host-image.sh 41e8e56a56a0`)**:
  - `cf-next-app`: `running`, `healthy`, `restarts: 0`, `CONTENT_FACTORY_RELEASE=41e8e56a56a0`
  - PM2 processes: `backend` (`online`, `0` restarts), `orchestrator` (`online`, `0` restarts), `frontend` (`online`, `0` restarts)
- **HTTP Verification (`https://factory.aidevteam.ru`)**:
  - `/auth/login` -> `200`
  - `/api/` -> `200`
  - `/api/public/source` -> `200`
  - `/api/public/source/version` -> `{"commit":"41e8e56a56a0af0b1f3c88b9beac0aadbab747be","shortCommit":"41e8e56a56a0","builtAt":"2026-10-20T06:11:37Z"}`
  - `/api/public/source/archive` -> `200` (`13095346` bytes, SHA-256 `33397864bbd3cbd0b9cd345adf0cecbd5b466642db45ae4226d878962eacd1b4`)
- **Host Isolation & Retention (`scripts/release/retain-host-artifacts.sh`)**:
  - All `22` containers (`17` foreign + `5` `cf-next-*`) and `21` volumes preserved
  - Retained tags: `41e8e56a56a0` (active) and `dd89af1b4a29` (verified rollback)
  - Removed only obsolete own tag `88867e1cb4c7` and `1` old `.env.bak-before-88867e1cb4c7` + `1` old `app.env.bak-before-88867e1cb4c7`
  - Temporary `/tmp/cf-preflight-bin` removed
  - Free disk after retention: `25,292,267,520` bytes (`69%` used)
