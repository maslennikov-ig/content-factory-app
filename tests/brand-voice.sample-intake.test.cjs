'use strict';

/**
 * Getting someone's writing into the corpus.
 *
 * Five ways in, one shape out, and the interesting part is between. A secret
 * is removed before storage rather than before analysis, because a token that
 * reached the database has leaked whether or not anything reads it back. A
 * text is hashed after normalisation, because the same post arriving twice —
 * once from the workspace, once from a Telegram export — would not merely
 * inflate a total: it pulls every corridor towards whatever happened to arrive
 * twice.
 *
 * The parsers are written here rather than carried from the donor, whose right
 * to distribute is unestablished (`content-intelligence-donor-audit.md`), and
 * they are fed broken, enormous and hostile input on purpose.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const intake = loadTypeScriptModule(`${base}/sample-intake.ts`);
const telegram = loadTypeScriptModule(`${base}/telegram-export.ts`);
const files = loadTypeScriptModule(`${base}/text-file.ts`);

const longText = (seed) =>
  `Поставщика поменяли — старый срывал сроки. Новый везёт из Челябинска. ${seed} `.repeat(
    6
  );

const options = {
  usagePurpose: 'OWN_VOICE',
  rightsState: 'OWN_CONTENT',
};

describe('secrets never reach storage', () => {
  test.each([
    ['telegram bot token', '7712345678:AAF-abcdefghijklmnopqrstuvwxyz012345'],
    ['assignment', 'api_key = sk_live_abcdefghijklmnop'],
    ['github token', 'ghp_abcdefghijklmnopqrstuvwxyz0123'],
    ['slack token', 'xoxb-1234567890-abcdefghij'],
  ])('%s is removed before the text is hashed', (unused, secret) => {
    const { text, removed } = intake.scrubSecrets(
      `Вот ключ ${secret} не потеряй.`
    );

    expect(removed).toBeGreaterThan(0);
    expect(text).not.toContain(secret);
    expect(text).toContain(intake.SECRET_PLACEHOLDER);
  });

  test('a private key block goes in one piece', () => {
    const block = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF32r0v',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const { text } = intake.scrubSecrets(`Ключ ниже.\n${block}\nКонец.`);

    expect(text).not.toContain('MIIEowIBAAKCAQEA');
    expect(text).toContain('Конец.');
  });

  test('the stored sample carries the removal, not the value', () => {
    const { accepted } = intake.prepareSamples(
      [
        {
          origin: 'PASTE',
          title: 'Черновик',
          text: `${longText('раз')} Токен 7712345678:AAF-abcdefghijklmnopqrstuvwxyz012345 здесь.`,
        },
      ],
      options
    );

    expect(accepted).toHaveLength(1);
    expect(accepted[0].text).not.toMatch(/AAF-abcdefghij/);
    expect(accepted[0].redactions).toEqual([{ kind: 'SECRET', count: 1 }]);
  });
});

describe('the same text does not count twice', () => {
  test('two paths delivering one post produce one sample', () => {
    const text = longText('дубль');
    const { accepted, rejected } = intake.prepareSamples(
      [
        { origin: 'OWN_POST', title: 'Из постов', text },
        { origin: 'TELEGRAM_EXPORT', title: 'Из выгрузки', text },
      ],
      options
    );

    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([{ title: 'Из выгрузки', reason: 'DUPLICATE' }]);
  });

  test('whitespace and line endings do not make a new sample', () => {
    const text = longText('пробелы');
    expect(intake.hashText(text)).toBe(
      intake.hashText(text.replace(/ /g, '  ').replace(/\n/g, '\r\n'))
    );
  });

  test('quotation marks are left alone, because they are a habit', () => {
    // «» against "" is itself part of what the punctuation scale measures.
    // Normalising them would erase the thing being counted.
    expect(intake.normalizeText('Он сказал «да».')).toContain('«да»');
    expect(intake.hashText('Он сказал «да».')).not.toBe(
      intake.hashText('Он сказал "да".')
    );
  });

  test('a hash already in the corpus is refused', () => {
    const text = longText('известный');
    const { rejected } = intake.prepareSamples(
      [{ origin: 'PASTE', title: 'Повтор', text }],
      { ...options, knownHashes: [intake.hashText(text)] }
    );

    expect(rejected).toEqual([{ title: 'Повтор', reason: 'DUPLICATE' }]);
  });
});

describe('what does not become a sample', () => {
  test('too short is refused with the number, not a shrug', () => {
    const { rejected } = intake.prepareSamples(
      [{ origin: 'PASTE', title: 'Куцый', text: 'Две фразы. Всё.' }],
      options
    );

    expect(rejected[0].reason).toBe('TOO_SHORT');
    expect(rejected[0].detail).toMatch(/\/200$/);
  });

  test('a sample carrying model traces is refused', () => {
    const { rejected } = intake.prepareSamples(
      [
        {
          origin: 'PASTE',
          title: 'С хвостом',
          text: `${longText('хвост')} citeturn0search1`,
        },
      ],
      options
    );

    expect(rejected[0].reason).toBe('AI_ARTEFACT');
  });

  test('an empty paste is refused before anything else happens', () => {
    const { rejected } = intake.prepareSamples(
      [{ origin: 'PASTE', title: 'Пусто', text: '   \n  ' }],
      options
    );

    expect(rejected).toEqual([{ title: 'Пусто', reason: 'EMPTY' }]);
  });
});

describe('Telegram export', () => {
  const message = (id, text, extra = {}) => ({
    id,
    type: 'message',
    date: '2026-08-01T10:00:00',
    text,
    ...extra,
  });

  test('reads the entity form of text, not only the string form', () => {
    // Most real messages carry a link or a bold word, so `text` is an array. A
    // reader that expects a string drops nearly everything.
    const flat = telegram.flattenText([
      'Поставщика поменяли ',
      { type: 'bold', text: 'окончательно' },
      ', подробности ',
      { type: 'link', text: 'на сайте' },
      '.',
    ]);

    expect(flat).toBe(
      'Поставщика поменяли окончательно, подробности на сайте.'
    );
  });

  test('keeps authored messages and drops the rest', () => {
    const { candidates } = telegram.parseTelegramExport({
      name: 'Завод · новости',
      messages: [
        message(1, longText('первое')),
        message(2, longText('чужое'), { forwarded_from: 'Другой канал' }),
        { id: 3, type: 'service', action: 'pin_message' },
        message(4, 'Ок'),
        message(5, longText('второе')),
      ],
    });

    expect(candidates.map((one) => one.externalRef)).toEqual(['1', '5']);
    expect(candidates[0].origin).toBe('TELEGRAM_EXPORT');
  });

  test('a broken file is a result, not a crash', () => {
    expect(telegram.parseTelegramExport('{"messages": [')).toEqual({
      candidates: [],
      truncated: false,
      seen: 0,
    });
    expect(telegram.parseTelegramExport('не json вовсе').candidates).toEqual([]);
    expect(telegram.parseTelegramExport({}).candidates).toEqual([]);
  });

  test('a hostile shape does not throw', () => {
    const hostile = {
      messages: [
        null,
        'строка вместо объекта',
        { id: 1, text: { nested: 'объект вместо текста' } },
        { id: 2, text: [{ type: 'bold' }, 42, null] },
        message(3, longText('нормальное')),
      ],
    };

    expect(() => telegram.parseTelegramExport(hostile)).not.toThrow();
    expect(telegram.parseTelegramExport(hostile).candidates).toHaveLength(1);
  });

  test('an enormous export stops at the cap and says it stopped', () => {
    const huge = {
      messages: Array.from({ length: 60 }, (unused, index) =>
        message(index, longText(`сообщение ${index}`))
      ),
    };
    const result = telegram.parseTelegramExport(huge, { maxMessages: 20 });

    // A channel export runs to hundreds of megabytes. Reading all of it into
    // memory is how the import takes the server down.
    expect(result.truncated).toBe(true);
    expect(result.seen).toBe(20);
    expect(result.candidates.length).toBeLessThanOrEqual(20);
  });
});

describe('txt and md files', () => {
  test('accepts txt and md, refuses everything else with a reason', () => {
    const result = files.parseTextFiles([
      { name: 'itogi.txt', content: longText('текст') },
      { name: 'zametka.md', content: `# Заголовок\n\n${longText('разметка')}` },
      { name: 'otchet-2026.pages', content: longText('чужой формат') },
      { name: 'protokol.docx', content: longText('ворд') },
    ]);

    expect(result.candidates.map((one) => one.title)).toEqual([
      'itogi.txt',
      'zametka.md',
    ]);
    // docx and pdf are content-factory-next-uoy by owner decision, not an
    // oversight: a new binary parser needs its own licence and security review.
    expect(result.rejected).toEqual([
      { name: 'otchet-2026.pages', reason: 'EXTENSION' },
      { name: 'protokol.docx', reason: 'EXTENSION' },
    ]);
  });

  test('markdown keeps the bullets, because a bullet is a measured habit', () => {
    const text = files.markdownToText(
      '## Что берём\n\n- длину фраз\n- пунктуацию\n\n**Важно**: [ссылка](https://example.com) внутри.'
    );

    expect(text).toContain('- длину фраз');
    expect(text).toContain('Важно');
    expect(text).toContain('ссылка');
    expect(text).not.toContain('https://example.com');
    expect(text).not.toContain('##');
  });

  test('a code fence is not prose and does not join the sample', () => {
    const text = files.markdownToText(
      'До.\n\n```\nconst secret = 1;\n```\n\nПосле.'
    );

    expect(text).not.toContain('const secret');
    expect(text).toContain('До.');
    expect(text).toContain('После.');
  });

  test('a renamed binary is refused rather than measured as prose', () => {
    const result = files.parseTextFiles([
      { name: 'arhiv.txt', content: 'PK  binary' },
    ]);

    expect(result.rejected).toEqual([{ name: 'arhiv.txt', reason: 'BINARY' }]);
  });

  test('a file over the size cap is refused before it is read', () => {
    const result = files.parseTextFiles([
      { name: 'ogromniy.txt', content: 'x', bytes: 21 * 1024 * 1024 },
    ]);

    expect(result.rejected).toEqual([
      { name: 'ogromniy.txt', reason: 'TOO_LARGE' },
    ]);
  });
});

describe('no path reaches the network on its own', () => {
  test('intake and both parsers import nothing that can make a request', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    for (const file of ['sample-intake.ts', 'telegram-export.ts', 'text-file.ts']) {
      const source = fs.readFileSync(
        path.resolve(__dirname, '..', base, file),
        'utf8'
      );
      expect(source).not.toMatch(/fetch\(|axios|undici|got\(/);
      expect(source).not.toMatch(/from '(?:node:)?(?:http|https|net|dns)'/);
    }
  });
});
