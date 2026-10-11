# Backend child delivery: dbxe.22 and dbxe.23

Local child checks PASS; root acceptance and Beads closure remain root-owned.
Baseline `5cc169032a452b245f6e0423ceaf38cea719f169`, branch
`codex/dbxe-completion-backend-20261011`.

## Delivered behavior

- `.22`: `SubscriptionService` derives the same inherited monthly allowance for
  preview and reservation. Image limits still require
  `STRIPE_PUBLISHABLE_KEY`; videos retain their existing limit and trial behavior.
  `SubscriptionRepository` counts and inserts in one short Serializable Prisma
  transaction, with three bounded attempts for P2034 admission conflicts. The
  provider callback starts after commit; callback failures retain the existing
  compensating delete and are never retried by admission logic.
- The ordinary image exhausted-allowance preview still returns `false` before
  work. A request that loses a concurrent admission receives HTTP 402 before the
  provider. Unbilled FREE images continue counting without an inherited ceiling.
  Image storage failures remain charged after successful rendering; video
  storage failures retain their existing refund.
- `.23`: an explicit active same-tenant channel must belong to
  `PLATFORM_PROVIDERS[platform]` before the material repository can write its
  Post/ContentDerivation. Existing Telegram/VK and site/WordPress,
  newsletter/Listmonk mappings remain authoritative; no new provider routing.

## Exact local evidence

Node `22.23.2`, pnpm `10.6.1`, installed Prisma `6.5.0`.

| Proof | Result | Receipt |
| --- | --- | --- |
| Baseline synchronized image/video reads, synthetic allowance 1, actual owned PostgreSQL | 2 failures: both requests generated; 6 compatibility tests passed | `baseline-postgres-tests.log` |
| Baseline Telegram/VK mismatch | 2 failures: request did not refuse; 50 other cases passed | `baseline-material-tests.log` |
| Final owned PostgreSQL concurrency/refund/unbilled/type/tenant/window checks | 8/8 PASS, zero skips | `final-postgres-tests.log`, `final-database-boundary.json` |
| Final media-credit, material, media, privacy, tenant and usage-consumer checks | 6 suites, 153/153 PASS, zero skips | `final-focused-tests.log` |
| Backend types | exit 0 | `final-backend-types.log` |
| Eight exact scripted media generation scenarios | 8/8 PASS | `fixed-media-scenarios.receipt.json` |
| Scoped diff | `git diff --check` PASS | root receives committed diff |

The two DB transactions are deliberately synchronized after their real
PostgreSQL usage reads. One reservation/provider/media row remains; the losing
request needs one fresh transaction ([1,2] attempts). The provider fake verifies
that its request's transaction is inactive and an independent Prisma client can
see its committed reservation. This proves the local admission/DB boundary,
not real-provider behavior, pricing acceptance or production deployment.

The extra admission cases enforce bounded retries, immediate non-conflict DB
failure, no provider replay even when callback error carries P2034, FREE/video
conditions, unbilled failure refunds and shared monthly anchors.

Reproduce final DB proof:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH \
  CF_DBXE_PROOF_PHASE=review \
  node .codex/stages/content-factory-next-dbxe-completion-stage/backend/run-postgres-proof.cjs
```

The runner refuses existing proof resources, binds its database to a random
loopback port, applies Prisma schema only to its newly created disposable
database, fakes all provider/storage calls, and verifies name/label ownership
before deleting its container and named volume. It never calls a broad prune.

## Resource preservation and remaining boundaries

`final-cleanup.json`: owned container and volume absent; all 71 containers and
7491 volumes present before the final window preserved. Full pre/post inventory
SHA-256 is identical:
`f56c10f40e1761fd3792d83b1350537094d70ba9f6453284e5ee86a972ffea67`.
The earlier baseline had 70/7489; other owners added resources between windows.
No child-owned Docker or process tails remain. Full inventories and scripted
provider report are retained locally as ignored audit evidence; compact digests
are committed. Earlier redundant child-run logs were removed after final proof.

No production/schema/Temporal contract, media logging, central handoff/index,
Beads, pricing table or lockfile writes. No push/deploy, paid calls, live accounts
or messaging. Root owns integration, final repository acceptance and any release.

Documentation reviewed: AGENTS.md, canonical owner Beads `.22`/`.23`, audit
backend report, project index/handoff. Graph-reviewed: readonly owner graph
baseline `d724f3b7`; relevant file hashes matched the child baseline. Focused
SubscriptionRepository/ContentMaterialService neighborhoods were truncated;
exact current source/callers were read. No graph refresh or external extraction.
