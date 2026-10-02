'use strict';

// Temporary diagnostic candidate: numeric native gauges and aggregate CJS counts
// only. No agent, inspector, GC, application imports, environment or payload reads.
// The exact PM2 7.0.3 fork wrapper and role cwd must match before any file/timer.
try {
  if (require('node:worker_threads').isMainThread) {
    const wrapper = '/usr/local/lib/node_modules/pm2/lib/ProcessContainerFork.js';
    const roles = ['backend', 'orchestrator', 'frontend'];
    const role = roles.find((name) => process.cwd() === `/app/apps/${name}`);
    if (role && process.argv[1] === wrapper) start(role);
  }
} catch {
  // A diagnostic failure must never prevent the application from starting.
}

function start(role) {
  const { promises: fs, constants } = require('node:fs');
  const v8 = require('node:v8');
  const { createHash } = require('node:crypto');
  const handles = new Set();
  const uid = process.getuid();
  const pid = process.pid;
  const startedUptime = process.uptime();
  const packagePaths = {
    temporal: ['/node_modules/@temporalio/'],
    prisma: ['/node_modules/@prisma/client/', '/node_modules/.prisma/client/'],
    mastra: ['/node_modules/@mastra/'],
    sentry: ['/node_modules/@sentry/'],
    next: ['/node_modules/next/'],
    openai: ['/node_modules/openai/'],
    twitter: ['/node_modules/twitter-api-v2/'],
    bluesky: ['/node_modules/@atproto/'],
    farcaster: ['/node_modules/@neynar/'],
    google: ['/node_modules/@googleapis/', '/node_modules/googleapis/'],
  };
  const packageNames = Object.keys(packagePaths);
  let stopped = false;
  let inFlight = true;
  let sequence = 0;
  let parent, claim, directory, file, parentStat, claimStat, directoryStat, fileStat;
  let claimPath, directoryPath, filePath, startTicks;
  const timer = setInterval(tick, 60000);
  timer.unref();

  function stop() {
    stopped = true;
    clearInterval(timer);
    for (const handle of handles) {
      handles.delete(handle);
      // close waits for pending native file I/O; it is not a kernel cancellation.
      try { void handle.close().catch(() => {}); } catch {}
    }
  }
  function active() {
    if (stopped) throw new Error('Diagnostic stopped');
  }
  function keep(handle) {
    if (stopped) {
      try { void handle.close().catch(() => {}); } catch {}
      throw new Error('Diagnostic stopped');
    }
    handles.add(handle);
    return handle;
  }
  function number(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid numeric gauge');
    return value;
  }
  function same(a, b) {
    return a.dev === b.dev && a.ino === b.ino && !a.isSymbolicLink();
  }
  function owned(stat, isDirectory) {
    if (stat.uid !== uid || (stat.mode & 0o7777) !== (isDirectory ? 0o700 : 0o600) ||
        (isDirectory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) {
      throw new Error('Diagnostic ownership changed');
    }
    return stat;
  }
  async function identity() {
    const currentParent = await fs.lstat('/tmp'); active();
    if (!currentParent.isDirectory() || !same(currentParent, parentStat)) throw new Error('Parent replaced');
    const currentClaim = owned(await fs.lstat(claimPath), true); active();
    if (!same(currentClaim, claimStat)) throw new Error('Role claim replaced');
    const currentDirectory = owned(await fs.lstat(directoryPath), true); active();
    if (!same(currentDirectory, directoryStat)) throw new Error('Directory replaced');
    const currentFile = owned(await fs.lstat(filePath), false); active();
    const currentFd = owned(await file.stat(), false); active();
    if (!same(currentFile, fileStat) || !same(currentFd, fileStat)) throw new Error('File replaced');
  }
  async function initialize() {
    parent = keep(await fs.open('/tmp', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW));
    parentStat = await parent.stat(); active();
    if (!parentStat.isDirectory()) throw new Error('Invalid temporary directory');
    // Exclusive per-role claim: even a restarted role cannot accumulate files.
    // An existing path (owned or foreign) disables only this diagnostic; no reuse.
    const claimName = `cf-runtime-memory-${role}`;
    claimPath = `/tmp/${claimName}`;
    await fs.mkdir(`/proc/self/fd/${parent.fd}/${claimName}`, { mode: 0o700 }); active();
    claim = keep(await fs.open(`/proc/self/fd/${parent.fd}/${claimName}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW));
    claimStat = owned(await claim.stat(), true); active();
    const visibleClaim = owned(await fs.lstat(claimPath), true); active();
    if (!same(visibleClaim, claimStat)) throw new Error('Role claim replaced');
    const created = await fs.mkdtemp(`/proc/self/fd/${claim.fd}/sample-`); active();
    const name = created.slice(created.lastIndexOf('/') + 1);
    if (!/^sample-[A-Za-z0-9]{6}$/.test(name)) throw new Error('Invalid diagnostic directory');
    directoryPath = `${claimPath}/${name}`;
    directory = keep(await fs.open(`/proc/self/fd/${claim.fd}/${name}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW));
    directoryStat = owned(await directory.stat(), true); active();
    const visibleDirectory = owned(await fs.lstat(directoryPath), true); active();
    if (!same(visibleDirectory, directoryStat)) throw new Error('Directory replaced');
    filePath = `${directoryPath}/latest.json`;
    file = keep(await fs.open(`/proc/self/fd/${directory.fd}/latest.json`,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
    fileStat = owned(await file.stat(), false); active();
    const stat = await fs.readFile('/proc/self/stat', 'utf8'); active();
    if (stat.length > 4096 || !stat.startsWith(`${pid} (`)) throw new Error('Unknown process identity');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (!/^\d{1,16}$/.test(fields[19] || '')) throw new Error('Unknown process start');
    startTicks = number(Number(fields[19]));
    if (!startTicks) throw new Error('Unknown process start');
    await identity();
    inFlight = false;
  }
  function cacheCounts() {
    const packages = Object.fromEntries(packageNames.map((name) => [name, 0]));
    if (!require.cache || typeof require.cache !== 'object') throw new Error('Unknown CJS cache');
    let total = 0;
    let filenameChars = 0;
    // No module values/exports are touched. Counts cover CJS only, not ESM/native.
    for (const filename in require.cache) {
      if (!Object.hasOwn(require.cache, filename)) continue;
      filenameChars += filename.length;
      if (++total > 50000 || filename.length > 8192 || filenameChars > 8 * 1024 * 1024) throw new Error('Cache bound exceeded');
      for (const name of packageNames) {
        if (packagePaths[name].some((part) => filename.includes(part))) packages[name] += 1;
      }
    }
    return { total, packages };
  }
  function sample() {
    const memory = process.memoryUsage();
    const heap = v8.getHeapStatistics();
    const spaces = v8.getHeapSpaceStatistics();
    if (!Array.isArray(spaces) || spaces.length > 32) throw new Error('Space bound exceeded');
    const constrained = number(process.constrainedMemory());
    const uptimeMs = number(Math.floor(process.uptime() * 1000));
    return {
      role, pid, processStartTicks: startTicks, sequence: sequence + 1, uptimeMs,
      memory: Object.fromEntries(['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].map((name) => [name, number(memory[name])])),
      v8: {
        heapSizeLimit: number(heap.heap_size_limit), available: number(heap.total_available_size),
        malloced: number(heap.malloced_memory), peakMalloced: number(heap.peak_malloced_memory),
        executable: number(heap.total_heap_size_executable), external: number(heap.external_memory),
      },
      spaces: spaces.map((space) => {
        if (!/^[a-z][a-z0-9_]{0,40}$/.test(space.space_name)) throw new Error('Invalid space name');
        return { name: space.space_name, size: number(space.space_size), used: number(space.space_used_size),
          available: number(space.space_available_size), physical: number(space.physical_space_size) };
      }),
      // Node returns 0 when the constraint is unknown or absent, not free memory.
      constrainedMemoryBytes: constrained === 0 ? null : constrained,
      cjs: cacheCounts(),
    };
  }
  async function writeSample() {
    await identity();
    const value = sample();
    const sha256 = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const buffer = Buffer.from(JSON.stringify({ schema: 'content-factory-runtime-memory/v1', sample: value, sha256 }) + '\n');
    if (buffer.length > 32768) throw new Error('Record bound exceeded');
    active();
    const result = await file.write(buffer, 0, buffer.length, 0); active();
    if (result.bytesWritten !== buffer.length) throw new Error('Partial diagnostic write');
    await file.truncate(buffer.length); active();
    await identity();
    sequence += 1;
    if (sequence >= 180) stop();
  }
  function tick() {
    if (stopped) return;
    try {
      const elapsed = process.uptime() - startedUptime;
      if (inFlight || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 10800 || sequence >= 180) {
        stop(); return;
      }
      inFlight = true;
      void writeSample().catch(stop).finally(() => { inFlight = false; });
    } catch { stop(); }
  }
  // Neither initialization nor samples are awaited by the application wrapper.
  void initialize().catch(stop);
}
