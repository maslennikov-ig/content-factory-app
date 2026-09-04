const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Отказ, показанный общей модалкой, обязан отпустить кнопку.
 *
 * `content-factory-next-fn33.65`: общий помощник запроса отвечал на «этот ответ
 * я уже обработал» промисом без `resolve` и без `reject`. Экран, который ждал
 * ответа, не получал его никогда: `finally` не срабатывал, и кнопка навсегда
 * оставалась в состоянии «Сохраняем…». Так вело себя любое место продукта на
 * 403 без `code`, а также на 406 и 402.
 */

const { customFetch } = loadTypeScriptModule(
  'libraries/helpers/src/utils/custom.fetch.func.ts'
);

const REFUSAL = {
  statusCode: 403,
  message: 'You are not allowed to perform this action.',
};

function stubFetch(status, body) {
  global.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

const settleOrTimeout = async (promise, ms = 500) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('никогда не завершился'), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

describe('общий помощник запроса и отказ, показанный модалкой', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('после показанной модалки вызывающий код получает ответ, а не вечное ожидание', async () => {
    stubFetch(403, REFUSAL);
    const shown = [];
    const newFetch = customFetch({
      baseUrl: 'https://backend.test',
      afterRequest: async (url, options, response) => {
        // Так это делает `layout.context.tsx`: читает тело отказа, показывает
        // модалку и отвечает «дальше не передавать».
        const body = await response.json();
        shown.push(body.message);
        return false;
      },
    });

    const result = await settleOrTimeout(newFetch('/settings/subscription'));

    expect(shown).toEqual([REFUSAL.message]);
    expect(result).not.toBe('никогда не завершился');
    expect(result.status).toBe(403);
    expect(result.ok).toBe(false);
  });

  test('тело ответа остаётся нечитанным для вызывающего кода', async () => {
    stubFetch(402, { statusCode: 402, message: 'Payment Required' });
    const newFetch = customFetch({
      baseUrl: 'https://backend.test',
      afterRequest: async (url, options, response) => {
        await response.json();
        return false;
      },
    });

    const result = await settleOrTimeout(newFetch('/billing/charge'));

    expect(result).not.toBe('никогда не завершился');
    await expect(result.json()).resolves.toEqual({
      statusCode: 402,
      message: 'Payment Required',
    });
  });

  test('обычный ответ проходит как прежде', async () => {
    stubFetch(200, { ok: true });
    const newFetch = customFetch({
      baseUrl: 'https://backend.test',
      afterRequest: async () => true,
    });

    const result = await settleOrTimeout(newFetch('/user/self'));

    expect(result).not.toBe('никогда не завершился');
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
  });
});
