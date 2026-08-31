#!/usr/bin/env node
/**
 * A live pass over the three doors `content-factory-next-vme.7`, `.8` and `.9`
 * opened, against a real backend and a real session.
 *
 * Each of the three was a promise the interface made that the product could
 * not keep, so what this records is the answer a person now gets where they
 * used to get a refusal: five writable lines instead of
 * `VOICE_PROFILE_NOT_FOUND`, a batch of files instead of a paste box, and a
 * brief that answers with the questions still missing.
 *
 * The refusals are walked too, and deliberately: a path that only works when
 * everything is right is a path nobody has tested. Three of five lines, a
 * batch over the count, a brief with nothing in it.
 *
 * Usage: node scripts/evidence/run-content-gaps-walkthrough.cjs <evidenceDir>
 * Reads the session token from CF_AUTH_TOKEN.
 */

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.CF_BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];
const REPO = path.resolve(__dirname, '../..');
const FIXTURES = path.join(REPO, 'tests/fixtures/brand-voice-binary');

if (!TOKEN || !OUT) {
  console.error('need CF_AUTH_TOKEN and an output directory');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });

const headers = (extra = {}) => ({
  Cookie: `auth=${TOKEN}`,
  Origin: 'http://localhost:4200',
  ...extra,
});

async function call(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: headers(body ? { 'Content-Type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return read(response);
}

async function upload(route, form) {
  const response = await fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: headers(),
    body: form,
  });
  return read(response);
}

async function read(response) {
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 2000) };
  }
  return { status: response.status, body: parsed };
}

const saved = [];
function save(name, payload) {
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    `${JSON.stringify(payload, null, 2)}\n`
  );
  saved.push(name);
  return payload;
}

/** A paragraph nobody has uploaded before, so a duplicate is a real finding. */
const prose = (seed) =>
  `${seed} Поставку разнесли на две партии, и это видно по журналу приёмки. ` +
  'На складе стало спокойнее: остатки сходятся, отгрузки не переносим. ' +
  'Разница в том, что теперь считаем не на глаз, а по накладным. ' +
  'Никто не обещал чуда, но за месяц просрочек накопилось меньше, чем за квартал. ';

const FIVE = {
  WHO_SPEAKS: 'Мастерская на Ленина, от лица бригады.',
  TONE: 'Спокойно и по делу, без обещаний.',
  AUDIENCE: 'Снабженцы небольших производств, читают на бегу.',
  SENTENCE_LENGTH: 'Короткие фразы, десять-двенадцать слов.',
  NEVER_SAY: 'гарантированный результат; лидер рынка',
};

async function manualPath() {
  save('01-manual-empty', await call('GET', '/content-intelligence/voice/proposal/manual'));

  // Three of five, then the refusal that names which two are missing.
  for (const key of ['WHO_SPEAKS', 'TONE', 'AUDIENCE']) {
    await call('POST', '/content-intelligence/voice/proposal/manual/field', {
      key,
      text: FIVE[key],
    });
  }
  save(
    '02-manual-three-of-five',
    await call('GET', '/content-intelligence/voice/proposal/manual')
  );
  save(
    '03-manual-incomplete-refusal',
    await call('POST', '/content-intelligence/voice/proposal/activate', {
      consentGiven: true,
      mode: 'manual',
    })
  );
  save(
    '04-manual-empty-line-refusal',
    await call('POST', '/content-intelligence/voice/proposal/manual/field', {
      key: 'NEVER_SAY',
      text: '   ',
    })
  );

  for (const key of ['SENTENCE_LENGTH', 'NEVER_SAY']) {
    await call('POST', '/content-intelligence/voice/proposal/manual/field', {
      key,
      text: FIVE[key],
    });
  }
  save(
    '05-manual-filled',
    await call('GET', '/content-intelligence/voice/proposal/manual')
  );
  save(
    '06-manual-consent-refusal',
    await call('POST', '/content-intelligence/voice/proposal/activate', {
      consentGiven: false,
      mode: 'manual',
    })
  );
  save(
    '07-manual-activated-passport',
    await call('POST', '/content-intelligence/voice/proposal/activate', {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    })
  );
  save(
    '08-manual-after-activation',
    await call('GET', '/content-intelligence/voice/proposal/manual')
  );
}

async function fileIntake() {
  const stamp = Date.now();
  const batch = new FormData();
  const add = (name, bytes, type = 'application/octet-stream') =>
    batch.append('files', new Blob([bytes], { type }), name);

  add('заметка.txt', Buffer.from(prose(`Смена ${stamp}.`), 'utf8'), 'text/plain');
  add('вирус.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
  add('обрывок.txt', Buffer.from('Слишком коротко.', 'utf8'), 'text/plain');
  add('отчёт.docx', fs.readFileSync(path.join(FIXTURES, 'valid-minimal.docx')));
  add('закрыт.pdf', fs.readFileSync(path.join(FIXTURES, 'password-protected.pdf')));
  batch.append('usagePurpose', 'OWN_VOICE');
  batch.append('language', 'ru');

  save(
    '09-files-mixed-batch',
    await upload('/content-intelligence/voice/samples/files', batch)
  );

  // Eleven files: the interceptor refuses the batch as a batch, before any of
  // it is read, and the refusal carries a code the screen can branch on.
  const overflow = new FormData();
  for (let index = 0; index < 11; index += 1) {
    overflow.append(
      'files',
      new Blob([Buffer.from(prose(`Файл ${index} ${stamp}.`), 'utf8')], {
        type: 'text/plain',
      }),
      `партия-${index}.txt`
    );
  }
  overflow.append('usagePurpose', 'OWN_VOICE');
  save(
    '10-files-over-the-count',
    await upload('/content-intelligence/voice/samples/files', overflow)
  );

  // Somebody else's writing costs the same two promises here as when pasted.
  const reference = new FormData();
  reference.append(
    'files',
    new Blob([Buffer.from(prose(`Чужой текст ${stamp}.`), 'utf8')], {
      type: 'text/plain',
    }),
    'чужой.txt'
  );
  reference.append('usagePurpose', 'STYLE_REFERENCE');
  save(
    '11-files-reference-without-rights',
    await upload('/content-intelligence/voice/samples/files', reference)
  );

  save('12-samples-after-upload', await call('GET', '/content-intelligence/voice/samples'));
}

async function briefGate() {
  save('13-brief-radar', await call('GET', '/content-intelligence/brief/radar'));
  save(
    '14-brief-incomplete',
    await call('POST', '/content-intelligence/brief/evaluate', {
      thesis: 'Поставщика надо было менять раньше.',
      language: 'ru',
    })
  );

  const full = {
    thesis: 'Поставщика надо было менять раньше.',
    position: 'Считаем, что тянули лишний квартал.',
    disagreement: 'Можно возразить, что цена у старого была ниже.',
    audience: 'Снабженцы небольших производств.',
    facts: [
      {
        statement: 'Просрочки упали на 40% за месяц.',
        sourceUrl: 'https://example.org/report',
      },
    ],
    language: 'ru',
  };
  save('15-brief-complete', await call('POST', '/content-intelligence/brief/evaluate', full));
  save(
    '16-brief-ungrounded-fact',
    await call('POST', '/content-intelligence/brief/evaluate', {
      ...full,
      facts: [{ statement: 'Все так делают.' }],
    })
  );
  save('17-brief-draft', await call('POST', '/content-intelligence/brief/draft', full));
}

(async () => {
  await manualPath();
  await fileIntake();
  await briefGate();

  fs.writeFileSync(
    path.join(OUT, 'index.json'),
    `${JSON.stringify(
      {
        base: BASE,
        recorded: saved,
        note:
          'Live pass over the three doors vme.7, vme.8 and vme.9 opened, ' +
          'refusals included. No model was called: the manual path never ' +
          'runs an analysis, and the brief gate is arithmetic.',
      },
      null,
      2
    )}\n`
  );
  console.log(`recorded ${saved.length} answers in ${OUT}`);
})();
