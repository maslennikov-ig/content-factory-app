'use strict';

/**
 * One serializable-with-retry helper for both repositories
 * (`content-factory-next-qicl`): the behaviour the two copies had, pinned.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

class HttpException extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const { serializableWithRetry } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/serializable.transaction.ts',
  { '@nestjs/common': { HttpException } }
);

const clientFailing = (errors) => {
  const calls = [];
  return {
    calls,
    $transaction: async (run, options) => {
      calls.push(options);
      const error = errors.shift();
      if (error) throw error;
      return run('tx');
    },
  };
};

const conflict = () => Object.assign(new Error('conflict'), { code: 'P2034' });

test('a write conflict is retried, serializable every time', async () => {
  const client = clientFailing([conflict(), conflict()]);
  await expect(serializableWithRetry(client, async (tx) => `ran on ${tx}`, 'busy')).resolves.toBe('ran on tx');
  expect(client.calls).toEqual([
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
});

test('three conflicts answer «busy» with 503', async () => {
  const client = clientFailing([conflict(), conflict(), conflict()]);
  await expect(serializableWithRetry(client, async () => 'never', 'Workspace is busy')).rejects.toMatchObject({
    message: 'Workspace is busy',
    status: 503,
  });
  expect(client.calls).toHaveLength(3);
});

test('any other error leaves at once', async () => {
  const client = clientFailing([new Error('not found')]);
  await expect(serializableWithRetry(client, async () => 'never', 'busy')).rejects.toThrow('not found');
  expect(client.calls).toHaveLength(1);
});
