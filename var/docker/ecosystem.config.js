// PM2 process list for the production image.
//
// Each application is started as a plain `node` process. Until this file
// existed the entrypoint ran `pnpm run --parallel pm2`, and every application
// was launched as `pm2 start pnpm -- start` — a chain of `pnpm` -> `sh` ->
// `dotenv-cli` -> `node` whose three parents stayed resident for the life of
// the container, ten processes in all beside the three that did the work.
//
// What that actually cost, measured 2026-08-17 by running one image both ways
// against the same PostgreSQL, Redis and Temporal, idle, 190 s after start:
// the container's own accounting (`memory.current`) went from 1080.8 MiB to
// 1010.0 MiB. The saving is 71 MiB, not the ~270 MB the issue predicted from
// summed RSS — RSS counts every shared page in full in each process that maps
// it, and thirteen Node processes sharing one 100 MB binary made the wrappers
// look several times more expensive than they were.
//
// The `dotenv` link was redundant in the first place. Compose passes `env_file`,
// so every variable is in the container's own environment, and that is where the
// applications read it from: `ConfigurationChecker.readEnvFromProcess()` in
// `apps/backend/src/main.ts`. Nothing in the three applications parses `.env`
// itself.
//
// Outside Docker nothing changes: `pnpm start` in each application still goes
// through `dotenv -e ../../.env`, because there is no `env_file` there. This
// file is only ever used by the image's entrypoint.
//
// Heap caps live here, per application, rather than in one container-wide
// `NODE_OPTIONS`. The three processes are nothing like the same size, and a
// single number either starves the largest or lets the smallest grow into the
// container's limit. Left unset, Node claims about half of the cgroup limit for
// old space alone — measured on `node:22.23.2-bookworm-slim`: 1048 MiB under
// `-m 2g`, 524 MiB under `-m 1g` — which for three processes is three times the
// container's budget.

// `require(esm)` is unflagged from Node 22.12, so this is a no-op on the
// image's Node 22.23.2. It is kept because the `start` scripts these processes
// replace carried it, and dropping it here would be an unrelated change.
const REQUIRE_ESM = '--experimental-require-module';

/**
 * @param {number} heapMiB
 * @returns {string[]}
 */
const nodeArgs = (heapMiB) => [REQUIRE_ESM, `--max-old-space-size=${heapMiB}`];

// PM2 runs each application inside its own wrapper module, and by default that
// wrapper pulls in `@pm2/io` — an instrumentation agent for a monitoring
// service this deployment does not use — plus the git metadata scanner and the
// automation channel. Measured in this image with a script that requires
// nothing: 48 modules and 58 MiB RSS with the defaults, 3 modules and 44 MiB
// with all three switched off, against 40 MiB for the same script run by
// `node` alone.
const NO_AGENT = {
  pmx: false,
  vizion: false,
  automation: false,
};

module.exports = {
  apps: [
    {
      // Names are the ones the operator already knows from `pm2 list` and from
      // the log prefixes on the container's stdout.
      name: 'backend',
      cwd: '/app/apps/backend',
      script: 'dist/apps/backend/src/main.js',
      // 512 MiB is not headroom here, it is the floor. Measured idle:
      // heapUsed 363 MiB against the 536 MiB limit this flag produces, with
      // 11 623 modules loaded before a single request arrives. The module
      // graph is claimed at boot and does not grow with traffic, so the number
      // stays where production has proven it — but it is the one cap in this
      // file that should be raised rather than lowered if anything moves.
      node_args: nodeArgs(512),
      exec_mode: 'fork',
      instances: 1,
      ...NO_AGENT,
    },
    {
      name: 'orchestrator',
      cwd: '/app/apps/orchestrator',
      script: 'dist/apps/orchestrator/src/main.js',
      // Measured idle: 474 MiB resident but only 255 MiB of JS heap. The
      // difference is the Rust core of the Temporal SDK and the stacks of its
      // ninety-five threads, none of which this flag governs. What the heap
      // does hold is the workflow cache, and that size is now stated outright
      // in libraries/nestjs-libraries/src/temporal/temporal.module.ts rather
      // than derived from whatever heap limit happens to apply.
      node_args: nodeArgs(512),
      exec_mode: 'fork',
      instances: 1,
      ...NO_AGENT,
    },
    {
      name: 'frontend',
      cwd: '/app/apps/frontend',
      // pnpm links workspace dependencies at the repository root, so `next`
      // resolves from /app/node_modules whatever the application's cwd is.
      script: '/app/node_modules/next/dist/bin/next',
      args: ['start', '-p', '4200'],
      // Measured idle: 110 MiB resident, 44 MiB of JS heap, 580 modules. The
      // container-wide 512 MiB it used to inherit was five times what it has
      // ever wanted; 256 MiB is still nearly six times its measured heap.
      node_args: nodeArgs(256),
      exec_mode: 'fork',
      instances: 1,
      ...NO_AGENT,
    },
  ],
};
