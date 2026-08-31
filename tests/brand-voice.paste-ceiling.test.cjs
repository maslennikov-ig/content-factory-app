'use strict';

require('reflect-metadata');

/**
 * `content-factory-next-vme.10` — the pasted-text intake had no ceiling of
 * its own. Every JSON route but two got express's own 100 KB default, the
 * DTO promised 200,000 characters per sample and 500 samples per request,
 * and cyrillic past roughly forty-five thousand characters was already over
 * 100 KB in UTF-8 — so the wizard's own paste field failed on an ordinary
 * post, as a bare 413 with no body, shown to a person as «неизвестная
 * ошибка» on an action the product told them was allowed.
 *
 * The first pass at the fix left two more of the same hole open, both found
 * by running the real backend rather than by reading the tests:
 *
 * a parser given twice the ceiling for headroom, with a Nest guard
 * downstream of it holding the real number, is a 4–8 MB *vilka* rather than
 * a ceiling — anything past 8 MB never reached the guard and got express's
 * own bare 413 again; and a `class-validator` constraint checking the sum of
 * `items[].text.length` produced the global `ValidationPipe`'s own shapeless
 * 400, not `VoiceErrorBodyV1`, which is the exact case the comment two lines
 * above it in the same file warns against.
 *
 * Both are closed now by moving each check to the one layer that can
 * actually hold a ceiling rather than re-check one: the byte ceiling lives
 * inside the parser itself (`createVoicePasteBodyLimiter`, mounted by
 * `main.ts`), and the character-sum ceiling lives in `VoiceService.intake`,
 * which can throw a `VoiceError` the way every other product rule here does.
 * This file proves both against running code — a real `express()` app for
 * the first, a real `VoiceService` for the second — because a regular
 * expression over the source proved the first version safe when it was not.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const dtoPath =
  'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts';
const controllerPath = 'apps/backend/src/api/routes/brand-voice.controller.ts';
const pastePath = 'apps/backend/src/api/routes/brand-voice.paste.ts';
const mainPath = 'apps/backend/src/main.ts';
const copyPath = 'apps/frontend/src/components/brand-voice/voice-copy.ts';

/** Every relative import inside `voiceBase`, so a nested load never needs a
 * source entry named by hand. Copied from `brand-voice.sample-files.test.cjs`,
 * which ties the file ceilings together the same way. */
const relativeSources = () => {
  const map = {};
  for (const file of fs.readdirSync(path.join(repositoryRoot, voiceBase))) {
    if (!file.endsWith('.ts')) continue;
    map[`./${file.replace(/\.ts$/u, '')}`] = `${voiceBase}/${file}`;
  }
  return map;
};

const contractAlias = `@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract`;

const sources = {
  ...relativeSources(),
  [contractAlias]: `${voiceBase}/voice-wiring.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract': `${voiceBase}/assist.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types': `${voiceBase}/brand-voice.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack': `${voiceBase}/locale-pack.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural': `${voiceBase}/plural.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${profileBase}/brand-profile.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation': `${profileBase}/brand-profile.validation.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': `${profileBase}/brand-profile.repository.ts`,
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  { sources }
);
const sampleIntake = loadTypeScriptModule(
  `${voiceBase}/sample-intake.ts`,
  {},
  { sources }
);
const dto = loadTypeScriptModule(dtoPath, {}, { sources });
const paste = loadTypeScriptModule(pastePath, {}, { sources });
const copy = loadTypeScriptModule(copyPath, {}, { sources });

const blanked = (relativePath) =>
  fs
    .readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');

const admin = { organizationId: 'org-a', userId: 'user-admin', canManage: true };

function serviceHarness() {
  const { VoiceService } = loadTypeScriptModule(
    `${voiceBase}/voice.service.ts`,
    prismaMocks,
    { sources }
  );
  const { VoiceSampleRepository } = loadTypeScriptModule(
    `${voiceBase}/voice-sample.repository.ts`,
    prismaMocks,
    { sources }
  );
  const { VoiceProfileRepository } = loadTypeScriptModule(
    `${voiceBase}/voice-profile.repository.ts`,
    prismaMocks,
    { sources }
  );
  const { BrandProfileRepository } = loadTypeScriptModule(
    `${profileBase}/brand-profile.repository.ts`,
    prismaMocks,
    { sources }
  );
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  return new VoiceService(samples, profiles, null, {}, () =>
    new Date('2026-08-23T12:00:00.000Z')
  );
}

/* ---------------------------------------------------------------------- */

describe('one ceiling, stated in the contract and checked against itself', () => {
  test('the pinned numbers', () => {
    const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;
    expect(limits.maxCharsPerSample).toBe(200_000);
    expect(limits.maxSamplesPerRequest).toBe(500);
    expect(limits.maxCharsPerRequest).toBe(1_000_000);
    expect(limits.maxBodyBytes).toBe(4 * 1024 * 1024);
  });

  test('the per-sample ceiling is the same one sample-intake.ts truncates at', () => {
    expect(contract.VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerSample).toBe(
      sampleIntake.MAX_SAMPLE_CHARS
    );
  });

  test('maxBodyBytes clears the worst case with real headroom, not against it', () => {
    const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;
    // Cyrillic is two bytes per character in UTF-8.
    const worstCaseText = limits.maxCharsPerRequest * 2;
    // Every other field on an item, filled to its own ceiling, cyrillic,
    // on every one of the five hundred items a request may carry.
    const worstCaseOtherFields =
      (200 /* title */ + 512 /* externalRef */ + 64 /* sourceId */ + 64 /* postId */) *
      2 *
      limits.maxSamplesPerRequest;
    const worstCase = worstCaseText + worstCaseOtherFields;

    expect(worstCase).toBeLessThan(limits.maxBodyBytes);
    // A margin, not a razor's edge.
    expect(limits.maxBodyBytes - worstCase).toBeGreaterThan(500_000);
  });

  test('the refusal is named, with a status and a screen meaning', () => {
    expect(contract.VOICE_ERROR_CODES.VOICE_PAYLOAD_TOO_LARGE).toEqual({
      status: 413,
      screenState: 'error',
    });
  });
});

describe('the DTO reads the per-item and per-batch ceilings from the contract', () => {
  test('MaxLength and ArrayMaxSize are the contract fields', () => {
    const code = blanked(dtoPath);
    expect(code).toMatch(
      /@MaxLength\(VOICE_SAMPLE_PASTE_LIMITS\.maxCharsPerSample\)/u
    );
    expect(code).toMatch(
      /@ArrayMaxSize\(VOICE_SAMPLE_PASTE_LIMITS\.maxSamplesPerRequest\)/u
    );
    // No stray restatement of the number this reads off the contract.
    expect(code).not.toMatch(/200_000|200000/u);
  });

  test('one item right at the per-sample ceiling passes; one character over it is refused', async () => {
    const { plainToInstance } = require('class-transformer');
    const { validate } = require('class-validator');
    const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;

    const atCeiling = plainToInstance(dto.VoiceSampleItemDto, {
      title: 'x',
      text: 'ф'.repeat(limits.maxCharsPerSample),
    });
    expect(await validate(atCeiling)).toEqual([]);

    const overCeiling = plainToInstance(dto.VoiceSampleItemDto, {
      title: 'x',
      text: 'ф'.repeat(limits.maxCharsPerSample + 1),
    });
    expect(await validate(overCeiling)).not.toEqual([]);
  });

  test('the DTO no longer holds the batch-sum check — that refusal must not be a shapeless 400', async () => {
    // The exact live failure the team lead found: eight items of 150,000
    // characters each, every one of them comfortably under the per-item
    // ceiling, whose sum clears the batch one. The DTO's own validation must
    // have nothing to say about this any more — `class-validator`'s failure
    // shape (`{message: [...], error: 'Bad Request', statusCode: 400}`) is
    // not `VoiceErrorBodyV1`, and no code on it is exactly what a screen
    // cannot branch on.
    const { plainToInstance } = require('class-transformer');
    const { validate } = require('class-validator');
    const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;

    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `item-${i}`,
      text: 'ф'.repeat(150_000),
    }));
    expect(
      items.reduce((sum, item) => sum + item.text.length, 0)
    ).toBeGreaterThan(limits.maxCharsPerRequest);

    const batch = plainToInstance(dto.VoiceSampleIntakeDto, {
      origin: 'PASTE',
      usagePurpose: 'OWN_VOICE',
      items,
    });
    expect(
      (await validate(batch)).filter((error) => error.property === 'items')
    ).toEqual([]);

    const code = blanked(dtoPath);
    expect(code).not.toMatch(/TotalSampleCharsWithinCeiling|@Validate\(/u);
  });
});

describe('VoiceService.intake refuses a batch over the character ceiling with a named code', () => {
  test('eight 150,000-character items — the exact case the DTO validator used to answer with a shapeless 400', async () => {
    const service = serviceHarness();
    const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `item-${i}`,
      text: 'ф'.repeat(150_000),
    }));

    let refusal;
    try {
      await service.intake(admin, {
        origin: 'PASTE',
        usagePurpose: 'OWN_VOICE',
        items,
      });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeDefined();
    expect(refusal.code).toBe('VOICE_PAYLOAD_TOO_LARGE');
    expect(refusal.status).toBe(413);
    expect(refusal.message).toMatch(new RegExp(String(limits.maxCharsPerRequest)));
  });

  test('a batch under the ceiling is accepted rather than refused', async () => {
    const service = serviceHarness();
    // Two long-enough-to-count samples, nowhere near either ceiling.
    const prose =
      'Поставщика поменяли — старый срывал сроки. Новый возит по графику, и это видно по журналу смены. '.repeat(
        5
      );

    const answer = await service.intake(admin, {
      origin: 'PASTE',
      usagePurpose: 'OWN_VOICE',
      items: [
        { title: 'первый', text: prose },
        { title: 'второй', text: prose + ' И ещё немного другого текста.' },
      ],
    });

    expect(answer.accepted.length).toBeGreaterThan(0);
  });
});

describe('the controller no longer holds a guard for a ceiling it cannot enforce', () => {
  test('the byte ceiling and its refusal live in brand-voice.paste.ts, not behind a Nest guard on this route', () => {
    const code = blanked(controllerPath);
    expect(code).not.toMatch(/VoicePasteSizeGuard/u);
    expect(paste.VoicePasteSizeGuard).toBeUndefined();
  });
});

describe('createVoicePasteBodyLimiter, proved against a real express() app rather than a source scan', () => {
  const limits = contract.VOICE_SAMPLE_PASTE_LIMITS;

  function buildApp() {
    const app = express();
    app.use(
      ['/content-intelligence/voice/samples'],
      paste.createVoicePasteBodyLimiter()
    );
    // Stands in for Nest routing: whatever got past the limiter lands here.
    // `req.url` is express's own stripped form only for the duration of the
    // limiter's own middleware call; by the time `next()` reaches this
    // handler express has restored it to the full path, so this reads
    // `req.originalUrl` instead to tell the two routes apart.
    app.use((req, res) => {
      res.status(201).json({ reached: true, url: req.originalUrl });
    });
    return app;
  }

  function withServer(app, run) {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, async () => {
        try {
          const result = await run(server.address().port);
          server.close(() => resolve(result));
        } catch (error) {
          server.close(() => reject(error));
        }
      });
    });
  }

  /**
   * `agent: false` plus an explicit `Connection: close` on every request
   * below: without it the socket sits idle-kept-alive after the response,
   * and `server.close()` in `withServer` then waits out Node's default
   * five-second `keepAliveTimeout` before its callback fires — a real
   * connection never asks for keep-alive on a request this large, and a test
   * timing out on socket bookkeeping rather than on anything this file is
   * actually proving is its own kind of false signal.
   */
  const closeConnection = { agent: false, headers: { connection: 'close' } };

  /** A request with a real, correctly declared `Content-Length`. */
  function postWithLength(port, urlPath, buffer, contentType) {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          port,
          path: urlPath,
          method: 'POST',
          agent: closeConnection.agent,
          headers: {
            ...closeConnection.headers,
            'content-type': contentType,
            'content-length': String(buffer.length),
          },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode,
              body: (() => {
                try {
                  return JSON.parse(raw);
                } catch {
                  return null;
                }
              })(),
            });
          });
        }
      );
      request.on('error', reject);
      request.end(buffer);
    });
  }

  /** A request that never states its length — Node sends it chunked, the
   * same shape a client that does not know its own size upfront would send,
   * and the one `Content-Length` alone can never catch. */
  function postChunked(port, urlPath, buffer, contentType) {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          port,
          path: urlPath,
          method: 'POST',
          agent: closeConnection.agent,
          headers: { ...closeConnection.headers, 'content-type': contentType },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode,
              body: (() => {
                try {
                  return JSON.parse(raw);
                } catch {
                  return null;
                }
              })(),
            });
          });
        }
      );
      request.on('error', reject);
      // Two writes rather than one `end(buffer)`, so Node has no full-length
      // buffer to compute a `Content-Length` from and falls back to chunked
      // transfer-encoding, matching how a streamed upload actually arrives.
      request.write(buffer.subarray(0, Math.ceil(buffer.length / 2)));
      request.end(buffer.subarray(Math.ceil(buffer.length / 2)));
    });
  }

  test('a small body under the ceiling reaches the route', async () => {
    const app = buildApp();
    const body = Buffer.from(JSON.stringify({ origin: 'PASTE' }), 'utf8');
    const result = await withServer(app, (port) =>
      postWithLength(port, '/content-intelligence/voice/samples', body, 'application/json')
    );
    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      reached: true,
      url: '/content-intelligence/voice/samples',
    });
  });

  test('a declared Content-Length over the ceiling is refused with the named code — the live case, 11+ MB', async () => {
    const app = buildApp();
    // Comfortably past both the product ceiling (4 MB) and the parser limit
    // the first pass at this fix used (8 MB) — the exact shape of body that
    // still came back as a bare `{"statusCode":413,"message":"request
    // entity too large"}` before this file's fix.
    const oversized = Buffer.alloc(limits.maxBodyBytes + 7 * 1024 * 1024, 0x61);
    const result = await withServer(app, (port) =>
      postWithLength(
        port,
        '/content-intelligence/voice/samples',
        oversized,
        'application/json'
      )
    );
    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ code: 'VOICE_PAYLOAD_TOO_LARGE' });
    expect(result.body.message).toMatch(/МБ/u);
  });

  test('a body that never declares its length is refused too, once the parser itself finds it too large', async () => {
    const app = buildApp();
    const oversized = Buffer.alloc(limits.maxBodyBytes + 1024, 0x61);
    const result = await withServer(app, (port) =>
      postChunked(
        port,
        '/content-intelligence/voice/samples',
        oversized,
        'application/json'
      )
    );
    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ code: 'VOICE_PAYLOAD_TOO_LARGE' });
  });

  /**
   * The first fix compared `req.url` whole. Express strips the mounted
   * prefix but keeps the query string, so `/samples?anything` arrived as
   * `'/?anything'`, failed the `!== '/'` test, and fell straight through to
   * whatever parser came next — express's own 100 KB default, answering the
   * bare unnamed 413 this whole ticket exists to remove. A guard that opens
   * on an unexpected shape of its own input is not a guard.
   */
  test('a query string does not open the ceiling — the same route, refused the same way', async () => {
    const app = buildApp();
    const oversized = Buffer.alloc(limits.maxBodyBytes + 1024, 0x61);
    const result = await withServer(app, (port) =>
      postWithLength(
        port,
        '/content-intelligence/voice/samples?retry=1',
        oversized,
        'application/json'
      )
    );
    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ code: 'VOICE_PAYLOAD_TOO_LARGE' });
  });

  test('a query string on the file route still does not narrow it', async () => {
    const app = buildApp();
    const large = Buffer.alloc(limits.maxBodyBytes + 1024 * 1024, 0x62);
    const result = await withServer(app, (port) =>
      postWithLength(
        port,
        '/content-intelligence/voice/samples/files?batch=2',
        large,
        'application/json'
      )
    );
    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      reached: true,
      url: '/content-intelligence/voice/samples/files?batch=2',
    });
  });

  test('/samples/files keeps its own, much larger ceiling — this limiter must not narrow it', async () => {
    const app = buildApp();
    // Over this route's 4 MB, comfortably under the file route's own 40 MB
    // batch ceiling. If the array-form `app.use` path match ever stopped
    // stripping the prefix the way `express-url-check` proved it does, this
    // is the request that would silently start failing.
    const large = Buffer.alloc(limits.maxBodyBytes + 1024 * 1024, 0x62);
    const result = await withServer(app, (port) =>
      postWithLength(
        port,
        '/content-intelligence/voice/samples/files',
        large,
        'application/json'
      )
    );
    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      reached: true,
      url: '/content-intelligence/voice/samples/files',
    });
  });
});

describe('main.ts mounts the real limiter rather than restating its numbers', () => {
  const mainSource = fs.readFileSync(path.join(repositoryRoot, mainPath), 'utf8');

  test('the samples route is wired to createVoicePasteBodyLimiter', () => {
    expect(mainSource).toMatch(
      /import \{ createVoicePasteBodyLimiter \} from/u
    );
    expect(mainSource).toMatch(/'\/content-intelligence\/voice\/samples'/u);
    expect(mainSource).toMatch(/createVoicePasteBodyLimiter\(\)/u);
    // No local restatement of the ceiling, doubled or otherwise.
    expect(mainSource).not.toMatch(/VOICE_SAMPLE_PASTE_LIMITS/u);
  });

  test('the existing 50 MB routes are untouched', () => {
    expect(mainSource).toMatch(/'\/copilot\/\{\*splat\}', '\/posts'/u);
    expect(mainSource).toMatch(/limit: '50mb'/u);
  });
});

describe('the paste card names its own ceiling, sourced from the contract', () => {
  test('the code reads the contract rather than restating the number', () => {
    const code = blanked(copyPath);
    expect(code).toMatch(
      /VOICE_SAMPLE_PASTE_LIMITS\.maxCharsPerSample/u
    );
    expect(code).not.toMatch(/200[_ ]?000/u);
  });

  test('both locales carry the current limit in the paste hint', () => {
    const limit = contract.VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerSample;
    const ruLabel = new Intl.NumberFormat('ru-RU').format(limit);
    const enLabel = new Intl.NumberFormat('en-US').format(limit);

    expect(copy.voiceCopy.ru.sourcePasteHint).toContain(ruLabel);
    expect(copy.voiceCopy.en.sourcePasteHint).toContain(enLabel);
  });
});
