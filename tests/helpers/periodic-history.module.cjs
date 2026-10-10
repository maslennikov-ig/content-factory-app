'use strict';

const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { isCancellation } = require('@temporalio/workflow');

// Runs actual workflow bodies with explicit virtual time and bounded fixtures.
// A continuation is an SDK-style control-flow exception, never a normal return.
async function runPeriodicWorkflow(file, name, args = [], options = {}) {
  const calls = { activities: [], sleeps: [], continuations: [], logs: [], signals: [], proxies: [] };
  const handlers = new Map();
  let now = 0;
  const end = new Error('Owned virtual workflow fixture stopped');
  const continued = new Error('Owned virtual workflow continued');
  const signal = payload => {
    calls.signals.push(payload);
    handlers.get('sendEmail')(payload);
  };
  const runtime = {
    defineSignal: name => ({ name }),
    setHandler: (definition, handler) => handlers.set(definition.name, handler),
    isCancellation,
    condition: async predicate => {
      if (options.onCondition) await options.onCondition({ calls, signal, now });
      if (!predicate()) throw end;
    },
    sleep: async delay => {
      const ms = delay === '1 hour' ? 3_600_000 : delay;
      if (!Number.isFinite(ms) || ms < 0) throw new Error('Invalid fixture delay');
      calls.sleeps.push(ms);
      now += ms;
      if (options.onSleep) await options.onSleep({ calls, signal, now });
      if (calls.sleeps.length > (options.maxSleeps ?? 100)) throw end;
    },
    proxyActivities: settings => {
      calls.proxies.push(settings);
      return new Proxy({}, { get: (_target, activity) => async (...args) => {
        const entry = { name: activity, args, at: now };
        calls.activities.push(entry);
        if (options.activity) return options.activity(entry, { calls, signal, now });
      } });
    },
    continueAsNew: async (...args) => {
      calls.continuations.push(JSON.parse(JSON.stringify(args)));
      throw continued;
    },
    log: { error: (...args) => calls.logs.push(args) },
  };
  const workflow = loadTypeScriptModule(file, { '@temporalio/workflow': runtime }, {
    sources: { '@contentfactory/orchestrator/signals/send.email.signal':
      'apps/orchestrator/src/signals/send.email.signal.ts' },
  })[name];
  try {
    await workflow(...args);
    return { calls, now, completion: 'returned' };
  } catch (error) {
    if (error === continued || error === end) {
      return { calls, now, completion: error === continued ? 'continued' : 'fixture-stopped' };
    }
    throw error;
  }
}

module.exports = { runPeriodicWorkflow };
