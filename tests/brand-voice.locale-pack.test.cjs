const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

/**
 * The product ships sixteen interface locales and had word lists for one.
 *
 * `analyzer.ts` mapped `en` to the Russian pack, so every scale that divides
 * by a word list measured an English corpus with Russian words: the copula
 * scale had no opportunities, the first-person scale compared «мы» against
 * «компания» in English text, and the clerical-noun scale looked for `-ение`
 * and returned zero — which the screen shows as "this author never writes
 * clerically". A zero in this product is a finding. That is the one place it
 * lied.
 *
 * Three things are fenced here: that English is measured with English lists,
 * that a language with no lists answers with an absence rather than a zero,
 * and that the price of the next language is written down as data a new pack
 * can be held to.
 */

const REPO = path.resolve(__dirname, '..');
const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const analyzer = loadTypeScriptModule(`${BASE}/analyzer.ts`);
const localePacks = loadTypeScriptModule(`${BASE}/locale-pack.ts`);
const types = loadTypeScriptModule(`${BASE}/brand-voice.types.ts`);
const postHabits = loadTypeScriptModule(`${BASE}/post-habits.ts`);
const functionWords = loadTypeScriptModule(`${BASE}/function-words.ts`);

/**
 * Real English, read from a commit rather than from the working tree.
 *
 * Three of these are the Contributor Covenant, the contributing guide and the
 * security policy — English written by people, not translated into it. The
 * rest are this project's own English engineering prose. None of them is a
 * translation, which is what the task asks for: a Russian text rendered into
 * English carries Russian syntax and would flatter the pack it is testing.
 *
 * Pinned, because reading the working tree would move the numbers every time
 * one of these files is edited, including by the commit that records them.
 */
const CORPUS_COMMIT = '1dad1259';
const ENGLISH_FILES = [
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.codex/stages/content-factory-next-ia0/artifacts/infrastructure-security.md',
  '.codex/stages/content-factory-next-zjm/summary.md',
  '.codex/stages/content-factory-next-saas/artifacts/hybrid-ai.md',
  '.codex/stages/content-factory-next-9e9/artifacts/consumer-backend.md',
  '.codex/stages/content-factory-next-q4p/artifacts/ai-usage.md',
];

const stripMarkdown = (text) =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[|>].*$/gm, ' ');

const chunk = (text) =>
  stripMarkdown(text)
    .split(/\n\s*\n/)
    .reduce((acc, paragraph) => {
      const last = acc[acc.length - 1];
      if (last && last.length < 600) acc[acc.length - 1] = `${last}\n\n${paragraph}`;
      else acc.push(paragraph);
      return acc;
    }, [])
    .map((one) => one.trim())
    .filter((one) => one.length >= 400 && !/[А-Яа-яЁё]/.test(one));

const englishSamples = (language = 'en') => {
  const chunks = ENGLISH_FILES.flatMap((file) =>
    chunk(
      execFileSync('git', ['show', `${CORPUS_COMMIT}:${file}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      })
    )
  );
  return chunks.map((text, index) => ({
    code: `en-${String(index + 1).padStart(3, '0')}`,
    text,
    language,
    contentHash: `hash-${String(index + 1).padStart(3, '0')}`,
  }));
};

const DICTIONARY_SCALES = ['dashCopula', 'firstPerson', 'nominalisation'];

describe('the English corpus is measured with English word lists', () => {
  const samples = englishSamples();
  const measured = analyzer.analyzeBrandVoice(samples, { language: 'en' });

  test('the corpus is large enough to decide anything', () => {
    expect(samples.length).toBeGreaterThanOrEqual(20);
    expect(measured.sentenceCount).toBeGreaterThan(200);
  });

  test('the measurement records the English pack, not the Russian one', () => {
    expect(measured.localePackVersion).toMatch(/^en-/);
  });

  /**
   * The English lists fire on English text.
   *
   * `observations` is the denominator the scale found — the sentences that
   * took either spelling, the pronoun-or-organisation mentions, the sentences
   * examined. Nonzero means the word list matched something, which is exactly
   * what the Russian pack could not do here. Whether a corridor then comes out
   * of it is a property of this corpus and not of the dictionary: technical
   * English writes few dashes where a copula could stand, and the scale is
   * allowed to say so.
   */
  test.each(DICTIONARY_SCALES)('scale %s finds its words', (key) => {
    const scale = measured.scales[key];
    expect(scale).toBeDefined();
    expect(scale.reason).not.toBe('NO_DICTIONARY');
    expect(scale.reason).not.toBe('FAILED');
    expect(scale.observations).toBeGreaterThan(0);
  });

  test('two of the three yield a corridor on this corpus', () => {
    const values = DICTIONARY_SCALES.filter((key) =>
      types.isScaleValue(measured.scales[key])
    );
    expect(values).toContain('nominalisation');
    expect(values).toContain('firstPerson');
  });

  test('the lexicon is this text and not this language', () => {
    expect(measured.lexicon.length).toBeGreaterThan(0);
    const terms = measured.lexicon.map((one) => one.term);
    for (const grammar of ['the', 'and', 'that', 'with']) {
      expect(terms).not.toContain(grammar);
    }
  });

  test('the service-word distance has a profile to measure against', () => {
    expect(measured.voicePrint.functionWords).not.toBeNull();
    expect(measured.voicePrint.functionWords.terms.length).toBeGreaterThan(20);
    const answer = functionWords.functionWordDistance(
      samples[0].text,
      measured.voicePrint.functionWords,
      localePacks.LOCALE_PACKS.en
    );
    expect(answer.measured).toBe(true);
    expect(answer.distance).toBeGreaterThan(0);
  });

  test('the post habits that need a dictionary answer with numbers', () => {
    expect(measured.postHabits.opensWithAdmission).not.toBeNull();
    expect(measured.postHabits.endsWithCallToAction).not.toBeNull();
    expect(measured.postHabits.carriesOwnMeasurement).not.toBeNull();
    expect(measured.postHabits.carriesOwnMeasurement).toBeGreaterThan(0);
  });

  /**
   * The defect itself, kept as a test rather than as a memory.
   *
   * The same English text through the Russian pack: the clerical-noun scale
   * finds nothing, because it is looking for `-ение`, and reports a zero that
   * reads as a fact about the writer.
   */
  test('the Russian pack on the same English text still reports the old lie', () => {
    const throughRussian = analyzer
      .analyzeBrandVoice(
        englishSamples('ru').map((one) => ({ ...one, language: 'ru' })),
        { language: 'ru' }
      );
    expect(throughRussian.scales.nominalisation.raw).toBe(0);
    expect(measured.scales.nominalisation.raw).toBeGreaterThan(0);
  });
});

describe('a language with no word lists answers with an absence', () => {
  const samples = englishSamples('de');
  const measured = analyzer.analyzeBrandVoice(samples, { language: 'de' });

  test('it is a language the product admits exists', () => {
    expect(types.BRAND_VOICE_LOCALES).toContain('de');
    expect(localePacks.hasLocalePack('de')).toBe(false);
    expect(localePacks.packFor('de')).toBeUndefined();
  });

  test('the measurement says which pack it did not have', () => {
    expect(measured.localePackVersion).toBe('none-de');
  });

  test.each(DICTIONARY_SCALES)('scale %s is absent, not zero', (key) => {
    const scale = measured.scales[key];
    expect(types.isScaleValue(scale)).toBe(false);
    expect(scale.reason).toBe('NO_DICTIONARY');
    expect(scale.raw).toBeUndefined();
  });

  test('the habits that need a dictionary are null, not zero', () => {
    for (const key of [
      'opensWithAdmission',
      'endsWithCallToAction',
      'carriesOwnMeasurement',
    ]) {
      expect(measured.postHabits[key]).toBeNull();
      expect(measured.postHabits.counts[key]).toBeNull();
    }
  });

  test('the habits are read out as an absence in words', () => {
    const rendered = postHabits.renderPostHabits(measured.postHabits, 'ru');
    expect(rendered).toContain('не измеряется: для этого языка нет словаря');
    expect(rendered).not.toMatch(/opensWithAdmission · [^\n]*: 0%/);
    const english = postHabits.renderPostHabits(measured.postHabits, 'en');
    expect(english).toContain('this language has no dictionary for it');
  });

  test('the lexicon is empty rather than a list of grammar', () => {
    expect(measured.lexicon).toEqual([]);
  });

  test('the service-word distance says dictionary, not corpus', () => {
    expect(measured.voicePrint.functionWords).toBeNull();
    const answer = functionWords.functionWordDistance(
      samples[0].text,
      null,
      localePacks.emptyLocalePack('de')
    );
    expect(answer.measured).toBe(false);
    expect(answer.reason).toBe('NO_DICTIONARY');
  });

  /**
   * The half that keeps working, and the reason to prefer it.
   *
   * Character n-grams need no word list in any language: they read morphology,
   * spacing and punctuation straight off the text. Nobody had made that
   * argument for them before this question was asked.
   */
  test('everything that needs no dictionary is measured anyway', () => {
    expect(measured.voicePrint.ngrams).not.toBeNull();
    expect(measured.voicePrint.ngrams.grams.length).toBeGreaterThan(100);
    for (const key of [
      'sentenceLength',
      'sentenceSpread',
      'shortSentences',
      'questions',
      'listParagraphs',
    ]) {
      expect(types.isScaleValue(measured.scales[key])).toBe(true);
    }
    expect(measured.postHabits.length.median).toBeGreaterThan(0);
    expect(measured.postHabits.opensWithNumber).not.toBeNull();
  });
});

describe('what a seventeenth language costs', () => {
  test('the contract names every list, what reads it and how small it may be', () => {
    const listed = localePacks.LOCALE_PACK_CONTRACT.map((one) => one.list);
    const packKeys = Object.keys(localePacks.LOCALE_PACKS.ru).filter(
      (key) => key !== 'version' && key !== 'firstPersonSingular'
    );
    expect([...listed].sort()).toEqual([...packKeys].sort());
    for (const entry of localePacks.LOCALE_PACK_CONTRACT) {
      expect(entry.reads.length).toBeGreaterThan(10);
      expect(entry.why.length).toBeGreaterThan(20);
      expect(entry.minimum).toBeGreaterThan(0);
    }
  });

  test.each(['ru', 'en'])(
    'the %s pack meets the contract it will hold the next one to',
    (locale) => {
      const pack = localePacks.LOCALE_PACKS[locale];
      const short = localePacks.LOCALE_PACK_CONTRACT.filter((entry) => {
        const list = pack[entry.list];
        return (list.size ?? list.length) < entry.minimum;
      }).map((entry) => `${entry.list} < ${entry.minimum}`);
      expect(short).toEqual([]);
    }
  );

  test('every measurement is on exactly one of the two lists', () => {
    const free = new Set(localePacks.DICTIONARY_FREE_MEASUREMENTS);
    const bound = new Set(localePacks.DICTIONARY_BOUND_MEASUREMENTS);
    for (const one of free) expect(bound.has(one)).toBe(false);
    expect(free.has('characterNgrams')).toBe(true);
    for (const key of DICTIONARY_SCALES) expect(bound.has(key)).toBe(true);
  });

  test('the gap between locales the product ships and locales it can measure is visible', () => {
    expect(types.BRAND_VOICE_LOCALES.length).toBe(16);
    expect([...localePacks.MEASURABLE_LOCALES].sort()).toEqual(['en', 'ru']);
  });
});
