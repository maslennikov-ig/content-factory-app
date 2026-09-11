'use strict';

/**
 * A counting stand-in for the `ioRedis` singleton.
 *
 * The research quota counts in Redis, so any suite that loads the web research
 * service through its own module loader has to answer for that import. One
 * fake here instead of a hand-rolled stub per suite: it records the calls, so a
 * test can assert the key and the lifetime, and `failWith` makes every command
 * throw to exercise the fallback to in-process counting.
 */
const createFakeRedis = ({ failWith = null } = {}) => {
  const values = new Map();
  const ttls = new Map();
  const calls = [];

  const guard = (name, key, run) => {
    calls.push({ name, key });
    if (failWith) return Promise.reject(failWith);
    return Promise.resolve(run());
  };

  const addTo = (key, delta) => {
    const next = Number(values.get(key) ?? 0) + delta;
    values.set(key, String(next));
    return next;
  };

  return {
    values,
    ttls,
    calls,
    get: (key) => guard('get', key, () => values.get(key) ?? null),
    incr: (key) => guard('incr', key, () => addTo(key, 1)),
    decr: (key) => guard('decr', key, () => addTo(key, -1)),
    expire: (key, seconds) =>
      guard('expire', key, () => {
        ttls.set(key, seconds);
        return 1;
      }),
    del: (key) =>
      guard('del', key, () => {
        ttls.delete(key);
        return values.delete(key) ? 1 : 0;
      }),
  };
};

module.exports = { createFakeRedis };
