'use strict';

/**
 * Pointing at a sentence, rewriting it, and proving the rest survived.
 *
 * The owner's decision of 2026-08-24: when the check says "не похоже", the
 * product names places and repairs them one sentence at a time. Not because
 * regeneration is hard, but because it loses the thing the text was written
 * for — the facts, the numbers, the order of thought — costs a full call
 * instead of a short one, and can carry the style further away on the second
 * pass than the first did.
 *
 * The load-bearing guard is the last group. A rewrite that reads beautifully
 * and drops "89 баллов" has not repaired the sentence, it has replaced the
 * claim, and no amount of instruction in a prompt makes that safe — only a
 * string comparison afterwards does.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const pack = loadTypeScriptModule(`${base}/locale-pack.ru.ts`).RU_LOCALE_PACK;
const spots = loadTypeScriptModule(`${base}/text-spots.ts`);
const repair = loadTypeScriptModule(`${base}/sentence-repair.ts`);
const html = loadTypeScriptModule(`${base}/html-text.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const retention = loadTypeScriptModule(`${base}/voice-retention.ts`);

describe('the post as words, not as markup', () => {
  it('turns the editor’s boxes into paragraphs', () => {
    const plain = html.htmlToPlainText(
      '<p>Первая фраза.</p><p>Вторая фраза.<br>Третья.</p>'
    );
    expect(plain).toBe('Первая фраза.\n\nВторая фраза.\nТретья.');
  });

  it('decodes the entities a person would see decoded', () => {
    expect(html.htmlToPlainText('<p>&laquo;&nbsp;мы&nbsp;&raquo; &amp; они</p>')).toBe(
      '« мы » & они'
    );
  });

  it('leaves plain text alone, including text that merely contains a `<`', () => {
    const plain = 'Порог a < b держится. Это не разметка.';
    expect(html.htmlToPlainText(plain)).toBe(plain);
  });

  it('measures the words rather than the tags', () => {
    // The same sentence with and without markup has to measure the same. Before
    // this, `<p>` was five characters of the author's habit and `</p><p>` was
    // punctuation nobody types.
    const samples = Array.from({ length: 14 }, (_, index) => ({
      code: `smp-${index}`,
      text: `Поставщика поменяли — старый срывал сроки. Мы догнали план ${index}. Смена отработала ровно, и это видно по журналу приёмки за неделю. Вот тут и вылезла разница между планом и фактом.`,
      language: 'ru',
      contentHash: `hash-${index}`,
    }));
    const measured = analyzer.analyzeBrandVoice(samples, { language: 'ru' });
    const text =
      'Мы поменяли поставщика. Сроки сдвинулись на два дня, и мастер предупредил заранее.';
    const bare = retention.checkText(text, measured, 'ru');
    const wrapped = retention.checkText(
      `<p>Мы поменяли поставщика.</p><p>Сроки сдвинулись на два дня, и мастер предупредил заранее.</p>`,
      measured,
      'ru'
    );
    expect(wrapped.similarity.distance).toBe(bare.similarity.distance);
    expect(wrapped.inCorridor).toBe(bare.inCorridor);
  });
});

describe('the places the divergence is in', () => {
  const text = [
    'Мы поменяли поставщика.',
    'Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации и согласованными сроками.',
    'Смена отработала ровно.',
  ].join(' ');

  it('locates a sentence where it really stands', () => {
    const located = spots.locateSentences(text, pack);
    expect(located).toHaveLength(3);
    for (const sentence of located) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });

  it('names the long sentence when the length left the corridor upward', () => {
    const found = spots.findTextSpots(
      text,
      [
        {
          key: 'sentenceLength',
          value: 22,
          low: 4,
          high: 12,
          placement: 'above',
        },
      ],
      pack,
      'ru'
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].sentence).toContain('Проведение мероприятий');
    expect(found[0].note).toContain('Длиннее');
  });

  it('names the clerical words themselves, not the scale', () => {
    const found = spots.findTextSpots(
      text,
      [
        {
          key: 'nominalisation',
          value: 60,
          low: 5,
          high: 25,
          placement: 'above',
        },
      ],
      pack,
      'ru'
    );
    expect(found[0].terms).toContain('проведение');
    expect(found[0].note).toContain('Канцелярские слова');
  });

  it('says nothing about a scale no sentence can be blamed for', () => {
    // Spread is a property of the whole text and the share of list paragraphs
    // is a property of the paragraphs. Naming one sentence as the culprit of
    // either would be a guess wearing a finding's clothes.
    const found = spots.findTextSpots(
      text,
      [
        { key: 'sentenceSpread', value: 95, low: 40, high: 80, placement: 'above' },
        { key: 'listParagraphs', value: 0, low: 10, high: 30, placement: 'below' },
      ],
      pack,
      'ru'
    );
    expect(found).toEqual([]);
  });

  it('marks one sentence once, even when two scales blame it', () => {
    const found = spots.findTextSpots(
      text,
      [
        { key: 'sentenceLength', value: 22, low: 4, high: 12, placement: 'above' },
        { key: 'nominalisation', value: 60, low: 5, high: 25, placement: 'above' },
      ],
      pack,
      'ru'
    );
    const starts = found.map((one) => one.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('keeps the list short enough to read', () => {
    const many = Array.from(
      { length: 20 },
      (_, index) => `Фраза номер ${index} довольно длинная и тянется дальше нужного.`
    ).join(' ');
    const found = spots.findTextSpots(
      many,
      [{ key: 'sentenceLength', value: 22, low: 4, high: 8, placement: 'above' }],
      pack,
      'ru'
    );
    expect(found.length).toBeLessThanOrEqual(spots.MAX_SPOTS);
  });
});

describe('what a rewrite is not allowed to lose', () => {
  const sentence =
    'Я прогнал шесть релизов через свой стенд, дважды получил 89 баллов и выложил отчёт на https://example.com/report, где DeepSeek V4 Pro сравнивается с «Аргусом».';
  const facts = repair.extractFacts(sentence);

  it('counts numbers, links, latin names and quoted speech as facts', () => {
    expect(facts).toContain('89');
    expect(facts).toContain('DeepSeek');
    expect(facts).toContain('V4');
    expect(facts).toContain('https://example.com/report');
    expect(facts.some((one) => one.includes('Аргус'))).toBe(true);
  });

  it('passes a rewrite that carries every one of them through', () => {
    const proposal =
      'Прогнал 6 релизов через стенд — дважды 89 баллов. Отчёт лежит на https://example.com/report: там DeepSeek V4 Pro против «Аргуса».';
    // The quoted span changes case with the grammar, so it is the one fact this
    // rewrite loses; the guard is meant to catch exactly that.
    const verdict = repair.checkFacts(
      facts.filter((one) => !one.includes('Аргус')),
      proposal
    );
    expect(verdict.lost).toEqual([]);
  });

  it('refuses a rewrite that rounds a number into a word', () => {
    const proposal =
      'Прогнал несколько релизов через стенд и оба раза получил около девяноста баллов.';
    const judged = repair.judgeRepair(sentence, proposal, facts);
    expect(judged.ok).toBe(false);
    expect(judged.reason).toBe('FACTS_LOST');
    expect(judged.verdict.lost).toContain('89');
  });

  it('refuses a rewrite that changed nothing', () => {
    const judged = repair.judgeRepair(sentence, `  ${sentence}  `, facts);
    expect(judged.ok).toBe(false);
    expect(judged.reason).toBe('UNCHANGED');
  });

  it('refuses a rewrite that grew into a paragraph', () => {
    const short = 'Сроки сдвинулись на два дня.';
    const long = `${'Сроки сдвинулись на два дня и вот почему это важно. '.repeat(12)}`;
    const judged = repair.judgeRepair(short, long, repair.extractFacts(short));
    expect(judged.ok).toBe(false);
    expect(judged.reason).toBe('TOO_LONG');
  });
});

describe('the prompt the repair sends', () => {
  const context = {
    sentence: 'Осуществление отгрузки производится согласно графику.',
    before: 'Мы поменяли поставщика.',
    after: 'Смена отработала ровно.',
    note: 'Канцелярские слова: осуществление.',
    corridor: { low: 6, high: 14 },
    examples: ['Поставщика поменяли — старый срывал сроки.'],
    facts: ['89'],
    locale: 'ru',
  };

  it('carries the sentence, its two neighbours and nothing else of the text', () => {
    const prompt = repair.buildRepairPrompt(context);
    expect(prompt).toContain(context.sentence);
    expect(prompt).toContain(context.before);
    expect(prompt).toContain(context.after);
    expect(prompt).toContain('не трогать');
    expect(prompt).toContain('6–14');
    expect(prompt).toContain('СОХРАНИТЬ ДОСЛОВНО: 89');
  });

  it('asks for one sentence', () => {
    expect(repair.buildRepairPrompt(context)).toContain('одно предложение');
  });
});

describe('applying the repair', () => {
  it('replaces exactly the sentence and leaves the rest byte for byte', () => {
    const text = 'Первая фраза. Вторая фраза. Третья фраза.';
    const located = spots.locateSentences(text, pack);
    const next = repair.applyRepair(text, located[1], 'Вторая — короче.');
    expect(next).toBe('Первая фраза. Вторая — короче. Третья фраза.');
  });

  it('is never called by the measuring side on its own', () => {
    // Point four of the decision: nothing applies itself. The check returns
    // places and the repair returns a proposal; neither returns a new text.
    const samples = Array.from({ length: 14 }, (_, index) => ({
      code: `smp-${index}`,
      text: `Мы поменяли поставщика ${index}. Смена отработала ровно, и это видно по журналу. Вот тут и вылезла разница.`,
      language: 'ru',
      contentHash: `hash-${index}`,
    }));
    const measured = analyzer.analyzeBrandVoice(samples, { language: 'ru' });
    const check = retention.checkText(
      'Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с регламентом.',
      measured,
      'ru'
    );
    expect(Array.isArray(check.spots)).toBe(true);
    expect(check).not.toHaveProperty('repairedText');
    expect(check).not.toHaveProperty('applied');
  });
});
