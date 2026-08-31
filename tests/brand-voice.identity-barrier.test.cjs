'use strict';

/**
 * Manner without the person.
 *
 * ADR-0011 draws the boundary; this holds the code to it. Two of these are the
 * epic's mandatory red tests: an n-gram from the reference reaching a stored
 * profile fails the build, and material marked `STYLE_REFERENCE` never becomes
 * evidence, never enters a fact, is never quoted and is never selected into a
 * generation context.
 *
 * What is deliberately *not* asserted anywhere is absence of leakage. Style and
 * content cannot be provably separated — the research is explicit — so these
 * measure leakage on four axes and report what they measured. A test claiming
 * more than that would be the product claiming more than it can.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const barrier = loadTypeScriptModule(`${base}/identity-barrier.ts`);

const REFERENCE = [
  'Иван Петров работает на заводе с 2014 года.',
  'Выручка выросла до 4,2 млрд рублей — впервые за три года.',
  'Пишите на t.me/author или на zavod-tver.example.',
  'Министерство и @mashprom подтвердили планы.',
  'Как говорится, семь раз отмерь — один раз отрежь.',
].join('\n');

const ENTITIES = {
  people: ['Иван Петров'],
  organisations: ['Министерство', '@mashprom'],
};

const VERBATIM = ['семь раз отмерь — один раз отрежь'];

describe('what is taken out of a reference', () => {
  const { redacted, redactions } = barrier.redactReference(
    REFERENCE,
    ENTITIES,
    VERBATIM
  );

  test('all five categories the design names are reported', () => {
    expect(redactions.map((one) => one.category)).toEqual([
      'PERSON',
      'FACT_NUMBER',
      'LINK',
      'MENTION',
      'VERBATIM',
    ]);
  });

  test('every category carries a count and short examples for the screen', () => {
    for (const redaction of redactions) {
      expect(redaction.occurrences).toBeGreaterThan(0);
      expect(redaction.examples.length).toBeGreaterThan(0);
      expect(redaction.examples.length).toBeLessThanOrEqual(3);
      for (const example of redaction.examples) {
        expect(example.length).toBeLessThanOrEqual(60);
      }
    }
  });

  test('the person, the figures, the links and the mentions are gone', () => {
    expect(redacted).not.toContain('Иван Петров');
    expect(redacted).not.toContain('4,2');
    expect(redacted).not.toContain('2014');
    expect(redacted).not.toContain('t.me/author');
    expect(redacted).not.toContain('zavod-tver.example');
    expect(redacted).not.toContain('@mashprom');
  });

  test('a recognisable phrase of the author goes whole', () => {
    // Three turns of phrase read as the author's signature and would be
    // recognised word for word. They leave the profile entirely.
    expect(redacted).not.toContain('семь раз отмерь');
  });

  test('a number leaves its slot behind, because the length is all we keep', () => {
    // "Числа влияют только на длину фразы, в которой стояли. Сами значения не
    // сохраняются." — the design, and this is what implements it.
    expect(redacted).toContain('·');
    expect(redacted.split('\n')).toHaveLength(REFERENCE.split('\n').length);
  });
});

describe('the four gates run on a conjunction', () => {
  const clean = {
    output: 'Сроки сдвинулись на два дня. Причина в поставке.',
    sourceText: REFERENCE,
    sourceEntities: ['Иван Петров', 'Министерство'],
    rareWords: ['машпром'],
    contentSimilarity: 0.12,
    randomBaseline: 0.18,
  };

  test('a clean output passes all four', () => {
    expect(barrier.evaluateLeakage(clean).passed).toBe(true);
  });

  test.each([
    [
      'an entity of the author appears',
      { output: 'Иван Петров подтвердил сроки.' },
    ],
    [
      'four words in a row match the source',
      { output: 'Выручка выросла до 4,2 млрд рублей и это рекорд.' },
    ],
    [
      'the content sits closer to the author than chance',
      { contentSimilarity: 0.4 },
    ],
    ['a rare word of the author is reused', { output: 'Машпром снова здесь.' }],
  ])('%s fails the conjunction on its own', (unused, override) => {
    // Not a majority and not a score. Russian entity recognition runs around
    // 0.91, so roughly nine entities in a hundred walk past the first gate —
    // which is why there are four and why passing three is not passing.
    expect(barrier.evaluateLeakage({ ...clean, ...override }).passed).toBe(
      false
    );
  });

  test('the threshold is four tokens, not "about four"', () => {
    const source = 'старый поставщик срывал сроки третий месяц подряд';

    expect(
      barrier.longestSharedRun('старый поставщик срывал сроки', source)
    ).toBe(4);
    expect(
      barrier.evaluateLeakage({
        ...clean,
        output: 'старый поставщик срывал сроки',
        sourceText: source,
      }).passed
    ).toBe(false);
    // Three in a row is a service phrase everyone uses. The design says as
    // much on the screen beside the number.
    expect(
      barrier.evaluateLeakage({
        ...clean,
        output: 'старый поставщик срывал',
        sourceText: source,
      }).passed
    ).toBe(true);
  });

  test('the report says what it measured, never that nothing leaked', () => {
    const report = barrier.evaluateLeakage(clean);

    expect(report).toHaveProperty('longestSharedNgram');
    expect(report).toHaveProperty('contentSimilarity');
    expect(report).toHaveProperty('randomBaseline');
    // Style and content cannot be provably separated. What can be reported is
    // a measurement, and the field names say only that.
    expect(Object.keys(report)).not.toContain('identityFree');
    expect(Object.keys(report)).not.toContain('guaranteed');
  });
});

describe('two renderers, not one renderer with a flag', () => {
  const observations = [
    {
      field: 'WHO_SPEAKS',
      metric: 'firstPerson',
      quote: 'Мы вчера догнали план.',
      claim: 'Пишет от лица тех, кто внутри.',
      sampleCode: 'smp-02',
    },
  ];

  test('the reference profile has no field a quote could occupy', () => {
    const profile = barrier.renderReferenceProfile({
      metrics: { sentenceLength: 9.6, shortSentences: 61 },
      categories: { pointOfView: 'third_person' },
      privateAuthorLabel: 'Любимый автор',
    });

    // A filter can be bypassed by a new branch of code. A shape with nowhere
    // to put verbatim text cannot be bypassed without noticing.
    expect(Object.keys(profile).sort()).toEqual([
      'categories',
      'metrics',
      'mode',
      'privateAuthorLabel',
    ]);
    expect(JSON.stringify(profile)).not.toContain('Мы вчера догнали план');
  });

  test('the reference profile keeps only numbers and categories', () => {
    const profile = barrier.renderReferenceProfile({
      metrics: { sentenceLength: 9.6 },
      categories: { pointOfView: 'third_person' },
    });

    for (const value of Object.values(profile.metrics)) {
      expect(typeof value).toBe('number');
    }
    // "ЧТО ОСТАЛОСЬ В ПРОФИЛЕ — длина фразы 9,6 слова" — the design shows
    // exactly this and nothing else.
    expect(profile.metrics.sentenceLength).toBe(9.6);
  });

  test('the author name is held for the interface and nothing else', () => {
    const profile = barrier.renderReferenceProfile({
      metrics: {},
      categories: {},
      privateAuthorLabel: 'Любимый автор',
    });

    // The owner's decision of 2026-08-22: a private label. It never reaches a
    // generation prompt, an output or any marketing.
    expect(profile.privateAuthorLabel).toBe('Любимый автор');
    expect(Object.keys(profile)).not.toContain('promptName');
  });

  test('own-voice mode requires the quote reference mode forbids', () => {
    const own = barrier.renderOwnVoiceProfile({
      metrics: {},
      categories: {},
      observations,
    });

    expect(own.examples).toEqual([
      { text: 'Мы вчера догнали план.', sampleCode: 'smp-02' },
    ]);
    expect(() =>
      barrier.renderOwnVoiceProfile({
        metrics: {},
        categories: {},
        observations: [{ ...observations[0], quote: '   ' }],
      })
    ).toThrow(/quoted example/);
  });

  test('the reference renderer never reads the quote it is handed', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    // Comments blanked first. The next function's doc comment explains that
    // own-voice mode requires the quote this one forbids, and a scan that read
    // it would fail the file for documenting the rule it keeps.
    const source = fs
      .readFileSync(path.resolve(__dirname, '..', base, 'identity-barrier.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    const start = source.indexOf('export function renderReferenceProfile');
    const body = source.slice(
      start,
      source.indexOf('export function', start + 20)
    );

    expect(body).not.toContain('quote');
    expect(body).not.toContain('examples');
  });
});

describe('the mandatory red tests', () => {
  test('an n-gram from the reference in a stored profile fails the build', () => {
    const source = 'старый поставщик срывал сроки третий месяц подряд';
    // A profile is stored only after this passes. The build going red here is
    // the point of the test, not a side effect of it.
    const stored = barrier.renderReferenceProfile({
      metrics: { sentenceLength: 9.6 },
      categories: {},
    });
    const serialised = JSON.stringify(stored);

    expect(barrier.sharedNgrams(serialised, source)).toEqual([]);
    expect(barrier.longestSharedRun(serialised, source)).toBeLessThanOrEqual(
      barrier.MAX_SHARED_NGRAM
    );
  });

  test('reference material is isolated from evidence, facts, quotes and context', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '..');

    // The isolation is a property of the whole content pipeline, so it is
    // asserted where the pipeline decides what may be selected rather than
    // where the barrier lives.
    const builder = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts'
      ),
      'utf8'
    );

    // The one place that decides what may enter a generation context. A rule
    // living anywhere else is a rule a future branch can route around.
    expect(builder).toContain("source.usagePurpose === 'STYLE_REFERENCE'");
    expect(builder).toMatch(
      /usagePurpose === 'STYLE_REFERENCE'\) return false/
    );
  });
});
