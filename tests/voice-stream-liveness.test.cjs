'use strict';
const http = require('node:http');
const { EventEmitter } = require('node:events');
const compression = require('compression');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { startNdjsonStream, streamCompressionFilter } = loadTypeScriptModule('apps/backend/src/api/routes/ndjson-stream.ts');
const { parseTelegramExport } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/brand-voice/telegram-export.ts');

test('heartbeat arrives every 10 seconds and stops on completion or disconnect', () => {
  jest.useFakeTimers();
  try {
    for (const ending of ['complete', 'close']) {
      const response = Object.assign(new EventEmitter(), {
        setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(),
      });
      const stop = startNdjsonStream(response);
      expect(response.flushHeaders).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(9999);
      expect(response.write).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(response.write).toHaveBeenCalledWith('{"name":"heartbeat"}\n');
      ending === 'complete' ? stop() : response.emit('close');
      jest.advanceTimersByTime(20000);
      expect(response.write).toHaveBeenCalledTimes(1);
      expect(response.listenerCount('close')).toBe(0);
    }
  } finally { jest.useRealTimers(); }
});

test('real gzip middleware sends first NDJSON record before the slow operation finishes', async () => {
  const compress = compression({ filter: streamCompressionFilter });
  let finish;
  const server = http.createServer((request, response) => compress(request, response, () => {
    const stop = startNdjsonStream(response);
    response.write('{"name":"started"}\n');
    finish = () => { stop(); if (!response.writableEnded) response.end('{"name":"done"}\n'); };
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let request;
  try {
    const started = performance.now();
    const first = await new Promise((resolve, reject) => {
      request = http.get({ host: '127.0.0.1', port: server.address().port, headers: { 'Accept-Encoding': 'gzip' } }, response => {
        response.once('data', chunk => resolve({ headers: response.headers, text: chunk.toString() }));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(1500, () => request.destroy(new Error('first record was buffered')));
    });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(first.text).toBe('{"name":"started"}\n');
    expect(first.headers['content-encoding']).toBeUndefined();
    expect(first.headers['x-accel-buffering']).toBe('no');
    expect(first.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
    finish();
  } finally {
    finish?.();
    request?.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});

test('compression skips NDJSON and SSE while retaining normal JSON compression', () => {
  for (const type of ['application/x-ndjson; charset=utf-8', 'text/event-stream']) {
    expect(streamCompressionFilter({}, { getHeader: () => type })).toBe(false);
  }
  expect(streamCompressionFilter({}, { getHeader: () => 'application/json' })).toBe(true);
});

test('Telegram selects the latest 300 eligible dated entries regardless of file order', () => {
  const messages = Array.from({ length: 350 }, (_, index) => ({
    id: index, date: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    text: `Сообщение ${index}. ` + 'Свой авторский текст. '.repeat(10),
  }));
  messages.push({ id: 999, date: '2026-01-01', text: 'Коротко' });
  messages.push({ id: 998, date: '2026-01-01', forwarded_from: 'Другой', text: messages[0].text });
  const shuffled = [...messages.filter((_, index) => index % 2), ...messages.filter((_, index) => !(index % 2))];
  for (const input of [messages, [...messages].reverse(), shuffled]) {
    const parsed = parseTelegramExport({ messages: input });
    expect(parsed.eligible).toBe(350);
    expect(parsed.seen).toBe(352);
    expect(parsed.truncated).toBe(true);
    expect(parsed.candidates.map(one => Number(one.externalRef))).toEqual(Array.from({ length: 300 }, (_, index) => 349 - index));
  }
});


test('transport heartbeat cannot overwrite intake or adaptation stage labels', () => {
  const loader = require('./helpers/load-tsx.cjs').loadTypeScriptModule;
  const intake = loader('apps/frontend/src/components/content-intelligence/intake/intake.adapter.ts');
  const pieces = loader('apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts');
  expect(intake.readIntakeEvent('{"name":"heartbeat"}')).toBeNull();
  expect(pieces.readAdaptEvent('{"name":"heartbeat"}')).toBeNull();
});
