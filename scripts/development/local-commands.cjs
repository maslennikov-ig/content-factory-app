#!/usr/bin/env node
// Guards the inherited local launch/reset aliases. Production uses entrypoint.sh.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const schema = path.join(root, 'libraries/nestjs-libraries/src/database/prisma/schema.prisma');
const roles = ['backend', 'frontend', 'orchestrator'];
const usage = 'Use --dry-run, or --apply --confirm-local cf-dev-db for an intentional local schema change/reset.';

function argumentsFor(argv) {
  const [action, ...rest] = argv;
  if (!['start', ...roles.map(role => `start-${role}`), 'push', 'reset'].includes(action)) {
    throw new Error('Unknown local command.');
  }
  const args = rest[0] === '--' ? rest.slice(1) : rest;
  if (args.length === 1 && args[0] === '--help') return { action, help: true };
  let dryRun = false;
  let apply = false;
  let confirm;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run' && !dryRun) dryRun = true;
    else if (args[i] === '--apply' && !apply) apply = true;
    else if (args[i] === '--confirm-local' && confirm === undefined && args[i + 1]) confirm = args[++i];
    else throw new Error(`Unsupported or repeated argument. ${usage}`);
  }
  if (dryRun && (apply || confirm !== undefined)) throw new Error(`Conflicting intent. ${usage}`);
  if (action.startsWith('start') && (apply || confirm !== undefined)) {
    throw new Error('Startup accepts --dry-run only and never applies a schema change.');
  }
  return { action, dryRun, apply, confirm };
}

function readEnvironment(file) {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Cannot read local environment configuration.');
  }
}

function verifyTarget(value, key) {
  // Literal loopback only. No DNS aliases, port defaults, expansion, encoded
  // host/database names, alternate libpq hosts or configurable schema paths.
  if (typeof value !== 'string' || /[\s$\\]/.test(value) || /%(?![a-f\d]{2})/i.test(value) ||
      !/^postgres(?:ql)?:\/\/cf-dev:[^@/?#]+@(localhost|127\.0\.0\.1|\[::1\]):5433\/cf-dev-db(?:\?schema=public)?$/.test(value)) {
    throw new Error(`${key} must name the explicit local cf-dev / cf-dev-db profile on loopback port 5433. Production and ambiguous targets are refused.`);
  }
  // Parse without copying an exception containing the full credential-bearing URL.
  try { new URL(value); } catch { throw new Error(`${key} is not a valid local connection URL.`); }
  return value;
}

function verifiedEnvironment() {
  const fileEnv = readEnvironment(path.join(root, '.env'));
  const sources = [process.env, fileEnv, readEnvironment(path.join(path.dirname(schema), '.env')), readEnvironment(path.join(root, 'prisma/.env'))];
  for (const source of sources) {
    if (source.NODE_ENV !== undefined && !['development', 'test'].includes(source.NODE_ENV)) {
      throw new Error('Legacy local commands refuse production or ambiguous NODE_ENV.');
    }
  }
  const selected = {};
  for (const key of ['DATABASE_URL', 'MASTRA_DATABASE_URL']) {
    const values = sources.map(source => source[key]).filter(value => value !== undefined && (key === 'DATABASE_URL' || value !== ''));
    if (key === 'DATABASE_URL' && values.length === 0) throw new Error('DATABASE_URL must be explicitly configured for the local development stand.');
    for (const value of values) verifyTarget(value, key);
    if (new Set(values).size > 1) throw new Error(`${key} conflicts between the inherited environment and checkout/schema .env files. Refusing before any child process.`);
    if (values.length) selected[key] = values[0];
  }
  // Pin the checked values; downstream dotenv defaults cannot replace them.
  return { ...fileEnv, ...process.env, ...selected };
}

function commandFor(action) {
  if (action.startsWith('start')) {
    const selectedRoles = action === 'start' ? roles : [action.slice('start-'.length)];
    return ['pnpm', [...selectedRoles.flatMap(role => ['--filter', `./apps/${role}`]), ...(selectedRoles.length > 1 ? ['--parallel'] : []), 'run', 'start']];
  }
  const args = ['exec', 'prisma', 'db', 'push', '--schema', schema];
  if (action === 'reset') args.push('--force-reset', '--accept-data-loss');
  return ['pnpm', args];
}

function main() {
  const intent = argumentsFor(process.argv.slice(2));
  if (intent.help) {
    console.log(`Local commands use only cf-dev / cf-dev-db at loopback:5433. ${usage}\nStartup uses existing foreground app scripts, without PM2 or Prisma.`);
    return;
  }
  const env = verifiedEnvironment();
  const target = new URL(env.DATABASE_URL);
  const label = `cf-dev@${target.hostname}:5433/cf-dev-db`;
  const [command, args] = commandFor(intent.action);
  if (intent.dryRun) {
    console.log(`DRY RUN: ${intent.action} for ${label}. No subprocess or database change.\n${command} ${args.join(' ')}`);
    return;
  }
  if (!intent.action.startsWith('start') && (!intent.apply || intent.confirm !== 'cf-dev-db')) {
    throw new Error(`No schema change executed for ${label}. ${usage}`);
  }
  console.log(`Local ${intent.action}: ${label}.${intent.action === 'reset' ? ' Confirmed deletion of all local database data.' : ''}`);
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: false });
  const onInterrupt = () => child.kill('SIGINT');
  const onTerminate = () => child.kill('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const removeSignals = () => {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  };
  child.once('error', () => {
    removeSignals();
    console.error('Cannot start the installed local command. Check the pinned pnpm/Prisma installation.');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    removeSignals();
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
  });
}

try { main(); } catch (error) {
  console.error(`Local command refused: ${error.message}`);
  process.exitCode = 1;
}
