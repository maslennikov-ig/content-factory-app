const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gaugePath = path.join(root, 'var/docker/runtime-memory-gauge.cjs');
const wrapper = '/usr/local/lib/node_modules/pm2/lib/ProcessContainerFork.js';
const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  const events = [];
  const handles = new Map();
  const nodes = new Map();
  const timers = [];
  let fd = 20;
  let uptime = 0;
  let writes = 0;
  let stallRelease;
  let stalled = false;
  const state = { fault: null, stall: null, writeShort: false, oversized: false };
  function node(ino, directory = false) {
    return {
      dev: 1, ino, uid: 1000, mode: directory ? 0o40700 : 0o100600, nlink: 1,
      bytes: Buffer.alloc(0),
      isDirectory: () => directory,
      isFile: () => !directory,
      isSymbolicLink: () => false,
    };
  }
  nodes.set('/tmp', node(1, true));
  function resolve(name) {
    const match = /^\/proc\/self\/fd\/(\d+)(.*)$/.exec(name);
    return match ? handles.get(Number(match[1])).path + match[2] : name;
  }
  async function operation(name) {
    events.push(name);
    if (state.fault === name) throw Object.assign(new Error('synthetic private failure'), { code: 'ENOSPC' });
    if (state.stall === name && !stalled) {
      stalled = true;
      await new Promise((accept) => { stallRelease = accept; });
      if (state.lateFault) throw new Error('Synthetic late rejection');
    }
  }
  const fakeFs = {
    constants: fs.constants,
    promises: {
      async open(name, flags, mode) {
        await operation('open');
        const normalized = resolve(name);
        if (!(flags & fs.constants.O_NOFOLLOW)) throw new Error('Missing nofollow');
        let current = nodes.get(normalized);
        if (flags & fs.constants.O_CREAT) {
          if (!(flags & fs.constants.O_EXCL) || mode !== 0o600 || current) throw new Error('Unsafe file creation');
          current = node(4); nodes.set(normalized, current);
        }
        if (!current || current.isSymbolicLink()) throw new Error('Invalid open');
        if (current.isDirectory() !== !!(flags & fs.constants.O_DIRECTORY)) throw new Error('Wrong open type');
        const handle = {
          fd: fd++, path: normalized, closed: false, inode: current,
          async stat() { await operation('fstat'); return current; },
          async write(buffer, offset, length, position) {
            await operation('write');
            if (handle.closed) throw new Error('Write after close');
            if (position !== 0) throw new Error('Not an FD overwrite');
            writes += 1;
            const written = state.writeShort ? Math.floor(length / 2) : length;
            const old = current.bytes;
            const next = Buffer.alloc(Math.max(old.length, written)); old.copy(next);
            buffer.copy(next, position, offset, offset + written); current.bytes = next;
            return { bytesWritten: written };
          },
          async truncate(size) { await operation('truncate'); current.bytes = current.bytes.subarray(0, size); },
          async close() { events.push('close'); handle.closed = true; },
        };
        handles.set(handle.fd, handle); return handle;
      },
      async mkdir(name, options_) {
        await operation('mkdir'); const normalized = resolve(name);
        if (options_.mode !== 0o700 || options_.recursive || nodes.has(normalized) || options.claimExists) throw new Error('Exclusive role claim failed');
        nodes.set(normalized, node(2, true));
      },
      async mkdtemp(prefix) { await operation('mkdtemp'); const name = resolve(prefix) + 'abc123'; nodes.set(name, node(3, true)); return name; },
      async lstat(name) { await operation('lstat'); const current = nodes.get(resolve(name)); if (!current) throw new Error('Absent'); return current; },
      async readFile(name) {
        await operation('readFile');
        if (name !== '/proc/self/stat') throw new Error('Unapproved read');
        return options.procStat || '321 (own empty (test)) S ' + Array(18).fill('0').join(' ') + ' 123456 0\n';
      },
    },
  };
  const fakeProcess = {
    argv: ['node', options.argv || wrapper], pid: 321,
    cwd: () => options.cwd || '/app/apps/backend', getuid: () => 1000,
    uptime: () => { if (state.uptimeError) throw new Error('Synthetic native timer failure'); return uptime; },
    memoryUsage: () => ({ rss: 100000, heapTotal: 40000, heapUsed: 20000, external: 4000, arrayBuffers: 2000, ...options.memory }),
    constrainedMemory: () => options.constrainedMemory ?? 1792 * 1024 * 1024,
    get env() { throw new Error('Environment must never be read'); },
  };
  const fakeV8 = {
    getHeapStatistics: () => ({ heap_size_limit: 536870912, total_available_size: 400000, malloced_memory: 8192, peak_malloced_memory: 16384, total_heap_size_executable: 262144, external_memory: 4000 }),
    getHeapSpaceStatistics: () => state.oversized
      ? Array(1000).fill({ space_name: 'old_space', space_size: 1, space_used_size: 1, space_available_size: 0, physical_space_size: 1 })
      : [{ space_name: 'old_space', space_size: 40000, space_used_size: 20000, space_available_size: 20000, physical_space_size: 30000 }],
  };
  const localRequire = (name) => {
    if (name === 'node:worker_threads') return { isMainThread: options.mainThread !== false };
    if (name === 'node:fs') return fakeFs;
    if (name === 'node:v8') return fakeV8;
    if (name === 'node:crypto') return crypto;
    throw new Error('Unapproved dependency: ' + name);
  };
  localRequire.cache = options.cache || {
    '/app/node_modules/.pnpm/next@16/node_modules/next/dist/server.js': {},
    '/app/node_modules/@temporalio/worker/lib/index.js': {},
    '/app/customer-secret/token-client-row.cjs': { get exports() { throw new Error('Must not inspect exports'); } },
  };
  const context = {
    require: localRequire, process: fakeProcess, Buffer, module: { exports: {} },
    setInterval(callback, delay) {
      const timer = { callback, delay, active: true, unrefCount: 0, unref() { this.unrefCount += 1; return this; } };
      timers.push(timer); return timer;
    },
    clearInterval(timer) { timer.active = false; },
  };
  vm.runInNewContext(fs.readFileSync(gaugePath, 'utf8'), context, { filename: gaugePath, timeout: 1000 });
  async function ready() { for (let n = 0; n < 5; n += 1) await settle(); }
  async function tick(seconds = 60) { uptime += seconds; if (timers[0]?.active) timers[0].callback(); await ready(); }
  function latest() {
    const file = [...nodes.entries()].find(([name]) => name.endsWith('/latest.json'));
    return file ? { path: file[0], inode: file[1], raw: file[1].bytes.toString() } : null;
  }
  return { events, handles, nodes, timers, state, ready, tick, latest, get writes() { return writes; }, release() { stallRelease?.(); } };
}

function readComplete(raw) {
  const record = JSON.parse(raw);
  expect(record.schema).toBe('content-factory-runtime-memory/v1');
  const payload = JSON.stringify(record.sample);
  expect(record.sha256).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
  return record.sample;
}

it('appends only the fixed preload after the preserved PM2 caps and flags', () => {
  const config = require('../var/docker/ecosystem.config.js');
  expect(config.apps.map((app) => app.node_args)).toEqual([512, 512, 256].map((cap) => [
    '--experimental-require-module', `--max-old-space-size=${cap}`,
    '--require', '/app/var/docker/runtime-memory-gauge.cjs',
  ]));
  for (const app of config.apps) {
    expect(app).toMatchObject({ exec_mode: 'fork', instances: 1, pmx: false, vizion: false, automation: false });
  }
});

it.each(['backend', 'orchestrator', 'frontend'])('samples only the fixed %s role into one private FD-backed bounded record', async (role) => {
  const h = harness({ cwd: '/app/apps/' + role }); await h.ready();
  expect(h.timers).toHaveLength(1); expect(h.timers[0]).toMatchObject({ delay: 60000, unrefCount: 1 });
  expect(h.writes).toBe(0); await h.tick();
  const latest = h.latest(); const sample = readComplete(latest.raw);
  expect(sample).toMatchObject({ role, pid: 321, processStartTicks: 123456, sequence: 1, uptimeMs: 60000,
    memory: { heapTotal: 40000, heapUsed: 20000, external: 4000, arrayBuffers: 2000 },
    v8: { heapSizeLimit: 536870912 }, constrainedMemoryBytes: 1879048192 });
  expect(sample.spaces[0]).toMatchObject({ name: 'old_space', size: 40000, used: 20000, available: 20000, physical: 30000 });
  expect(sample.cjs.total).toBe(3); expect(sample.cjs.packages.next).toBe(1); expect(sample.cjs.packages.temporal).toBe(1);
  expect(Object.keys(sample.cjs.packages).length).toBeLessThanOrEqual(10);
  expect(latest.raw).not.toMatch(/customer-secret|token-client-row|\/app\/|\/tmp\/|synthetic private failure/);
  expect(Buffer.byteLength(latest.raw)).toBeLessThanOrEqual(32768);
  expect([...h.nodes.values()].filter((node) => node.isFile())).toHaveLength(1);
  expect(latest.inode.mode & 0o777).toBe(0o600);
  expect([...h.nodes.entries()].find(([name]) => name.includes('cf-runtime-memory-'))[1].mode & 0o777).toBe(0o700);
  await h.tick(); expect(readComplete(h.latest().raw).sequence).toBe(2);
  expect([...h.handles.values()].filter((handle) => !handle.inode.isDirectory())).toHaveLength(1);
});

it.each([
  { argv: '/usr/local/lib/node_modules/pm2/bin/pm2' },
  { argv: '/app/node_modules/next/dist/bin/next' },
  { argv: wrapper + '.foreign' },
  { cwd: '/app/apps/backend/foreign' },
  { cwd: '/app/apps/commands' },
  { mainThread: false },
])('is inert for manager, direct/fork, unknown cwd or inherited worker: %j', async (options) => {
  const h = harness(options); await h.ready(); expect(h.events).toEqual([]); expect(h.timers).toHaveLength(0);
});

it('an existing per-role claim prevents both foreign path reuse and restart file accumulation', async () => {
  const h = harness({ claimExists: true }); await h.ready(); await h.tick();
  expect(h.writes).toBe(0); expect(h.latest()).toBeNull(); expect(h.timers[0].active).toBe(false);
  expect(h.events).not.toContain('mkdtemp'); expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it('records unavailable/unconstrained memory as unknown, never an available zero-byte budget', async () => {
  const h = harness({ constrainedMemory: 0 }); await h.ready(); await h.tick();
  expect(readComplete(h.latest().raw).constrainedMemoryBytes).toBeNull();
});

it.each(['mkdir', 'mkdtemp', 'open', 'fstat', 'lstat', 'readFile'])('startup %s failure disables only the gauge', async (fault) => {
  const h = harness(); h.state.fault = fault; await h.ready(); await h.tick();
  expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
  expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it.each(['write', 'truncate'])('sample %s failure stops without retry or replacing a foreign path', async (fault) => {
  const h = harness(); await h.ready(); h.state.fault = fault; await h.tick();
  const attempts = h.events.filter((event) => event === fault).length; await h.tick();
  expect(h.events.filter((event) => event === fault)).toHaveLength(attempts);
  expect(h.timers[0].active).toBe(false); expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it.each(['symlink', 'replace', 'unlink', 'permissions', 'specialMode', 'owner', 'hardlink', 'directory', 'claim'])('refuses the %s ownership race and never writes the replacement', async (race) => {
  const h = harness(); await h.ready(); const latest = h.latest(); const original = latest.inode;
  if (race === 'symlink') h.nodes.set(latest.path, { ...original, ino: 77, isSymbolicLink: () => true });
  if (race === 'replace') h.nodes.set(latest.path, { ...original, ino: 77, bytes: Buffer.from('foreign') });
  if (race === 'unlink') { h.nodes.delete(latest.path); original.nlink = 0; }
  if (race === 'permissions') original.mode = 0o100644;
  if (race === 'specialMode') original.mode = 0o104600;
  if (race === 'claim') h.nodes.set('/tmp/cf-runtime-memory-backend', { ...h.nodes.get('/tmp/cf-runtime-memory-backend'), ino: 89 });
  if (race === 'owner') original.uid = 999;
  if (race === 'hardlink') original.nlink = 2;
  if (race === 'directory') {
    const name = latest.path.slice(0, latest.path.lastIndexOf('/'));
    h.nodes.set(name, { ...h.nodes.get(name), ino: 88 });
  }
  await h.tick(); expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
  expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
  expect(h.nodes.get(latest.path)?.bytes.toString()).toBe(race === 'replace' ? 'foreign' : (race === 'unlink' ? undefined : ''));
});

it('does not await stalled gauge startup before application code and disables on the first overlapping tick', async () => {
  const h = harness(); h.state.stall = 'mkdtemp'; await h.ready();
  let applicationRan = false; applicationRan = true;
  expect(applicationRan).toBe(true); expect(h.writes).toBe(0);
  await h.tick(); expect(h.timers[0].active).toBe(false); h.release(); await h.ready();
  expect(h.writes).toBe(0); expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it('stalled sample I/O has no queued writes and disables on overlap; late completion cannot resume the gauge', async () => {
  const h = harness(); await h.ready(); h.state.stall = 'lstat';
  await h.tick(); expect(h.writes).toBe(0); await h.tick(); expect(h.timers[0].active).toBe(false);
  h.release(); await h.ready(); await h.tick(); expect(h.writes).toBe(0);
});

it('a handle returned after startup was stopped is closed without creating a record', async () => {
  const h = harness(); h.state.stall = 'open'; await h.ready(); await h.tick();
  expect(h.timers[0].active).toBe(false); h.release(); await h.ready();
  expect(h.writes).toBe(0); expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it('a rejection arriving after overlap shutdown is observed and cannot resume writes', async () => {
  const h = harness(); await h.ready(); h.state.stall = 'lstat'; await h.tick(); await h.tick();
  h.state.lateFault = true; h.release(); await h.ready();
  expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
  expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it('a short/torn write is rejected by integrity validation and never retried', async () => {
  const h = harness(); await h.ready(); h.state.writeShort = true; await h.tick();
  expect(() => readComplete(h.latest().raw)).toThrow(); expect(h.timers[0].active).toBe(false);
  expect(h.writes).toBe(1); await h.tick(); expect(h.writes).toBe(1);
});

it.each([{ memory: { heapUsed: NaN } }, { procStat: '999 (foreign) S 0 0' }])('invalid native data disables without inventing zeros: %j', async (options) => {
  const h = harness(options); await h.ready(); await h.tick(); expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
});

it('oversized space metadata stops before any oversized record', async () => {
  const h = harness(); await h.ready(); h.state.oversized = true; await h.tick(); expect(h.writes).toBe(0);
  expect(h.timers[0].active).toBe(false);
});

it('cache entry/filename bounds stop sampling without reading module exports', async () => {
  const cache = Object.create(null); for (let n = 0; n < 50001; n += 1) cache['/module/' + n] = {};
  const h = harness({ cache }); await h.ready(); await h.tick(); expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
  const long = harness({ cache: { ['/' + 'x'.repeat(8193)]: {} } }); await long.ready(); await long.tick(); expect(long.writes).toBe(0);
});

it('aggregate cache character bounds reject a small number of oversized total paths', async () => {
  const cache = Object.create(null);
  for (let n = 0; n < 2000; n += 1) cache['/module/' + n + '/' + 'x'.repeat(8000)] = {};
  const h = harness({ cache }); await h.ready(); await h.tick();
  expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
});

it('a native timer-reading exception never escapes into the application', async () => {
  const h = harness(); await h.ready(); h.state.uptimeError = true;
  await expect(h.tick()).resolves.toBeUndefined(); expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
});

it('stops after 180 samples/three hours and retains exactly one latest record', async () => {
  const h = harness(); await h.ready(); for (let n = 0; n < 180; n += 1) await h.tick();
  expect(h.writes).toBe(180); expect(readComplete(h.latest().raw).sequence).toBe(180);
  expect(h.timers[0].active).toBe(false); await h.tick(); expect(h.writes).toBe(180);
  expect([...h.handles.values()].every((handle) => handle.closed)).toBe(true);
});

it('a delayed timer beyond the three-hour lifetime does not extend collection', async () => {
  const h = harness(); await h.ready(); await h.tick(10801); expect(h.writes).toBe(0); expect(h.timers[0].active).toBe(false);
});

it('a real direct Node process and its inherited native Worker stay inert and exit naturally', () => {
  const child = spawnSync(process.execPath, ['--require', gaugePath, '-e', `
    const {Worker}=require('node:worker_threads');
    const worker=new Worker('const {parentPort}=require("node:worker_threads");parentPort.postMessage("inert");',{eval:true});
    worker.once('message', value=>{if(value!=='inert')process.exitCode=1;});
  `], { timeout: 3000, encoding: 'utf8', env: {} });
  expect(child.status).toBe(0); expect(child.stderr).toBe(''); expect(child.stdout).toBe('');
});


it.each(['normal', 'file-symlink', 'file-replacement', 'directory-symlink'])('real Node file-descriptor lifecycle: %s', async (scenario) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-v8-gauge-native-'));
  const initial = fs.lstatSync(scratch);
  const created = [];
  let interval;
  let cleared = false;
  let uptime = 0;
  const translate = (name) => name === '/tmp' ? scratch : name.startsWith('/tmp/') ? scratch + name.slice(4) : name;
  const promises = Object.fromEntries(['mkdir', 'mkdtemp', 'lstat', 'readFile'].map((name) => [name, (...args) => fs.promises[name](translate(args[0]), ...args.slice(1))]));
  promises.open = async (...args) => {
    const handle = await fs.promises.open(translate(args[0]), ...args.slice(1));
    created.push(handle); return handle;
  };
  const actualRequire = (name) => name === 'node:fs' ? { promises, constants: fs.constants } : require(name);
  actualRequire.cache = Object.create(null);
  const context = {
    require: actualRequire, Buffer, module: { exports: {} },
    process: {
      pid: process.pid, argv: ['node', wrapper], cwd: () => '/app/apps/backend', getuid: () => process.getuid(),
      uptime: () => uptime, memoryUsage: () => process.memoryUsage(), constrainedMemory: () => process.constrainedMemory(),
      get env() { throw new Error('No environment reads'); },
    },
    setInterval(callback, milliseconds) { expect(milliseconds).toBe(60000); interval = callback; return { unref() {} }; },
    clearInterval() { cleared = true; },
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
  const claim = path.join(scratch, 'cf-runtime-memory-backend');
  let original, latest, foreign;
  try {
    vm.runInNewContext(fs.readFileSync(gaugePath, 'utf8'), context, { timeout: 1000 });
    for (let n = 0; n < 100 && created.length < 4; n += 1) await pause();
    await pause(); await pause();
    expect(created).toHaveLength(4); expect(cleared).toBe(false);
    const names = fs.readdirSync(claim); expect(names).toHaveLength(1);
    const directory = path.join(claim, names[0]); latest = path.join(directory, 'latest.json');
    expect(fs.lstatSync(claim).mode & 0o7777).toBe(0o700);
    expect(fs.lstatSync(directory).mode & 0o7777).toBe(0o700);
    expect(fs.lstatSync(latest).mode & 0o7777).toBe(0o600);
    original = fs.lstatSync(latest);
    if (scenario === 'file-symlink' || scenario === 'file-replacement') {
      fs.renameSync(latest, path.join(directory, 'held-original.json'));
      foreign = path.join(scratch, 'owned-foreign.txt'); fs.writeFileSync(foreign, 'untouched-owned-fixture');
      if (scenario === 'file-symlink') fs.symlinkSync(foreign, latest);
      else fs.writeFileSync(latest, 'replacement-owned-fixture', { mode: 0o600 });
    }
    if (scenario === 'directory-symlink') {
      fs.renameSync(claim, claim + '-held'); foreign = path.join(scratch, 'owned-foreign-dir'); fs.mkdirSync(foreign);
      fs.symlinkSync(foreign, claim);
    }
    uptime = 60; interval(); await pause(); await pause();
    if (scenario === 'normal') {
      for (let n = 0; n < 50 && fs.statSync(latest).size === 0; n += 1) await pause();
      const value = readComplete(fs.readFileSync(latest, 'utf8'));
      expect(value.pid).toBe(process.pid); expect(value.sequence).toBe(1);
      expect(fs.lstatSync(latest).ino).toBe(original.ino);
      // Fast-forward only the injected timer to close the real gauge FDs.
      uptime = 10801; interval(); await pause();
    } else {
      expect(cleared).toBe(true);
      if (scenario === 'file-symlink') expect(fs.readFileSync(foreign, 'utf8')).toBe('untouched-owned-fixture');
      if (scenario === 'file-replacement') expect(fs.readFileSync(latest, 'utf8')).toBe('replacement-owned-fixture');
      if (scenario === 'directory-symlink') expect(fs.readdirSync(foreign)).toEqual([]);
    }
    for (let n = 0; n < 50 && created.some((handle) => handle.fd !== -1); n += 1) await pause();
    expect(created.every((handle) => handle.fd === -1)).toBe(true);
  } finally {
    for (const handle of created) { try { await handle.close(); } catch {} }
    const current = fs.lstatSync(scratch);
    if (current.ino !== initial.ino || current.dev !== initial.dev || current.uid !== process.getuid() || !current.isDirectory() || current.isSymbolicLink()) throw new Error('Owned fixture cleanup mismatch');
    fs.rmSync(scratch, { recursive: true });
  }
});
