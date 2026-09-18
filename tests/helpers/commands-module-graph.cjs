// Builds the `apps/commands` dependency graph the way Nest builds it, in a
// process of its own, and prints one line of JSON about what happened.
//
// It runs as a child process rather than inside jest because the graph is
// TypeScript: the application boots it through `nest build`, and this file
// boots it through ts-node with the same compiler options. A child also keeps
// whatever the graph constructs — a Prisma client, a Redis stand-in — out of
// the test runner's process.
//
// Prints `{"ok":true}` on success, `{"ok":false,"error":"..."}` on a
// dependency that Nest cannot resolve, and exits non-zero in the second case.

// A graph is built here, never used: no query is issued and no socket is
// wanted. Both variables are set before anything is loaded, because the
// modules below read them the moment they are imported — `redis.service.ts`
// picks its in-memory stand-in when `REDIS_URL` is empty, and the Prisma
// client refuses to be constructed without a `DATABASE_URL` to parse.
process.env.REDIS_URL = '';
process.env.DATABASE_URL =
  'postgresql://commands-wiring:commands-wiring@127.0.0.1:1/none';

const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..', '..');

// `tsconfig.base.json` maps these prefixes; ts-node with explicit compiler
// options does not read that file, so the same mapping is applied here.
const workspacePrefixes = [
  ['@contentfactory/nestjs-libraries/', 'libraries/nestjs-libraries/src/'],
  ['@contentfactory/helpers/', 'libraries/helpers/src/'],
  ['@contentfactory/react/', 'libraries/react-shared-libraries/src/'],
  ['@contentfactory/backend/', 'apps/backend/src/'],
];

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  for (const [prefix, directory] of workspacePrefixes) {
    if (request.startsWith(prefix)) {
      return resolveFilename.call(
        this,
        path.join(root, directory, request.slice(prefix.length)),
        ...rest
      );
    }
  }
  return resolveFilename.call(this, request, ...rest);
};

require('reflect-metadata');
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2021',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    // Nest reads constructor parameter types from `design:paramtypes`. Without
    // this the graph would resolve by luck: every dependency would look like
    // `Object` and the missing one would not be missed.
    emitDecoratorMetadata: true,
    resolveJsonModule: true,
    skipLibCheck: true,
  },
});

const { Test } = require('@nestjs/testing');
const { CommandModule } = require(path.join(
  root,
  'apps/commands/src/command.module.ts'
));
const { closeTemporalCommandClient } = require(path.join(
  root,
  'libraries/nestjs-libraries/src/temporal/temporal.module.ts'
));

(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [CommandModule],
  }).compile();

  // The command's own shutdown, on the real graph: the client token resolves
  // to a client whose connection can be closed, and closing one that never
  // connected raises nothing. Without a Temporal server there is no socket to
  // watch here — what this proves is that the close path finds its object.
  const client = moduleRef.get('TEMPORAL_CLIENT', { strict: false });
  const closable = typeof client?.connection?.close === 'function';
  await closeTemporalCommandClient(moduleRef);

  await moduleRef.close();
  process.stdout.write(`${JSON.stringify({ ok: true, closable })}\n`);
})().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: error && error.message ? error.message : String(error),
    })}\n`
  );
  process.exitCode = 1;
});
