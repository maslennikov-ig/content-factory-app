const {
  createRoleFixtureDocker,
  cleanupOwnedContainer,
  ownerLabel,
  producerLabel,
  producer,
} = require('./helpers/postgres-role-fixture.cjs');
const id = 'a'.repeat(64),
  owner = 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12);
function inspection(ownerValue = owner) {
  return {
    Id: id,
    Config: {
      Image: 'postgres:17-alpine',
      Labels: { [ownerLabel]: ownerValue, [producerLabel]: producer },
    },
    Mounts: [
      {
        Type: 'volume',
        Destination: '/var/lib/postgresql/data',
        Name: 'owned-anonymous',
      },
    ],
  };
}
describe('exact-owned PostgreSQL fixture teardown', () => {
  test.each(['success', 'failure'])(
    'removes anonymous volume after %s and nothing foreign',
    () => {
      let fixture;
      const run = jest.fn((...args) => {
        if (args[0] === 'run') return { status: 0, stdout: id };
        if (args[0] === 'inspect')
          return {
            status: 0,
            stdout: JSON.stringify([inspection(fixture.owner)]),
          };
        return { status: 0 };
      });
      fixture = createRoleFixtureDocker(['owned-name'], {
        run,
        signals: false,
      });
      fixture.docker(
        'run',
        '--detach',
        '--name',
        'owned-name',
        'postgres:17-alpine'
      );
      fixture.cleanup();
      fixture.cleanup();
      expect(run.mock.calls.filter(([verb]) => verb === 'rm')).toEqual([
        ['rm', '--force', '--volumes', id],
      ]);
    }
  );
  test('foreign labels or mounts are preserved', () => {
    for (const value of [
      inspection('foreign'),
      { ...inspection(), Mounts: [{ Type: 'bind', Destination: '/foreign' }] },
    ]) {
      const run = jest.fn(() => ({
        status: 0,
        stdout: JSON.stringify([value]),
      }));
      expect(() => cleanupOwnedContainer(id, owner, run)).toThrow(/preserved/);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
  test('rejects names, malformed IDs and uncertain daemon errors', () => {
    expect(() => cleanupOwnedContainer('owned-name', owner)).toThrow(/ID/);
    expect(() =>
      cleanupOwnedContainer(id, owner, () => ({
        status: 1,
        stderr: 'daemon unavailable',
      }))
    ).toThrow(/inspection failed/);
  });
});
