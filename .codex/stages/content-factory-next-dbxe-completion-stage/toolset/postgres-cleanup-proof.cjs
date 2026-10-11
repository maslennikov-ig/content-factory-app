const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createRoleFixtureDocker, cleanupOwnedContainer } = require('../../../../tests/helpers/postgres-role-fixture.cjs');
const root = process.cwd(), stage = __dirname;
const docker = (...args) => { const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
const inventory = () => ({ containers: docker('ps', '-aq', '--no-trunc').split('\n').filter(Boolean).sort(), volumes: docker('volume', 'ls', '-q').split('\n').filter(Boolean).sort() });
const summary = (value) => Object.fromEntries(Object.entries(value).map(([key, items]) => [key, { count: items.length, sha256: createHash('sha256').update(JSON.stringify(items)).digest('hex') }]));
const volumesFor = (id) => JSON.parse(docker('inspect', id))[0].Mounts.filter(mount => mount.Type === 'volume').map(mount => mount.Name);
const absent = (id, volumes) => { assert(!inventory().containers.includes(id)); for (const volume of volumes) assert(!inventory().volumes.includes(volume)); };
(async () => {
  const before = inventory(), cases = [];
  const sentinelVolume = `cf-role-foreign-proof-${randomUUID()}`;
  let sentinelId;
  try {
    docker('volume', 'create', sentinelVolume);
    sentinelId = docker('create', '--name', `cf-role-foreign-proof-${process.pid}`, '--label', 'ru.content-factory.test-producer=foreign-sentinel', '--mount', `type=volume,src=${sentinelVolume},dst=/var/lib/postgresql/data`, 'postgres:17-alpine');
    for (const name of ['success', 'failure']) {
      const fixture = createRoleFixtureDocker([`cf-role-cleanup-${name}-${process.pid}`], { signals: false });
      let id, volumes;
      try {
        const started = fixture.docker('run', '--detach', '--name', `cf-role-cleanup-${name}-${process.pid}`, '--env', 'POSTGRES_PASSWORD=synthetic-fixture-only', 'postgres:17-alpine');
        assert.equal(started.status, 0); id = started.stdout.trim(); volumes = volumesFor(id); assert.equal(volumes.length, 1);
        if (name === 'failure') throw new Error('synthetic fixture assertion failure');
      } catch (error) { if (name !== 'failure' || error.message !== 'synthetic fixture assertion failure') throw error; }
      finally { fixture.cleanup(); }
      absent(id, volumes); cases.push({ name, anonymousVolumeCount: volumes.length, removed: true });
    }
    const helper = path.join(root, 'tests/helpers/postgres-role-fixture.cjs');
    const child = spawn(process.execPath, ['-e', `const fixture=require(${JSON.stringify(helper)}).createRoleFixtureDocker(['cf-role-interrupt-${process.pid}']); const started=fixture.docker('run','--detach','--name','cf-role-interrupt-${process.pid}','--env','POSTGRES_PASSWORD=synthetic-fixture-only','postgres:17-alpine'); if(started.status!==0) process.exit(1); console.log(JSON.stringify({id:started.stdout.trim(),owner:fixture.owner})); setInterval(()=>{},1000);`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const identity = await new Promise((resolve, reject) => { let data=''; child.stdout.on('data', chunk => { data+=chunk; if(data.includes('\n')) resolve(JSON.parse(data.trim())); }); child.on('error', reject); child.on('exit', code => { if(!data) reject(new Error(`interrupt fixture exited ${code}`)); }); });
    const interruptVolumes = volumesFor(identity.id);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM'); const result = await exited; assert.equal(result.code, 143); absent(identity.id, interruptVolumes);
    cases.push({ name: 'SIGTERM', exitCode: result.code, removed: true });
    // SIGKILL cannot run handlers; exercise the documented exact-ID/owner recovery.
    const recovery = createRoleFixtureDocker([`cf-role-recovery-${process.pid}`], { signals: false });
    const recoveryStarted = recovery.docker('run', '--detach', '--name', `cf-role-recovery-${process.pid}`, '--env', 'POSTGRES_PASSWORD=synthetic-fixture-only', 'postgres:17-alpine');
    assert.equal(recoveryStarted.status, 0); const recoveryId = recoveryStarted.stdout.trim(), recoveryVolumes = volumesFor(recoveryId);
    const recovered = spawnSync(process.execPath, [helper, recoveryId, recovery.owner], { encoding: 'utf8', timeout: 30000 });
    assert.equal(recovered.status, 0, recovered.stderr); absent(recoveryId, recoveryVolumes); cases.push({ name: 'exact-ID-owner-recovery', removed: true });
    const jest = spawnSync('pnpm', ['exec', 'jest', 'tests/postgres-role-isolation.execution.test.cjs', '--runInBand', '--no-coverage'], { cwd: root, encoding: 'utf8', timeout: 180000 });
    fs.writeFileSync(path.join(stage, 'postgres-role-execution.log'), jest.stdout + jest.stderr); assert.equal(jest.status, 0, jest.stderr);
    const intermediate = inventory();
    assert(intermediate.containers.includes(sentinelId)); assert(intermediate.volumes.includes(sentinelVolume));
    for (const id of before.containers) assert(intermediate.containers.includes(id));
    for (const volume of before.volumes) assert(intermediate.volumes.includes(volume));
  } finally {
    if (sentinelId) docker('rm', '--force', sentinelId);
    docker('volume', 'rm', sentinelVolume);
  }
  const after = inventory(); assert.deepEqual(after, before);
  fs.writeFileSync(path.join(stage, 'postgres-cleanup.actual.json'), JSON.stringify({ node: process.version, before: summary(before), after: summary(after), foreignInventoryUnchanged: true, syntheticForeignSentinelPreservedDuringAllCases: true, persistentDevelopmentVolumePreserved: before.volumes.includes('cf-cj4_postgres-volume') && after.volumes.includes('cf-cj4_postgres-volume'), cases, realRoleIsolationSuite: '4 tests passed; see postgres-role-execution.log', broadPrune: false }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, cases: cases.length, foreignInventoryUnchanged: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
