const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const graphRunner = path.join(__dirname, 'helpers/commands-module-graph.cjs');

/**
 * The commands application has to be able to start.
 *
 * `content-factory-next-97dq.15`: every command in the shipped image died at
 * boot with "Nest can't resolve dependencies of the NotificationService ...
 * TemporalService at index [3] is not available in the DatabaseModule". The
 * whole suite was green while it happened, because nothing here had ever built
 * this graph — each task was unit-tested on its own, and the defect lives
 * between the modules, not inside any of them. It was found by a person
 * running a command on a release.
 *
 * So this suite builds the graph, and it costs a few seconds because building
 * it is the test. A cheaper check on the text of `command.module.ts` would
 * pass the day someone adds a service with a dependency nobody provides, which
 * is exactly what happened.
 */
describe('the commands application graph', () => {
  test('Nest resolves every dependency the commands ask for', () => {
    const result = spawnSync(process.execPath, [graphRunner], {
      cwd: root,
      encoding: 'utf8',
      timeout: 180000,
    });

    const report = (result.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

    // Without this, a runner that died before printing would read as a pass
    // with an unparsed line.
    //
    // `closable` is the other half of the shutdown (correctness review of the
    // second release, P2-2): the command closes the Temporal client itself,
    // because the library's own cleanup never does, and a client whose
    // connection has no `close` would leave the first command that starts a
    // workflow hanging on its socket.
    expect({ report, stderr: result.stderr }).toMatchObject({
      report: { ok: true, closable: true },
    });
    expect(result.status).toBe(0);
  }, 200000);

  test('the Temporal module the commands use is the one that lets a process end', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/commands/src/command.module.ts'),
      'utf8'
    );

    // `getTemporalModule(false)` also satisfies the injector, and also leaves
    // a Temporal socket open that no command closes: the help text printed and
    // the process then had to be killed. A one-shot command takes the variant
    // built for it.
    expect(source).toContain('getTemporalCommandModule()');
    expect(source).not.toMatch(/getTemporalModule\(/);
  });
});
