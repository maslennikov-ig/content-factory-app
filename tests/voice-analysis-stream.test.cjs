'use strict';

require('reflect-metadata');

/**
 * Разбор голоса, отданный строками, и четыре вещи, которые это меняет.
 *
 * `content-factory-next-m2eg.15`. Разбор — до двадцати восьми вызовов модели
 * в одном запросе, и 07.09.2026 владелец получил на 88 образцах 504: ingress
 * рвёт соединение на шестидесятой секунде, и ответ, которого ещё нет, не
 * доезжает никогда. Ответ, который начинается сразу и идёт строками, в этот
 * предел не упирается — и заодно говорит, что происходит.
 *
 * Что здесь проверяется и почему именно это:
 *
 *  - события едут по одному на строку и в том порядке, в каком случились:
 *    полоса на экране считается из них, и переставленная строка — это полоса,
 *    которая едет назад;
 *  - числа названы до того, как спрошена модель. Отказ модели говорит «числа
 *    разбора сохранены», и если это сказано после — сказано над пустым местом;
 *  - отказ уже начавшегося стрима — последняя строка, а не код ответа: кода
 *    после первого байта больше нет;
 *  - отказ до первого байта — обычный HTTP, потому что там код ещё есть.
 *
 * И пятое, ради чего набор существует не меньше: старая дверь `POST
 * /analysis` отвечает ровно тем же, чем отвечала. Обе двери — один и тот же
 * ход, прочитанный до конца двумя способами, а не две копии разбора.
 *
 * Ни одного вызова модели: транспорт — записанные ответы.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const controllerPath = 'apps/backend/src/api/routes/brand-voice.controller.ts';

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
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${voiceBase}/voice-wiring.contract.ts`,
  './brand-voice.upload': 'apps/backend/src/api/routes/brand-voice.upload.ts',
  './brand-voice.paste': 'apps/backend/src/api/routes/brand-voice.paste.ts',
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
const assistModule = loadTypeScriptModule(
  `${voiceBase}/voice-assist.service.ts`,
  {
    // Единственное место, где мог бы собраться настоящий клиент. Он подменён,
    // поэтому вызов модели отсюда невозможен, а не просто не сделан.
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getOpenAiClient: () => {
        throw new Error('no model in tests');
      },
      getModelForRole: () => {
        throw new Error('no model in tests');
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class AiUsageService {},
    },
  },
  { sources }
);

const policyRecord = new Map();
const controllerModule = loadTypeScriptModule(
  controllerPath,
  {
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: (policies) => (target, property) => {
        policyRecord.set(property, policies);
      },
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: {
          Create: 'create',
          Read: 'read',
          Update: 'update',
          Delete: 'delete',
        },
        Sections: { ADMIN: 'admin', EDITOR: 'editor' },
      },
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/brand-voice.dto':
      {},
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service':
      { VoiceService },
  },
  { sources }
);
const { BrandVoiceController } = controllerModule;

const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

/* ---------------------------------------------------------------------- *
 * Фикстуры
 * ---------------------------------------------------------------------- */

const QUOTE = 'Поставщика поменяли — старый срывал сроки';
const PARAGRAPH =
  `${QUOTE}. Новый возит по графику, и это видно по журналу смены. ` +
  'На складе стало спокойнее: остатки сходятся, отгрузки не переносим. Разница в том, что теперь ' +
  'мы считаем не на глаз, а по накладным. Никто не обещал чуда, но за месяц накопилось меньше ' +
  'просрочек, чем за прошлый квартал. Что мы поменяли: сначала график, потом приёмку, потом отчёт. ';

const items = (count) =>
  Array.from({ length: count }, (unused, index) => ({
    title: `Текст ${index + 1}`,
    text: `Запись номер ${index + 1}. ${PARAGRAPH.repeat(4)}`,
  }));

const adminOrg = { id: 'org-a', users: [{ role: 'ADMIN' }] };
const memberOrg = { id: 'org-a', users: [{ role: 'USER' }] };
const adminUser = { id: 'user-admin' };
const admin = { organizationId: 'org-a', userId: 'user-admin', canManage: true };

/** Модель, которая цитирует дословно из того образца, который называет. */
const groundedTransport = (calls = []) => ({
  complete: async ({ stage }) => {
    calls.push(stage);
    if (stage === 'map') {
      return {
        sampleCode: 'smp-01',
        observations: [
          {
            field: 'WHO_SPEAKS',
            metric: 'firstPerson',
            quote: QUOTE,
            claim: 'Автор пишет от лица бригады и называет действие прямо.',
          },
        ],
      };
    }
    return {
      fields: [
        {
          field: 'WHO_SPEAKS',
          text: 'Бригадир участка, от первого лица множественного числа.',
          observationRefs: ['smp-01#1'],
        },
      ],
      pointOfView: 'first_person',
      formality: 'conversational',
      emojiPolicy: 'none',
      hashtagPolicy: 'none',
      neverSay: ['гарантированный результат'],
    };
  },
});

/** Модели просто нет. */
const brokenTransport = (calls = []) => ({
  complete: async ({ stage }) => {
    calls.push(stage);
    throw new Error('upstream refused');
  },
});

const assistOver = (transport) => ({
  propose: (input) => assistModule.runVoiceAssist(transport, input),
});

function harness(options = {}) {
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  const service = new VoiceService(
    samples,
    profiles,
    options.assist ?? null,
    {},
    () => new Date('2026-09-07T12:00:00.000Z')
  );
  return { service, prisma, controller: new BrandVoiceController(service) };
}

const fill = (service, count = 12) =>
  service.intake(admin, {
    origin: 'PASTE',
    usagePurpose: 'OWN_VOICE',
    language: 'ru',
    items: items(count),
  });

/**
 * Ответ express'а ровно в том объёме, в каком дверь его трогает.
 *
 * Строки копятся как есть, а не разобранными: половина смысла стрима в том,
 * что каждая строка — целая и отдельная, и склеенные события прошли бы
 * проверку, будучи ровно той поломкой, которую она ищет.
 */
const fakeResponse = () => {
  const chunks = [];
  return {
    headers: {},
    flushHeaders() {},
    once() {},
    off() {},
    ended: false,
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    end() {
      this.ended = true;
    },
    get raw() {
      return chunks.join('');
    },
    get lines() {
      return chunks.join('').split('\n').filter((line) => line !== '');
    },
    get events() {
      return this.lines.map((line) => JSON.parse(line));
    },
  };
};

const run = async (controller, body = { withAssist: true }) => {
  const response = fakeResponse();
  await controller.runAnalysisStream(adminOrg, adminUser, body, response);
  return response;
};

/* ---------------------------------------------------------------------- */

describe('дверь отдаёт разбор строками', () => {
  test('каждое событие — своя строка, и порядок тот, в каком они случились', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);

    const response = await run(controller);

    expect(response.headers['content-type']).toBe(
      'application/x-ndjson; charset=utf-8'
    );
    expect(response.ended).toBe(true);
    // Ни одной склеенной строки: каждая разбирается сама по себе.
    for (const line of response.lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const names = response.events.map((event) => event.name);
    expect(names[0]).toBe('started');
    expect(names.indexOf('measured')).toBeGreaterThan(0);
    expect(names).toContain('call');
    expect(names[names.length - 1]).toBe('done');
    // Числа названы раньше, чем сделан первый вызов модели.
    expect(names.indexOf('measured')).toBeLessThan(names.indexOf('call'));
  });

  test('started precedes even the first asynchronous corpus read', async () => {
    const { service } = harness({ assist: assistOver(groundedTransport()) });
    let read = false;
    service.corpusFor = async () => { read = true; throw new Error('delayed storage'); };
    const events = service.analysisStream(admin, { withAssist: true });
    expect((await events.next()).value.name).toBe('started');
    expect(read).toBe(false);
    await expect(events.next()).rejects.toThrow('delayed storage');
    expect(read).toBe(true);
  });

  test('первая строка подтверждает старт, затем приходит число образцов до вызовов', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service, 12);

    const [acknowledged, started] = (await run(controller)).events;
    expect(acknowledged).toEqual({ name: 'started', samples: 0, planned: 0 });

    expect(started).toMatchObject({ name: 'started' });
    expect(started.samples).toBeGreaterThan(0);
    // Полосе нужен знаменатель до первого вызова, а не после последнего.
    expect(started.planned).toBeGreaterThan(0);
    expect(started.planned).toBeLessThanOrEqual(started.samples);
  });

  test('вызов модели назван местом образца, а не номером попытки', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);

    const calls = (await run(controller)).events.filter(
      (event) => event.name === 'call'
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(['map', 'reduce']).toContain(call.stage);
      expect(call.index).toBeGreaterThanOrEqual(1);
      expect(call.index).toBeLessThanOrEqual(call.total);
      expect(typeof call.ok).toBe('boolean');
    }
    // Сборка предложения — последний вызов, и он один на весь корпус.
    const reduce = calls.filter((call) => call.stage === 'reduce');
    expect(reduce).toHaveLength(1);
    expect(reduce[0].total).toBe(1);
  });

  test('готовый разбор приезжает последней строкой целиком', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);

    const events = (await run(controller)).events;
    const done = events[events.length - 1];

    expect(done.name).toBe('done');
    expect(done.analysis.outcome).toBe('ready');
    expect(done.analysis.sampleCount).toBeGreaterThan(0);
    expect(done.analysis.charCount).toBeGreaterThan(0);
    expect(done.analysis.measurementId).toEqual(expect.any(String));
  });

  test('короткий корпус — это результат, а не отказ', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service, 2);

    const response = await run(controller);
    const events = response.events;

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ name: 'done' });
    expect(events[1].analysis.outcome).toBe('insufficient');
    expect(events[1].analysis.readiness.missingChars).toBeGreaterThan(0);
    void service;
  });
});

describe('отказ знает, по какую он сторону первого байта', () => {
  test('модель не ответила — последняя строка называет код, а числа уже сохранены', async () => {
    const { service, controller } = harness({
      assist: assistOver(brokenTransport()),
    });
    await fill(service);

    const response = await run(controller);
    const events = response.events;
    const last = events[events.length - 1];

    expect(last).toMatchObject({
      name: 'error',
      error: true,
      code: 'VOICE_ASSIST_UNAVAILABLE',
    });
    expect(typeof last.message).toBe('string');
    // Кода ответа после первого байта уже нет, и дверь его не трогает.
    expect(response.statusCode).toBe(200);
    expect(response.ended).toBe(true);

    // «Числа разбора сохранены» — сказано строкой раньше и правда по факту:
    // разбор читается обратно без второго платного прогона.
    expect(events.map((event) => event.name)).toContain('measured');
    const saved = await service.analysis(admin);
    expect(saved.outcome).toBe('ready');
    expect(saved.charCount).toBeGreaterThan(0);
  });

  test('участник без прав получает 403 и ни одной строки', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);

    const response = fakeResponse();
    await expect(
      controller.runAnalysisStream(
        memberOrg,
        { id: 'user-member' },
        { withAssist: true },
        response
      )
    ).rejects.toMatchObject({ status: 403 });

    // До первого байта код ответа ещё есть — значит отказ обязан быть им.
    expect(response.raw).toBe('');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.ended).toBe(false);
  });

  test('дверь стрима охраняется тем же правом, что и обычная', async () => {
    expect(policyRecord.get('runAnalysisStream')).toEqual(
      policyRecord.get('runAnalysis')
    );
  });
});

describe('старая дверь осталась старой дверью', () => {
  test('один ответ и последняя строка стрима говорят одно и то же', async () => {
    const single = harness({ assist: assistOver(groundedTransport()) });
    await fill(single.service);
    const answer = await single.service.runAnalysis(admin, {
      withAssist: true,
    });

    const streamed = harness({ assist: assistOver(groundedTransport()) });
    await fill(streamed.service);
    const events = (await run(streamed.controller)).events;
    const done = events[events.length - 1].analysis;

    // Идентификатор разбора у двух прогонов свой, всё остальное — общее: это
    // один и тот же ход, прочитанный двумя способами, а не две реализации.
    const shape = (analysis) => {
      const { measurementId, ...rest } = analysis;
      return rest;
    };
    expect(shape(done)).toEqual(shape(answer));
  });

  test('без модели старая дверь по-прежнему отдаёт одни числа', async () => {
    const { service } = harness({ assist: assistOver(groundedTransport()) });
    await fill(service);

    const answer = await service.runAnalysis(admin, {});

    expect(answer.outcome).toBe('ready');
    const proposal = await service.proposal(admin);
    expect(proposal.state).toBe('empty');
  });

  test('короткий корпус остаётся результатом и на старой двери', async () => {
    const { service } = harness();
    await fill(service, 2);

    const answer = await service.runAnalysis(admin, {});

    expect(answer.outcome).toBe('insufficient');
    expect(answer.readiness.missingChars).toBeGreaterThan(0);
  });
});

describe('ingress не рвёт длинный ход', () => {
  test('`/api/` ждёт пять минут, а не шестьдесят секунд', () => {
    // 07.09.2026 разбор 88 образцов вернулся владельцу как 504: у `location
    // /api/` не было ни одного таймаута, а значит действовали умолчания
    // nginx — шестьдесят секунд на чтение ответа. Стрим в этот предел не
    // упирается, потому что первая строка уходит сразу; таймаут поднят как
    // страховка для дверей, которые всё ещё отвечают одним ответом.
    const nginx = fs.readFileSync(
      path.join(repositoryRoot, 'var/docker/nginx.conf'),
      'utf8'
    );
    const location = nginx.match(/location \/api\/ \{([\s\S]*?)\n\s*\}/u);
    expect(location).not.toBeNull();
    expect(location[1]).toMatch(/proxy_read_timeout\s+300s;/u);
    expect(location[1]).toMatch(/proxy_send_timeout\s+300s;/u);
    // Диагностическая дверь браузера остаётся быстрой: её полсекунды — это
    // отдельное решение, и общий таймаут не должен их подменять.
    const relay = nginx.match(
      /location\s*=\s*\/api\/browser-errors\s*\{([\s\S]*?)\n\s*\}/u
    );
    expect(relay[1]).toMatch(/proxy_read_timeout\s+500ms;/u);
  });
});

describe('вернувшийся человек не платит за разбор второй раз (2q28.34)', () => {
  test('готовый разбор говорит, что предложение сохранено и тексты те же', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);
    await run(controller);

    const saved = await service.analysis(admin);
    expect(saved).toMatchObject({
      outcome: 'ready',
      hasProposal: true,
      corpusChanged: false,
    });
    expect(Number.isNaN(Date.parse(saved.measuredAt))).toBe(false);
  });

  test('добавленный текст делает разбор чужим для корпуса', async () => {
    const { service, controller } = harness({
      assist: assistOver(groundedTransport()),
    });
    await fill(service);
    await run(controller);
    await service.intake(admin, {
      origin: 'PASTE',
      usagePurpose: 'OWN_VOICE',
      language: 'ru',
      items: [{ title: 'Ещё один', text: `Новая запись. ${PARAGRAPH.repeat(3)}` }],
    });

    const saved = await service.analysis(admin);
    expect(saved.outcome).toBe('ready');
    expect(saved.corpusChanged).toBe(true);
  });

  test('модель не ответила — числа есть, предложения нет', async () => {
    const { service, controller } = harness({
      assist: assistOver(brokenTransport()),
    });
    await fill(service);
    await run(controller);

    const saved = await service.analysis(admin);
    expect(saved).toMatchObject({
      outcome: 'ready',
      hasProposal: false,
      corpusChanged: false,
    });
  });
});

/* ---------------------------------------------------------------------- *
 * kcxz.39 / kcxz.40 (review W3-18 F5, F9)
 * ---------------------------------------------------------------------- */

const lock = loadTypeScriptModule(`${voiceBase}/analysis-lock.ts`, {}, { sources });
const { resumeStepFor } = loadTypeScriptModule(
  `${voiceBase}/analysis-resume.ts`,
  {},
  { sources }
);

/** A model whose answer waits until the test lets it go. */
const heldTransport = (calls = []) => {
  let open;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const inner = groundedTransport(calls);
  return {
    open: () => open(),
    complete: async (request) => {
      await gate;
      return inner.complete(request);
    },
  };
};

const measurementCount = (prisma) => prisma.state.brandVoiceMeasurement.length;

/** `SET … EX … NX` and the two owner scripts, as Redis answers them. */
const fakeRedis = () => {
  const data = new Map();
  const commands = [];
  const live = (key) => {
    const entry = data.get(key);
    if (entry && entry.until <= Date.now()) data.delete(key);
    return data.get(key);
  };
  return {
    commands,
    has: (key) => !!live(key),
    client: {
      set: async (...args) => {
        commands.push(['set', ...args]);
        const [key, value, , ttl, nx] = args;
        if (nx === 'NX' && live(key)) return null;
        data.set(key, { value, until: Date.now() + ttl * 1000 });
        return 'OK';
      },
      eval: async (script, _keys, key, token, ttl) => {
        commands.push(['eval', script, key]);
        const entry = live(key);
        if (!entry || entry.value !== token) return 0;
        if (/'expire'/u.test(script)) {
          entry.until = Date.now() + Number(ttl) * 1000;
          return 1;
        }
        data.delete(key);
        return 1;
      },
    },
  };
};

describe('одна платная попытка на аватар за раз (kcxz.39)', () => {
  test('the claim: first start wins, a second is refused, release frees it, the key is per avatar', async () => {
    const store = lock.inProcessAnalysisLockStore();
    const release = await lock.claimVoiceAnalysis(store, 'org-a', 'av-1');
    expect(typeof release).toBe('function');
    expect(await lock.claimVoiceAnalysis(store, 'org-a', 'av-1')).toBeNull();
    // Another avatar and another space are not held by it.
    expect(await lock.claimVoiceAnalysis(store, 'org-a', 'av-2')).not.toBeNull();
    expect(await lock.claimVoiceAnalysis(store, 'org-b', 'av-1')).not.toBeNull();
    await release();
    await release();
    expect(await lock.claimVoiceAnalysis(store, 'org-a', 'av-1')).not.toBeNull();
    expect(lock.voiceAnalysisLockKey('org-a', null)).toBe('voice-analysis-running:org-a:space');
  });

  test('the claim is owned: a run that outlived its claim cannot free the next run\'s (review F3)', async () => {
    for (const store of [lock.inProcessAnalysisLockStore(), lock.redisAnalysisLockStore(fakeRedis().client)]) {
      const stale = await lock.claimVoiceAnalysis(store, 'org-a', 'av-1', { ttlSeconds: 0.05, renewMs: 60_000 });
      expect(stale).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const fresh = await lock.claimVoiceAnalysis(store, 'org-a', 'av-1');
      expect(fresh).not.toBeNull();
      await stale();
      // The newer claim still holds: a third start is refused.
      expect(await lock.claimVoiceAnalysis(store, 'org-a', 'av-1')).toBeNull();
      await fresh();
      const after = await lock.claimVoiceAnalysis(store, 'org-a', 'av-1');
      expect(after).not.toBeNull();
      await after();
    }
  });

  test('a refusal never touches the claim; the running one renews its short lifetime until released (review F4)', async () => {
    const redis = fakeRedis();
    const store = lock.redisAnalysisLockStore(redis.client);
    expect(lock.VOICE_ANALYSIS_LOCK_TTL_SECONDS).toBe(120);
    expect(lock.VOICE_ANALYSIS_LOCK_RENEW_MS * 3).toBeLessThanOrEqual(lock.VOICE_ANALYSIS_LOCK_TTL_SECONDS * 1000);
    const release = await lock.claimVoiceAnalysis(store, 'org-a', 'av-1', { renewMs: 10 });
    expect(redis.commands[0]).toEqual(['set', 'voice-analysis-running:org-a:av-1', expect.any(String), 'EX', 120, 'NX']);
    const before = redis.commands.length;
    expect(await lock.claimVoiceAnalysis(store, 'org-a', 'av-1')).toBeNull();
    // Only the failed SET NX: no EXPIRE, nothing that extends the live claim.
    expect(redis.commands.slice(before).map(([name]) => name)).toEqual(['set']);
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(redis.commands.filter(([name, script]) => name === 'eval' && /expire/u.test(script)).length).toBeGreaterThan(0);
    await release();
    const renewals = redis.commands.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(redis.commands.length).toBe(renewals);
    expect(redis.has('voice-analysis-running:org-a:av-1')).toBe(false);
  });

  test('a store that does not answer refuses the start clearly instead of hanging (review F5)', async () => {
    const hanging = { claim: () => new Promise(() => {}), renew: async () => true, release: async () => {} };
    await expect(lock.claimVoiceAnalysis(hanging, 'org-a', 'av-1', { waitMs: 20 })).rejects.toBeInstanceOf(
      lock.VoiceAnalysisLockUnavailable
    );
    expect(lock.VOICE_ANALYSIS_LOCK_WAIT_MS).toBe(5_000);

    // The service turns it into VOICE_ANALYSIS_FAILED before reading or paying.
    const calls = [];
    const prisma = new InMemoryVoicePrisma();
    const samples = new VoiceSampleRepository({ model: prisma.model }, prisma.transaction);
    const profiles = new VoiceProfileRepository(
      new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
      { model: prisma.model }
    );
    const broken = { claim: async () => { throw new Error('connection refused'); }, renew: async () => false, release: async () => {} };
    const service = new VoiceService(samples, profiles, assistOver(groundedTransport(calls)), {}, () => new Date('2026-09-07T12:00:00.000Z'), null, broken);
    await fill(service);
    await expect(service.runAnalysis(admin, { withAssist: true })).rejects.toMatchObject({
      code: 'VOICE_ANALYSIS_FAILED',
      message: expect.stringContaining('Ничего не потрачено'),
    });
    expect(calls).toEqual([]);
    expect(prisma.state.brandVoiceMeasurement).toHaveLength(0);
  });

  test('a second start before the first saved anything is refused, reads nothing and pays nothing', async () => {
    const calls = [];
    const transport = heldTransport(calls);
    const { service, prisma, controller } = harness({ assist: assistOver(transport) });
    await fill(service);

    // The first run is past its claim and has not saved its numbers yet —
    // the window in which the resume rule still reads `samples`.
    const first = service.analysisStream(admin, { withAssist: true });
    expect((await first.next()).value).toMatchObject({ name: 'started', samples: 0 });
    expect((await first.next()).value).toMatchObject({ name: 'started' });
    expect(measurementCount(prisma)).toBe(0);

    const second = await run(controller);
    const last = second.events[second.events.length - 1];
    expect(last).toMatchObject({ name: 'error', code: 'VOICE_ANALYSIS_RUNNING' });
    expect(second.events.map((event) => event.name)).toEqual(['started', 'error']);
    // `runAnalysis` (the one-answer door) is the same run and the same claim.
    await expect(service.runAnalysis(admin, { withAssist: true })).rejects.toMatchObject({
      code: 'VOICE_ANALYSIS_RUNNING',
      status: 409,
    });

    // The first run finishes and is the only one that asked the model.
    transport.open();
    const rest = [];
    for (let step = await first.next(); !step.done; step = await first.next()) rest.push(step.value);
    expect(rest[rest.length - 1]).toMatchObject({ name: 'done' });
    expect(measurementCount(prisma)).toBe(1);
    const asked = calls.length;
    expect(asked).toBeGreaterThan(0);

    // Released in `finally`: the next start runs.
    const third = await run(controller);
    expect(third.events[third.events.length - 1]).toMatchObject({ name: 'done' });
  });

  test('a failed run releases the claim too', async () => {
    const { service, controller } = harness({ assist: assistOver(brokenTransport()) });
    await fill(service);
    const failed = await run(controller);
    expect(failed.events[failed.events.length - 1]).toMatchObject({ code: 'VOICE_ASSIST_UNAVAILABLE' });
    const again = await run(controller);
    expect(again.events[again.events.length - 1]).toMatchObject({ code: 'VOICE_ASSIST_UNAVAILABLE' });
  });
});

describe('упавший разбор не читается как «ещё идёт» (kcxz.40)', () => {
  test('a run that saved numbers and then failed is marked, and the resume rule offers the rerun at once', async () => {
    let transport = brokenTransport();
    const { service, controller } = harness({
      assist: { propose: (input) => assistModule.runVoiceAssist(transport, input) },
    });
    await fill(service);
    await run(controller);

    const saved = await service.analysis(admin);
    expect(saved).toMatchObject({
      outcome: 'ready',
      hasProposal: false,
      corpusChanged: false,
      proposalFailed: true,
    });
    // A minute after the save — well inside the window — it is not «waiting».
    const minuteLater = Date.parse(saved.measuredAt) + 60_000;
    expect(resumeStepFor(saved, minuteLater)).toBe('analysis');

    // The rerun the person agreed to runs and stores a proposal; the new
    // row carries no failure mark.
    transport = groundedTransport();
    await run(controller);
    const after = await service.analysis(admin);
    expect(after).toMatchObject({ outcome: 'ready', hasProposal: true });
    expect(after.proposalFailed).toBeUndefined();
    expect(resumeStepFor(after, minuteLater)).toBe('proposal');
  });

  test('a finished run carries no mark, and an unmarked run without a proposal still waits inside the window', async () => {
    const { service, controller } = harness({ assist: assistOver(groundedTransport()) });
    await fill(service);
    await run(controller);
    const saved = await service.analysis(admin);
    expect(saved.proposalFailed).toBeUndefined();
    expect(
      resumeStepFor(
        { ...saved, hasProposal: false },
        Date.parse(saved.measuredAt) + 60_000
      )
    ).toBe('waiting');
  });

  test('a reader that stops after the numbers were saved marks the run as ended, and frees the claim', async () => {
    const { service, controller } = harness({ assist: assistOver(heldTransport()) });
    await fill(service);
    const stream = service.analysisStream(admin, { withAssist: true });
    for (let step = await stream.next(); !step.done; step = await stream.next()) {
      if (step.value.name === 'measured') break;
    }
    await stream.return(undefined);
    const saved = await service.analysis(admin);
    expect(saved.proposalFailed).toBe(true);
    const next = await run(controller, { withAssist: false });
    expect(next.events[next.events.length - 1]).toMatchObject({ name: 'done' });
  });

  test('a reader that stops at `done` keeps the proposal it paid for (review F2)', async () => {
    const { service } = harness({ assist: assistOver(groundedTransport()) });
    await fill(service);
    const stream = service.analysisStream(admin, { withAssist: true });
    for (let step = await stream.next(); !step.done; step = await stream.next()) {
      if (step.value.name === 'done') break;
    }
    await stream.return(undefined);
    const saved = await service.analysis(admin);
    expect(saved).toMatchObject({ outcome: 'ready', hasProposal: true });
    expect(saved.proposalFailed).toBeUndefined();
  });
});

describe('предложение не стирает положение относительно нормы (review F6)', () => {
  test('the row that stores the AI proposal keeps the deviations saved with the numbers', async () => {
    const plain = harness();
    await fill(plain.service);
    await run(plain.controller, { withAssist: false });
    const numbersOnly = plain.prisma.state.brandVoiceMeasurement[0].metrics.deviations;
    expect(numbersOnly).toBeDefined();

    const { service, prisma, controller } = harness({ assist: assistOver(groundedTransport()) });
    await fill(service);
    await run(controller);
    const [row] = prisma.state.brandVoiceMeasurement;
    expect(row.metrics.proposal).toBeDefined();
    expect(row.metrics.deviations).toEqual(numbersOnly);
  });
});
