const path = require('node:path');

const scripts = require(path.resolve(__dirname, '..', 'package.json')).scripts;

/**
 * One half of the stand dying must not take the other half with it.
 *
 * `pnpm run --parallel` bails by default: the first script to exit non-zero
 * aborts every sibling. The owner starts the stand with one such command, so a
 * frontend that fell over — a bad import, a port already taken, an out-of-memory
 * kill — also silently stopped the backend, and the backend's death then read
 * as a second, unrelated fault. `--no-bail` leaves the survivor running and
 * still reports the failure at the end, so what died is what is down.
 */
describe('the parallel dev stand', () => {
  const parallelScripts = Object.entries(scripts).filter(
    ([name, body]) => body.includes('--parallel') && /^dev/.test(name)
  );

  test('has the scripts this contract is about', () => {
    expect(parallelScripts.map(([name]) => name).sort()).toEqual([
      'dev',
      'dev-backend',
    ]);
  });

  test.each(parallelScripts)(
    'keeps the surviving half of "%s" running when the other half dies',
    (name, body) => {
      expect(body).toContain('--no-bail');
    }
  );
});
