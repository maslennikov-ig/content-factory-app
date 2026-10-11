const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

function clientFor(status, body, retryAfter) {
  const fetch = jest.fn(async () => ({
    status,
    statusText: 'fixture',
    ok: status >= 200 && status < 300,
    headers: { get: () => retryAfter ?? null },
    json: async () => JSON.parse(body),
    text: async () => body,
  }));
  const sdk = loadTypeScriptModule('apps/sdk/src/index.ts', {
    'node-fetch': { __esModule: true, default: fetch, FormData: class {} },
  });
  return { sdk, fetch };
}

describe('SDK opt-in HTTP errors (offline transport)', () => {
  test('keeps documented JSON 409 compatibility by default', async () => {
    const body = { code: 'CF_QUEUE_BUSY', message: 'busy' };
    const { sdk } = clientFor(409, JSON.stringify(body));
    expect(
      await new sdk.default('fixture', 'https://offline.invalid').post({})
    ).toEqual(body);
  });
  test.each([
    [401, '{"code":"UNAUTHORIZED"}', 'UNAUTHORIZED', false],
    [409, '{"code":"CF_QUEUE_BUSY"}', 'CF_QUEUE_BUSY', false],
    [503, '{"message":"gateway"}', undefined, true],
    [503, '<html>gateway unavailable</html>', undefined, true],
  ])(
    'exposes status/code/retry/body for %i %s',
    async (status, raw, code, retryable) => {
      const { sdk, fetch } = clientFor(status, raw, '12');
      const client = new sdk.default('fixture', 'https://offline.invalid', {
        httpErrors: 'throw',
      });
      let error;
      try {
        await client.integrations();
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(sdk.ContentFactoryHttpError);
      expect(error).toMatchObject({
        status,
        retryable,
        retryAfter: '12',
        rawBody: raw,
      });
      expect(error.code).toBe(code);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
  test('applies opt-in to delete while preserving its raw Response return', async () => {
    const { sdk } = clientFor(401, '{"code":"UNAUTHORIZED"}');
    expect(
      (
        await new sdk.default('fixture', 'https://offline.invalid').deletePost(
          'p'
        )
      ).status
    ).toBe(401);
    await expect(
      new sdk.default('fixture', 'https://offline.invalid', {
        httpErrors: 'throw',
      }).deletePost('p')
    ).rejects.toMatchObject({ status: 401 });
  });
});
