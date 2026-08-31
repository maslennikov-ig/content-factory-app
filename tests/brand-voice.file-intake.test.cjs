'use strict';

/**
 * `file-intake.ts` is the one entry point origin `FILE` goes through
 * regardless of extension — this is where `content-factory-next-uoy`'s two
 * new parsers actually connect to the same path `text-file.ts` already
 * serves, without `sample-intake.ts` or `BrandVoiceSample` ever seeing which
 * of the three ran.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const fixtureDir = path.join(__dirname, 'fixtures', 'brand-voice-binary');
const fileIntake = loadTypeScriptModule(`${base}/file-intake.ts`);

const read = (name) => fs.readFileSync(path.join(fixtureDir, name));
const upload = (name, buffer) => ({ name, buffer });

describe('parseUploadedFiles: routing by extension', () => {
  test('.txt goes through the text path, .docx and .pdf through their own parsers, in the original order', async () => {
    const result = await fileIntake.parseUploadedFiles([
      upload(
        'заметка.txt',
        Buffer.from(
          'Поставщика поменяли — старый срывал сроки. Новый везёт из Челябинска, и это решение приняли на смене. Поставщика поменяли — старый срывал сроки. Новый везёт из Челябинска.',
          'utf8'
        )
      ),
      upload('отчёт.docx', read('valid-minimal.docx')),
      upload('скан.pdf', read('valid-minimal.pdf')),
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((c) => c.title)).toEqual([
      'заметка.txt',
      'отчёт.docx',
      'скан.pdf',
    ]);
    expect(result.candidates[0].text).toContain('Поставщика поменяли');
    expect(result.candidates[1].text).toContain('поставщика подшипников');
    expect(result.candidates[2].text).toContain('Zakaz izmenilsya');
  });

  test('an unrecognised extension is refused as EXTENSION without reaching any parser', async () => {
    const result = await fileIntake.parseUploadedFiles([
      upload('вирус.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toEqual([{ name: 'вирус.exe', reason: 'EXTENSION' }]);
  });
});

describe('parseUploadedFiles: a mixed batch with failures in more than one parser', () => {
  test('good and bad files across all three kinds stay in their original order and each keeps its own reason', async () => {
    const result = await fileIntake.parseUploadedFiles([
      upload('первый.docx', read('valid-minimal.docx')),
      upload('закрыт.pdf', read('password-protected.pdf')),
      // Short enough that `sample-intake.ts`'s MIN_SAMPLE_CHARS would refuse
      // it downstream — but that check is `prepareSamples`'s, not this
      // module's; `parseTextFiles` on its own only checks extension, size
      // and whether the bytes are binary, so this one is a candidate here.
      upload('второй.txt', Buffer.from('короткий текст', 'utf8')),
      upload('битый.docx', read('corrupted.docx')),
    ]);

    expect(result.candidates.map((c) => c.title)).toEqual([
      'первый.docx',
      'второй.txt',
    ]);
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'закрыт.pdf',
          reason: 'PASSWORD_PROTECTED',
        }),
        expect.objectContaining({ name: 'битый.docx', reason: 'CORRUPTED' }),
      ])
    );
  });
});

describe('parseUploadedFiles: two uploads sharing a literal filename', () => {
  test('each keeps its own outcome instead of one overwriting the other', async () => {
    const result = await fileIntake.parseUploadedFiles([
      upload('файл.pdf', read('valid-minimal.pdf')),
      upload('файл.pdf', read('corrupted.pdf')),
    ]);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('файл.pdf');
    expect(result.candidates[0].text).toContain('Zakaz izmenilsya');
    expect(result.rejected).toEqual([
      expect.objectContaining({ name: 'файл.pdf', reason: 'CORRUPTED' }),
    ]);
  });
});

describe('the Telegram export the card has always promised', () => {
  test('one result.json becomes many samples, each keeping its message id', async () => {
    // `telegram-export.ts` was written and called by nobody: the corpus card
    // said «файл result.json из „Экспорт истории“» over a picker that refused
    // anything but txt/md/docx/pdf (`content-factory-next-vme.21.13`).
    const long = (seed) =>
      `${seed} ` + 'Разбираю, что из этого выходит и почему именно так. '.repeat(4);
    const exported = JSON.stringify({
      name: 'Канал автора',
      type: 'public_channel',
      messages: [
        { id: 11, type: 'message', from: 'Автор', text: long('Первый пост.') },
        { id: 12, type: 'message', from: 'Автор', text: long('Второй пост.') },
        { id: 13, type: 'message', from: 'Автор', text: 'Слишком коротко.' },
        {
          id: 14,
          type: 'message',
          from: 'Автор',
          forwarded_from: 'Кто-то другой',
          text: long('Чужой пост.'),
        },
      ],
    });

    const result = await fileIntake.parseUploadedFiles([
      { name: 'result.json', buffer: Buffer.from(exported, 'utf8') },
    ]);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((one) => one.externalRef)).toEqual(['11', '12']);
    expect(result.candidates.every((one) => one.origin === 'TELEGRAM_EXPORT')).toBe(
      true
    );
    // Somebody else's writing and a one-liner are not this author's voice.
    expect(result.rejected).toEqual([]);
  });

  test('a title boundary inside an emoji does not produce half a character', async () => {
    // Postgres refuses a lone surrogate and Prisma answers «unexpected end of
    // hex escape», which took a whole 155-post channel down with one 500. The
    // 80-character title boundary fell inside «🧩» on the 141st post of a real
    // export (`content-factory-next-vme.21.14`).
    // Exactly 79 UTF-16 units, so the 80-character cut lands between the two
    // halves of the emoji that follows.
    const head = 'а'.repeat(79);
    const text = `${head}\u{1F9E9} и дальше по тексту.\n${'Разбираю подробно. '.repeat(12)}`;
    const exported = JSON.stringify({
      name: 'Канал',
      messages: [{ id: 141, type: 'message', from: 'Автор', text }],
    });

    const result = await fileIntake.parseUploadedFiles([
      { name: 'result.json', buffer: Buffer.from(exported, 'utf8') },
    ]);

    expect(result.candidates).toHaveLength(1);
    const title = result.candidates[0].title;
    // No lone surrogate anywhere in it.
    for (let i = 0; i < title.length; i += 1) {
      const code = title.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = title.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
        i += 1;
      } else {
        expect(code >= 0xdc00 && code <= 0xdfff).toBe(false);
      }
    }
    // And the whole thing survives the round trip Prisma puts it through.
    expect(() => JSON.parse(JSON.stringify({ title }))).not.toThrow();
    expect(Buffer.from(title, 'utf8').toString('utf8')).toBe(title);
  });

  test('an export with nothing of the author own is refused, not crashed', async () => {
    const exported = JSON.stringify({
      name: 'Канал',
      messages: [{ id: 1, type: 'service', text: 'создал канал' }],
    });

    const result = await fileIntake.parseUploadedFiles([
      { name: 'result.json', buffer: Buffer.from(exported, 'utf8') },
    ]);

    expect(result.candidates).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      name: 'result.json',
      reason: 'NO_TEXT_LAYER',
    });
  });
});
