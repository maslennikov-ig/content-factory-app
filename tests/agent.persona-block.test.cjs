'use strict';

/**
 * The voice block as a person rather than as a rulebook.
 *
 * Measured on the owner's corpus on 2026-08-25: the product described his
 * manner in eight scales, the model obeyed — 90% of the scales landed inside
 * their corridors, up from 77% with no voice at all — and the generated text
 * was no closer to him than text written with no voice whatsoever (0.644
 * against 0.637). Obedience is not resemblance. The block had become a list of
 * prohibitions, and a list of prohibitions produces a compliant author with no
 * face.
 *
 * ## What changed on 2026-08-26
 *
 * The first answer to that was a hybrid: the portrait opened the block and the
 * adjectives followed it, restated as observations about a human and outranked
 * by him. `pl1.20` then priced every device separately over three paid runs —
 * 96 generations, 192 calls — and the adjectives earned zero on all four
 * rulers while holding the record for scales inside their corridors. Removing
 * them entirely cost nothing measurable: pooled over sixteen pairs the block
 * without them sits level on the ruler the product decides by (49.0% against
 * 46.6%) and ahead on LUAR (64.5% against 54.1%, the only interval there that
 * misses zero), and writes 1197 characters against 1308 with the author at 823.
 *
 * The owner took the swap on 2026-08-26. So there are two blocks now, and this
 * file holds both:
 *
 *   * **the avatar**, for a voice with a portrait — who the person is, what
 *     they actually wrote, and the guardrails. Not one sentence about manner,
 *     and not one number: the length lives in the trim after the draft;
 *   * **the descriptive block**, for a voice somebody typed in by hand, which
 *     has no portrait because no corpus was ever measured for it. Taking its
 *     adjectives away would leave it with nothing at all.
 *
 * The portrait is what decides, and that is not a proxy: the analyser writes
 * one from the author's own corpus, so it is present exactly where a voice was
 * measured from somebody's writing.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { voiceInstructionLines, statesLength } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);

const PORTRAIT =
  'Он ведёт участок и пишет о том, что сам чинил на этой неделе. ' +
  'Считает очевидным, что цифру без прогона показывать нельзя, и не объясняет ' +
  'этого. Раздражается на слова «оптимизация» и «синергия» и говорит вместо ' +
  'них, что именно сломалось. С читателем разговаривает как с коллегой, ' +
  'которому неудобно объяснять дважды.';

const FULL = {
  persona: { kind: 'PERSON', portrait: PORTRAIT },
  pointOfView: 'first_person',
  formality: 'conversational',
  traits: [{ name: 'манера', guidance: 'обрывает фразу, когда мысль кончилась' }],
  sentenceStyle: 'короткие фразы, редкие длинные',
  emojiPolicy: 'none',
  lexicon: { avoid: [{ term: 'синергия' }] },
  directions: [{ text: 'Пишет короче обычного поста', detail: 'сильно' }],
  examples: [{ kind: 'on_brand', text: 'Сел считать руками, глазами такое не ловится.' }],
  guardrails: { prohibitedTopics: ['прогнозы курса'] },
  postLength: { median: 823, low: 500, high: 1200 },
};

/** Тот же голос, набранный руками: корпуса не было, портрета нет. */
const { persona, ...HAND_WRITTEN } = FULL;

const indexOfLine = (lines, fragment) =>
  lines.findIndex((one) => one.includes(fragment));

describe('портрет открывает блок', () => {
  it('человек стоит первым, и до него ничего нет', () => {
    const lines = voiceInstructionLines(FULL);

    expect(lines[0]).toContain(PORTRAIT);
    expect(lines[0]).toContain('not as an assistant');
  });

  it('бренд и человек представляются по-разному', () => {
    const brand = voiceInstructionLines({
      ...FULL,
      persona: { kind: 'BRAND', portrait: PORTRAIT },
    });

    expect(brand[0]).toContain('as this brand speaks');
    expect(brand[0]).not.toContain('as this person');
  });

  it('пустой портрет — это отсутствие портрета, а не пустая строка', () => {
    const lines = voiceInstructionLines({
      ...FULL,
      persona: { kind: 'PERSON', portrait: '   ' },
    });

    expect(lines.some((one) => one.includes('not as an assistant'))).toBe(false);
    // И тогда собирается второй блок, а не пустота.
    expect(lines[0]).toContain('They write as "I"');
  });
});

/**
 * Ни одного правила о манере — это и есть решение владельца, поэтому проверка
 * идёт по всем устройствам разом. Любое из них, вернувшееся поодиночке, вернёт
 * блок к форме, которая по замеру стоила ноль.
 */
describe('аватар не говорит модели ни одного правила о манере', () => {
  const lines = voiceInstructionLines(FULL);

  it('ни точки зрения, ни регистра, ни привычек, ни ритма, ни лексикона', () => {
    for (const described of [
      'They write as "I"',
      'They write the way they talk.',
      'Their манера',
      'The rhythm they write in',
      'Words they do not use',
      'They never use emoji.',
      FULL.directions[0].text,
    ]) {
      expect(lines.some((one) => one.includes(described))).toBe(false);
    }
  });

  it('и ни одного числа о длине', () => {
    expect(lines.some((one) => one.includes('823'))).toBe(false);
    expect(lines.some((one) => one.includes('Match that length'))).toBe(false);
  });

  /**
   * Блок отвечает за себя сам: длина известна, подрезка после черновика ею
   * по-прежнему пользуется, а промпт о ней молчит. Спрашивать вместо блока поле
   * `postLength` — значит объявить в промпте диапазон, которого в нём нет.
   */
  it('и сам говорит, что о длине не сказал', () => {
    expect(statesLength(FULL)).toBe(false);
    expect(statesLength(HAND_WRITTEN)).toBe(true);
  });

  it('в блоке остаются ровно человек, его тексты и ограничения', () => {
    // Человек, его пост, заголовок ограничений и само ограничение.
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain(PORTRAIT);
    expect(lines[1]).toContain('This is them writing');
    expect(lines[2]).toContain('outrank everything above');
    expect(lines[3]).toContain('Never write about');
  });
});

describe('голос, набранный руками, остаётся на прежнем блоке', () => {
  const lines = voiceInstructionLines(HAND_WRITTEN);

  it('никем не представляется и ничего не выдумывает', () => {
    expect(lines.some((one) => one.includes('not as an assistant'))).toBe(false);
    expect(lines.some((one) => one.includes('not a rulebook'))).toBe(false);
    expect(lines[0]).toContain('They write as "I"');
  });

  it('манера, ритм и лексикон говорят «они», а не «этот автор»', () => {
    expect(lines).toContain('Their манера: обрывает фразу, когда мысль кончилась');
    expect(lines).toContain('The rhythm they write in: короткие фразы, редкие длинные');
    expect(lines).toContain('Words they do not use: "синергия"');
    expect(lines.some((one) => one.includes("This author's"))).toBe(false);
  });

  it('ни одна описательная строка не начинается с повелительного «Write»/«Keep»/«Use»', () => {
    const descriptive = lines.filter(
      (one) => !one.startsWith('These last rules') && !one.startsWith('Never')
    );
    const orders = descriptive.filter((one) =>
      /^(Write|Keep|Use|Do not|Always) /u.test(one)
    );

    expect(orders).toEqual([]);
  });

  it('длина остаётся направлением с обеими половинами', () => {
    const length = lines.find((one) => one.includes('823'));

    expect(length).toContain('Match that length');
    expect(length).toContain('Do not pad');
  });

  it('пример автора стоит после всех прилагательных', () => {
    const rhythm = indexOfLine(lines, 'The rhythm they write in');
    const example = indexOfLine(lines, 'This is them writing');

    expect(example).toBeGreaterThan(rhythm);
  });
});

describe('ограничения — единственное, что осталось приказом', () => {
  it('стоят последними, после примеров автора, в обоих блоках', () => {
    for (const voice of [FULL, HAND_WRITTEN]) {
      const lines = voiceInstructionLines(voice);
      const example = indexOfLine(lines, 'This is them writing');
      const rules = indexOfLine(lines, 'These last rules outrank');

      expect(example).toBeGreaterThan(-1);
      expect(rules).toBeGreaterThan(example);
      expect(lines[lines.length - 1]).toContain('Never write about');
    }
  });

  it('сказано вслух, что они выше человека', () => {
    const lines = voiceInstructionLines(FULL);

    expect(lines.some((one) => one.includes('outrank everything above'))).toBe(
      true
    );
  });

  it('без ограничений заголовка нет', () => {
    const { guardrails, ...withoutRules } = FULL;
    const lines = voiceInstructionLines(withoutRules);

    expect(lines.some((one) => one.includes('outrank'))).toBe(false);
  });
});
