/**
 * Unit-only EVAL reply fixture. It does not execute Lua or prove distributed
 * behavior; registration.distributed-budget.test.cjs separately uses Redis.
 */
function createRegistrationScriptRedis() {
  const slots = new Map();
  const connections = [];
  const calls = [];
  const get = (key) => {
    const slot = slots.get(key);
    if (slot && slot.expiresAt <= Date.now()) {
      slots.delete(key);
      return undefined;
    }
    return slot;
  };
  const source = {
    status: 'ready',
    eval: async () => {
      throw new Error('Shared-client EVAL must not be used by effects');
    },
    duplicate(options) {
      const connection = {
        options,
        status: 'wait',
        on: () => connection,
        connect: async () => {
          connection.status = 'ready';
        },
        disconnect: () => {
          connection.status = 'end';
          connection.closed = true;
        },
        async eval(script, keyCount, ...args) {
          calls.push({ script, keyCount, args });
          const keys = args.slice(0, keyCount);
          const owner = args[keyCount];
          if (script.includes("redis.call('DEL'")) {
            let removed = 0;
            for (const key of keys) {
              if (get(key)?.owner === owner && slots.delete(key)) removed += 1;
            }
            return removed;
          }
          const held = keys.map(get).filter(Boolean);
          if (held.length) {
            return [
              0,
              Math.max(...held.map((slot) => slot.expiresAt - Date.now())),
            ];
          }
          for (const key of keys) {
            slots.set(key, { owner, expiresAt: Date.now() + 60_000 });
          }
          return [1, 60_000];
        },
      };
      connections.push(connection);
      return connection;
    },
    reset() {
      slots.clear();
      calls.length = 0;
      connections.length = 0;
    },
    slots,
    connections,
    calls,
  };
  return source;
}

module.exports = { createRegistrationScriptRedis };
