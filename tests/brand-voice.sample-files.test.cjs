'use strict';

require('reflect-metadata');

/**
 * The transport for origin `FILE`, and the four things it must not get wrong.
 *
 * `content-factory-next-36r.3` left the connection open and
 * `content-factory-next-uoy` wrote three parsers behind it, so until this
 * route existed the product had a card promising «Загрузить файлы» whose
 * button opened a paste box. What that gap left to decide was the transport
 * itself, and each of the four checks below is one of those decisions held in
 * place:
 *
 * the ceilings are one number stated in three files rather than three numbers;
 * the batch is refused as a batch, in the shape a screen can read, by a filter
 * that runs where the controller's own `try/catch` cannot reach; the bytes are
 * never stored anywhere — not in the media library, not in a served directory,
 * not even in the temp directory once the parse is over; and the order files
 * were picked in is the order their answers come back in, across both layers
 * that can refuse one.
 */

const fs = require('node:fs');

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const controllerPath = 'apps/backend/src/api/routes/brand-voice.controller.ts';
const uploadPath = 'apps/backend/src/api/routes/brand-voice.upload.ts';
const dtoPath =
  'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts';
const fixtureDir = path.join(__dirname, 'fixtures', 'brand-voice-binary');

const relativeSources = () => {
  const map = {};
  for (const file of fs.readdirSync(path.join(repositoryRoot, voiceBase))) {
    if (!file.endsWith('.ts')) continue;
    map[`./${file.replace(/\.ts$/u, '')}`] = `${voiceBase}/${file}`;
  }
  return map;
};

const sources = {
  ...relativeSources(),
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${profileBase}/brand-profile.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation': `${profileBase}/brand-profile.validation.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': `${profileBase}/brand-profile.repository.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${voiceBase}/voice-wiring.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract': `${voiceBase}/assist.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types': `${voiceBase}/brand-voice.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack': `${voiceBase}/locale-pack.ts`,
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

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
const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  { sources }
);
const textFile = loadTypeScriptModule(`${voiceBase}/text-file.ts`, {}, {
  sources,
});
const binaryFile = loadTypeScriptModule(`${voiceBase}/binary-file.ts`, {}, {
  sources,
});
const upload = loadTypeScriptModule(uploadPath, {}, { sources });

const read = (name) => fs.readFileSync(path.join(fixtureDir, name));
const file = (name, buffer) => ({ name, buffer });

const admin = { organizationId: 'org-a', userId: 'user-admin', canManage: true };
const member = {
  organizationId: 'org-a',
  userId: 'user-member',
  canManage: false,
};

function harness() {
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  return {
    prisma,
    service: new VoiceService(samples, profiles, null, {}, () =>
      new Date('2026-08-23T12:00:00.000Z')
    ),
  };
}

/** Long enough to clear `sample-intake.ts`'s floor for one sample. */
const PROSE = `${'Поставщика поменяли — старый срывал сроки. Новый возит по графику, и это видно по журналу смены. На складе стало спокойнее: остатки сходятся, отгрузки не переносим. '.repeat(
  3
)}`;

const blanked = (relativePath) =>
  fs
    .readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');

/* ---------------------------------------------------------------------- */

describe('one ceiling, stated in three files and checked against itself', () => {
  test('the contract, the text parser and the binary parsers agree on 20 MB', () => {
    expect(contract.VOICE_SAMPLE_FILE_LIMITS.maxFileBytes).toBe(
      textFile.MAX_FILE_BYTES
    );
    expect(contract.VOICE_SAMPLE_FILE_LIMITS.maxFileBytes).toBe(
      binaryFile.MAX_BINARY_FILE_BYTES
    );
  });

  test('the batch ceilings are a rule of their own, and bound a batch of ten', () => {
    const limits = contract.VOICE_SAMPLE_FILE_LIMITS;
    expect(limits.maxFilesPerBatch).toBe(10);
    // Ten files of the per-file ceiling would be two hundred megabytes; the
    // batch ceiling is what stops one request from being that.
    expect(limits.maxBatchBytes).toBeLessThan(
      limits.maxFileBytes * limits.maxFilesPerBatch
    );
  });

  test('the forked parses are capped, and the cap is stated where the other two are', () => {
    // Each fork is capped on its own; nothing capped their sum until a route
    // made ten at once reachable from the network.
    expect(binaryFile.MAX_PARALLEL_PARSES).toBe(4);
    expect(blanked(`${voiceBase}/parse-isolation.ts`)).toMatch(
      /MAX_PARALLEL_PARSES/u
    );
  });
});

describe('the route joins the surface that already exists', () => {
  test('it is a route of the samples surface, not a registry key of its own', () => {
    expect(Object.keys(contract.VOICE_SURFACES)).toEqual([
      'empty',
      'paths',
      'samples',
      'analysis',
      'proposal',
      'passport',
      'scales',
      'redactions',
      'versions',
      'ribbon',
      'materials',
      'avatars',
      'brief',
    ]);
    const paths = contract.VOICE_SURFACES.samples.routes.map(
      (route) => `${route.method} ${route.path}`
    );
    expect(paths).toContain('POST /content-intelligence/voice/samples/files');
  });

  test('the controller reads the field name and both limits off the contract', () => {
    const code = blanked(controllerPath);
    expect(code).toMatch(/FilesInterceptor\(\s*VOICE_SAMPLE_FILES_FIELD/u);
    expect(code).toMatch(/fileSize:\s*VOICE_SAMPLE_FILE_LIMITS\.maxFileBytes/u);
    expect(code).toMatch(/files:\s*VOICE_SAMPLE_FILE_LIMITS\.maxFilesPerBatch/u);
    // The guard runs before the interceptor buffers anything, and the filter
    // catches what the interceptor throws before the handler body exists.
    expect(code).toMatch(/UseGuards\(VoiceUploadBatchGuard\)/u);
    expect(code).toMatch(/UseFilters\(VoiceUploadExceptionFilter\)/u);
  });

  test('nothing here reaches the media library or a served directory', () => {
    // `/media/upload-server` was the other candidate: it writes the bytes into
    // a publicly served directory, files a row in the media library and never
    // deletes either — the opposite of what `retentionUntil` promises about
    // somebody else's writing.
    const code = blanked(controllerPath);
    expect(code).not.toMatch(/upload-server|MediaService|UploadFactory/u);
    expect(blanked(`${voiceBase}/voice.service.ts`)).not.toMatch(
      /MediaService|storage|uploadFile/u
    );
  });
});

describe('a batch refused as a batch still says so in words a screen can read', () => {
  test('the guard refuses a body over the batch ceiling before a byte is buffered', () => {
    const guard = new upload.VoiceUploadBatchGuard();
    const context = (length) => ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'content-length': String(length) } }),
      }),
    });

    expect(
      guard.canActivate(
        context(contract.VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes - 1)
      )
    ).toBe(true);

    let refusal;
    try {
      guard.canActivate(
        context(contract.VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes + 1)
      );
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeDefined();
    expect(refusal.getStatus()).toBe(413);
    expect(refusal.getResponse().code).toBe('VOICE_UPLOAD_REJECTED');
    expect(refusal.getResponse().message).toMatch(/40 МБ/u);
  });

  test('what multer refuses becomes the same body shape, not a bare 400', () => {
    // The live pass caught this: `FilesInterceptor` catches the `MulterError`
    // itself and `transformException` turns it into an ordinary
    // `BadRequestException` carrying the library's English sentence, so a
    // filter keyed on `MulterError` never fires and eleven files answered
    // `{"message":"Too many files","statusCode":400}`.
    const { BadRequestException, PayloadTooLargeException } = require('@nestjs/common');
    const filter = new upload.VoiceUploadExceptionFilter();
    const answers = [];
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: (code) => ({ json: (body) => answers.push({ code, body }) }),
        }),
      }),
    };

    filter.catch(new PayloadTooLargeException('File too large'), host);
    filter.catch(new BadRequestException('Too many files'), host);

    expect(answers).toHaveLength(2);
    for (const answer of answers) {
      expect(answer.code).toBe(413);
      expect(answer.body.code).toBe('VOICE_UPLOAD_REJECTED');
      expect(answer.body.message.length).toBeGreaterThan(20);
    }
    expect(answers[0].body.message).not.toBe(answers[1].body.message);
    // Every code the contract lists carries a status and a screen state, and
    // this one is no exception.
    expect(contract.VOICE_ERROR_CODES.VOICE_UPLOAD_REJECTED).toEqual({
      status: 413,
      screenState: 'error',
    });
  });

  test('somebody else refusal keeps its own status and body', () => {
    // The same route validates its text fields, and a failed validation is not
    // an upload refusal. Dressing it as one would claim the files were the
    // problem when the checkbox was.
    const { BadRequestException } = require('@nestjs/common');
    const filter = new upload.VoiceUploadExceptionFilter();
    const answers = [];
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: (code) => ({ json: (body) => answers.push({ code, body }) }),
        }),
      }),
    };

    filter.catch(
      new BadRequestException(['rightsConfirmed must be a boolean value']),
      host
    );

    expect(answers[0].code).toBe(400);
    expect(answers[0].body.code).toBeUndefined();
    expect(answers[0].body.message).toEqual([
      'rightsConfirmed must be a boolean value',
    ]);
  });

  test('a file keeps the name the person gave it', () => {
    // multipart hands a filename over in latin1, so «заметка.txt» arrives as
    // «Ð·Ð°Ð¼ÐµÑÐºÐ°.txt» — and that is what the corpus table printed beside
    // the sample on the live pass, permanently.
    // Built the way busboy builds it — reading UTF-8 bytes as latin1 — rather
    // than pasted: the mangled form contains control characters that do not
    // survive being copied out of a terminal.
    const asBusboyReadsIt = (name) =>
      Buffer.from(name, 'utf8').toString('latin1');
    expect(upload.originalFileName(asBusboyReadsIt('заметка.txt'))).toBe(
      'заметка.txt'
    );
    expect(upload.originalFileName('report.docx')).toBe('report.docx');
    // A name that really was latin1 keeps what it had: a mangled name is
    // better than a row of replacement characters.
    expect(upload.originalFileName('rapport-café.txt')).toBe(
      'rapport-café.txt'
    );
  });

  test('the multipart fields are converted before they are validated', async () => {
    // Everything in a multipart body arrives as a string. Without the
    // transform, `rightsConfirmed: 'true'` is refused as "not a boolean" —
    // a shapeless 400 the wizard can only show as «неизвестная ошибка».
    const { plainToInstance } = require('class-transformer');
    const { validate } = require('class-validator');
    const dto = loadTypeScriptModule(dtoPath, {}, { sources });

    const converted = plainToInstance(dto.VoiceSampleFileIntakeDto, {
      usagePurpose: 'STYLE_REFERENCE',
      rightsConfirmed: 'true',
      retentionUntil: '2027-01-01T00:00:00.000Z',
    });
    expect(converted.rightsConfirmed).toBe(true);
    expect(await validate(converted)).toEqual([]);

    const unchecked = plainToInstance(dto.VoiceSampleFileIntakeDto, {
      usagePurpose: 'OWN_VOICE',
      rightsConfirmed: 'false',
    });
    expect(unchecked.rightsConfirmed).toBe(false);
    expect(await validate(unchecked)).toEqual([]);

    // The origin is the server's to know: a body that could name it could file
    // a `.docx` under somebody's published posts.
    expect(Object.keys(converted)).not.toContain('origin');
  });
});

describe('files become samples, and nothing about them is kept', () => {
  /**
   * The directories this call creates, and only this call's.
   *
   * Reading the whole temp directory would also see the ones other Jest
   * workers are using at that moment — the parser suites run in parallel and
   * share `/tmp`. Recording what `mkdtempSync` handed back inside this
   * process is exact, and exactness is the whole point of the check.
   */
  const recordTempDirs = () => {
    const made = [];
    const original = fs.mkdtempSync;
    fs.mkdtempSync = (...args) => {
      const created = original.apply(fs, args);
      if (path.basename(created).startsWith('cf-brand-voice-')) {
        made.push(created);
      }
      return created;
    };
    return {
      made,
      restore: () => {
        fs.mkdtempSync = original;
      },
    };
  };

  test('a mixed batch keeps its order across both layers that can refuse a file', async () => {
    const { service } = harness();

    const answer = await service.intakeFiles(
      admin,
      [
        file('заметка.txt', Buffer.from(PROSE, 'utf8')),
        file('вирус.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
        file('обрывок.txt', Buffer.from('Слишком коротко.', 'utf8')),
        file('отчёт.docx', read('valid-minimal.docx')),
        file('закрыт.pdf', read('password-protected.pdf')),
      ],
      { usagePurpose: 'OWN_VOICE', language: 'ru' }
    );

    expect(answer.accepted.map((row) => row.title)).toEqual(['заметка.txt']);
    // One refused before it was opened, one refused after it was read, one
    // refused inside the parser — and the four lines come back in the order
    // the files were picked rather than the order the layers answered.
    expect(answer.rejected.map((one) => one.title)).toEqual([
      'вирус.exe',
      'обрывок.txt',
      'отчёт.docx',
      'закрыт.pdf',
    ]);
    expect(answer.rejected.map((one) => one.reason)).toEqual([
      'EXTENSION',
      'TOO_SHORT',
      'TOO_SHORT',
      'PASSWORD_PROTECTED',
    ]);
    expect(answer.readiness.sampleCount).toBe(1);
  });

  test('two files with the same name each keep their own answer', async () => {
    const { service } = harness();

    const answer = await service.intakeFiles(
      admin,
      [
        file('текст.txt', Buffer.from(PROSE, 'utf8')),
        file('текст.txt', Buffer.from('Слишком коротко.', 'utf8')),
      ],
      { usagePurpose: 'OWN_VOICE' }
    );

    expect(answer.accepted).toHaveLength(1);
    expect(answer.rejected).toEqual([
      expect.objectContaining({ title: 'текст.txt', reason: 'TOO_SHORT' }),
    ]);
  });

  test('the real parsers run, and the bytes leave nothing behind', async () => {
    const temp = recordTempDirs();
    const { service, prisma } = harness();

    let answer;
    try {
      answer = await service.intakeFiles(
        admin,
        [
          file('отчёт.docx', read('valid-minimal.docx')),
          file('скан.pdf', read('valid-minimal.pdf')),
        ],
        { usagePurpose: 'OWN_VOICE', language: 'ru' }
      );
    } finally {
      temp.restore();
    }

    // Both files reached a parser: each one wrote the bytes to a temp file for
    // its forked process, which is the step nothing else in this path takes.
    expect(temp.made).toHaveLength(2);
    expect([...answer.accepted, ...answer.rejected]).toHaveLength(2);

    // And each of those directories is gone again. The removal is best-effort
    // and asynchronous, so this waits for it rather than racing it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(temp.made.filter((dir) => fs.existsSync(dir))).toEqual([]);

    // Nothing was filed anywhere a file lives: the in-memory database this
    // service runs on has no media table, and the row it did write is a
    // sample, whose text is the only thing kept.
    for (const row of prisma.state.brandVoiceSample) {
      expect(row.text.length).toBeGreaterThan(0);
      expect(row).not.toHaveProperty('path');
    }
  });

  test('a reference upload owes the same two promises as a pasted one', async () => {
    const { service } = harness();
    const files = [file('чужой.txt', Buffer.from(PROSE, 'utf8'))];

    await expect(
      service.intakeFiles(admin, files, { usagePurpose: 'STYLE_REFERENCE' })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED', status: 409 });

    await expect(
      service.intakeFiles(admin, files, {
        usagePurpose: 'STYLE_REFERENCE',
        rightsConfirmed: true,
      })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED' });

    const answer = await service.intakeFiles(admin, files, {
      usagePurpose: 'STYLE_REFERENCE',
      rightsConfirmed: true,
      retentionUntil: '2027-01-01T00:00:00.000Z',
    });
    expect(answer.accepted).toHaveLength(1);
  });

  test('a member without rights cannot upload', async () => {
    const { service } = harness();

    await expect(
      service.intakeFiles(
        member,
        [file('заметка.txt', Buffer.from(PROSE, 'utf8'))],
        { usagePurpose: 'OWN_VOICE' }
      )
    ).rejects.toMatchObject({ code: 'VOICE_FORBIDDEN', status: 403 });
  });
});

describe('the number of parses running at once is bounded', () => {
  test('ten parses never hold more than four processes between them', async () => {
    let running = 0;
    let peak = 0;
    const children = [];

    const isolation = loadTypeScriptModule(
      `${voiceBase}/parse-isolation.ts`,
      {
        'node:child_process': {
          fork: () => {
            running += 1;
            peak = Math.max(peak, running);
            const listeners = new Map();
            const child = {
              exitCode: null,
              signalCode: null,
              once: (event, handler) => {
                listeners.set(event, handler);
                return child;
              },
              removeAllListeners: () => listeners.clear(),
              kill: () => undefined,
              finish: () => {
                running -= 1;
                child.exitCode = 0;
                listeners.get('message')?.({ ok: true, value: { text: 'x' } });
              },
            };
            children.push(child);
            return child;
          },
        },
        'node:fs': { existsSync: () => true },
      },
      { sources }
    );

    const parses = Array.from({ length: 10 }, () =>
      isolation.runWorkerScript('/dir', 'worker', [], {
        timeoutMs: 5_000,
        memoryLimitMb: 64,
      })
    );

    // Let each batch of forks settle in turn: the peak is what matters, and a
    // limiter that let all ten start would record ten here.
    for (let step = 0; step < 12; step += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      children.filter((child) => child.exitCode === null).slice(0, 4).forEach((child) => child.finish());
    }
    const outcomes = await Promise.all(parses);

    expect(outcomes).toHaveLength(10);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(binaryFile.MAX_PARALLEL_PARSES);
    // And the cap is a cap rather than a serialisation: four did run together.
    expect(peak).toBe(binaryFile.MAX_PARALLEL_PARSES);
  });
});
