# dbxe.37: compiled workflow interceptor inclusion

Baseline: `e1eb630f384e0e6a6bfd7866479bd108b4c769f1`.

The orchestrator's real Nest TSC build omitted `mail-log-privacy.workflow.ts`: it lives outside the application's implicit input glob and is referenced only by dynamic `require.resolve`. The compiled `temporal.module.js` consequently failed Node module resolution. The focused regression reproduced that exact `MODULE_NOT_FOUND` after a successful actual Nest build (`regression.red.log`).

`apps/orchestrator/tsconfig.build.json` now explicitly retains the previous `**/*` input glob and adds that single workflow-only source file. Effective root inputs increase from 45 to 46 with zero removals. Exclusions, inherited compiler options, sandbox-only execution and every workflow/interceptor/logger body remain unchanged. There is no static host import of the interceptor.

Verification:

- `pnpm --filter ./apps/orchestrator run build`: exit 0, normal application output (`orchestrator.build.log`).
- `pnpm exec jest tests/orchestrator-compiled-workflow-bundle.test.cjs --runInBand --coverage=false`: 1/1 passes. The Jest test is included by the existing root `pnpm test` discovery; it does not import `node:test`. It runs the declared package build with the actual effective source inputs and compiler settings, moving only outputs into an owned temporary directory.
- The same helper loads the normal compiled output without rebuilding. Node resolves the interceptor from compiled `temporal.module.js`; the real compiled `getTemporalModule` registration supplies the production main worker options. Real Temporal bundling loads the complete compiled workflow graph and configured interceptor. The installed SDK reusable VM initializes `sendEmailWorkflow`, `sendEmailWorkflowV2`, `sendEmailWorkflowV3`, and `digestEmailWorkflow`, executing the real interceptor factory in its sandbox. It creates no worker/client/connection, calls no activity, and observes 0 socket connects / 0 DNS lookups without connection stubs. The interceptor never enters the host's `require.cache`.

Prepublication proof against an already-built candidate image (root supplies the exact image ID or tag):

```sh
docker run --rm --interactive --network none --entrypoint node --workdir /app "$cf_runtime_candidate_image" - /app/apps/orchestrator/dist < tests/helpers/orchestrator-compiled-workflow-proof.cjs
```

The supplied dist argument skips Nest, TypeScript and package-manager execution. Dependencies resolve from the candidate's `/app/package.json`; the runner uses only that image's emitted modules and installed Temporal SDK. Local stdin invocation of this identical no-rebuild mode passed (`compiled.actual.log`). Root owns the image invocation and records its result separately before publication.

`receipt.json` binds inputs and compiled outputs to SHA-256 hashes. `graph-reviewed.json` records read-only owner graph orientation at `5cdd90026810c128a5c43320dfc1a47af55cedfc`; the current temporal module matches its source manifest. No graph refresh was performed. Documentation review is bounded to the build configuration and this proof command; central documentation remains root-owned.

Cleanup: all owned temporary proof outputs were removed on success and the observed missing-artifact failure. No Docker resources, dependency installations, production operations or other worktrees were touched. The ignored normal `apps/orchestrator/dist` output and owner dependency symlink remain for artifact review. No full suite, push or deployment was performed; root owns integration, release and production acceptance.
