'use strict';

/**
 * `content-factory-next-fn33.105`: what the shared request helper hands the
 * common refusal handler.
 *
 * Since `content-factory-next-fn33.65` the handler gets a copy of the answer,
 * because on 402 and 403 it reads the body and the caller would otherwise be
 * left with an empty one. A copy is cheap for a refusal and expensive for a
 * stream: the generator reads its answer through `getReader()`, and a clone
 * nobody reads makes the browser hold the whole generation in memory to keep
 * the two sides of the tee in step.
 *
 * So the copy is made where it is needed — for an answer that failed — and a
 * successful answer is passed through as itself. The handler reads only
 * headers on that path, which is what the second test here holds in place.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { customFetch } = loadTypeScriptModule(
  'libraries/helpers/src/utils/custom.fetch.func.ts'
);

/** A response that counts the copies taken of it. */
const answer = ({ ok = true, status = 200 } = {}) => {
  const response = {
    ok,
    status,
    clones: 0,
    headers: { get: () => null },
    json: async () => ({ message: 'нет прав', code: 'voice_forbidden' }),
    clone() {
      this.clones += 1;
      return { ...this, clone: this.clone, json: this.json };
    },
  };
  return response;
};

const run = async (response) => {
  const seen = [];
  global.fetch = async () => response;
  const request = customFetch({
    baseUrl: 'http://backend',
    afterRequest: async (url, options, given) => {
      seen.push(given);
      return true;
    },
  });
  const returned = await request('/anything');
  delete global.fetch;
  return { returned, seen };
};

test('a successful answer is not copied: the stream stays a stream', async () => {
  const response = answer();
  const { returned, seen } = await run(response);

  expect(response.clones).toBe(0);
  expect(seen).toHaveLength(1);
  // The handler reads headers on this path and nothing else, so it gets the
  // answer itself.
  expect(seen[0]).toBe(response);
  expect(returned).toBe(response);
});

test('a refused answer is copied, so both sides can read the body', async () => {
  const response = answer({ ok: false, status: 403 });
  const { returned, seen } = await run(response);

  expect(response.clones).toBe(1);
  expect(seen[0]).not.toBe(response);
  // The caller still gets the original, body intact.
  expect(returned).toBe(response);
  expect(await returned.json()).toEqual({
    message: 'нет прав',
    code: 'voice_forbidden',
  });
});
