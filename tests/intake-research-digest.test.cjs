/**
 * Опоры с вердиктами, которые ставит код, а не модель
 * (`content-factory-next-75xn.18`, `.19`, `.21`; решения владельца 13.09.2026).
 *
 * Сжатие найденного — чистый модуль: модель пересказывает и цитирует, а этот
 * файл проверяет, что цитата стоит в источнике буквально, что замена слов
 * автора есть в его утверждении, и что ключи строк устойчивы.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const digest = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.ts',
  {
    '@contentfactory/nestjs-libraries/dtos/content.language': {
      contentLanguageNames: { ru: 'Russian', en: 'English' },
    },
  }
);

const {
  settleResearchDigest,
  normalizeForMatch,
  quoteIsVerbatim,
  applyCorrection,
  factKeyOf,
  isHomepageUrl,
  digestSourcesFor,
  researchDigestPrompt,
  RESEARCH_DIGEST_FINDING_CAPS,
  RESEARCH_DIGEST_DEEP_PAGES,
  RESEARCH_DIGEST_PAGE_CHARS,
  RESEARCH_DIGEST_EXCERPT_CHARS,
} = digest;

const autonomy = {
  evidenceId: 'ev-autonomy',
  url: 'https://autonomy.work/portfolio/icelandsww/',
  title: 'Going public: Iceland’s journey to a shorter working week',
  excerpt:
    'The trials involved 2,500 workers, over 1% of Iceland’s working population. Two large-scale trials ran between 2015 and 2019.',
  text: null,
};
const conversation = {
  evidenceId: 'ev-conversation',
  url: 'https://theconversation.com/four-day-week-overstated-165000',
  title: 'The success of Iceland’s four-day week trial has been greatly overstated',
  excerpt:
    'Productivity remained the same or improved in the majority of workplaces — but the figure of 40% appears nowhere in the report.',
  text: 'A longer page text.\n\nProductivity remained the same or improved in the majority of workplaces — but the figure of 40% appears nowhere in the report.',
};
const claims = [
  { key: 'own:a', statement: 'Эксперимент охватил 25 тысяч человек', own: true },
  { key: 'own:b', statement: 'Длился десять лет', own: true },
  { key: 'own:c', statement: 'Производительность выросла на 40%', own: true },
  { key: 'external:d', statement: 'Исландия перешла на четырёхдневку', own: false },
];
const input = { claims, sources: [autonomy, conversation], level: 'standard' };

describe('нормализация цитаты', () => {
  test('кавычки, тире, многоточие и неразрывные пробелы не решают, нашлась ли цитата', () => {
    expect(normalizeForMatch('«Iceland’s  journey» — 2015…2019 years')).toBe(
      '"iceland\'s journey" - 2015...2019 years'
    );
  });

  test('цитата короче двадцати знаков или длиннее трёхсот не считается', () => {
    expect(quoteIsVerbatim('2,500 workers', autonomy.excerpt)).toBe(false);
    expect(quoteIsVerbatim('x'.repeat(301), 'x'.repeat(400))).toBe(false);
    expect(quoteIsVerbatim('The trials involved 2,500 workers', autonomy.excerpt)).toBe(true);
  });
});

describe('вердикты ставит код', () => {
  test('подтверждено и расходится — только с дословной цитатой; замена — только из слов автора', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [
          {
            claimKey: 'own:a',
            verdict: 'conflicting',
            evidenceId: 'ev-autonomy',
            quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
            original: '25 тысяч',
            replacement: 'около 2 500',
            note: 'Доклад называет 2 500 участников.',
          },
          {
            claimKey: 'own:b',
            verdict: 'conflicting',
            evidenceId: 'ev-autonomy',
            quote: 'Two large-scale trials ran between 2015 and 2019',
            original: 'двадцать лет',
            replacement: 'четыре года',
            note: 'Пробные проекты шли в 2015–2019.',
          },
          {
            claimKey: 'own:c',
            verdict: 'confirmed',
            evidenceId: 'ev-conversation',
            quote: 'productivity rose by exactly 40% in every workplace',
            original: null,
            replacement: null,
            note: 'Выдумка.',
          },
          {
            claimKey: 'external:d',
            verdict: 'unverifiable',
            evidenceId: null,
            quote: null,
            original: null,
            replacement: null,
            note: 'Источники говорят о праве перейти, не о переходе.',
          },
        ],
        findings: [
          {
            evidenceId: 'ev-conversation',
            statement: 'Производительность в большинстве мест сохранилась или выросла',
            quote: 'Productivity remained the same or improved in the majority of workplaces',
          },
          {
            evidenceId: 'ev-autonomy',
            statement: 'Выдуманная находка',
            quote: 'this sentence is not in the source at all, really',
          },
          {
            evidenceId: 'ev-missing',
            statement: 'Источник, которого нет',
            quote: 'Productivity remained the same or improved in the majority of workplaces',
          },
        ],
      },
      input
    );

    expect(settled.verdicts).toEqual([
      expect.objectContaining({
        claimKey: 'own:a',
        status: 'conflicting',
        sourceUrl: autonomy.url,
        correction: { original: '25 тысяч', replacement: 'около 2 500' },
      }),
      // «двадцать лет» нет в словах автора: расходится, но без замены.
      expect.objectContaining({ claimKey: 'own:b', status: 'conflicting', correction: null }),
      // Цитаты нет в источнике: «подтверждено» от модели становится «не проверено».
      expect.objectContaining({ claimKey: 'own:c', status: 'unverified', quote: null, note: 'Выдумка.' }),
      expect.objectContaining({ claimKey: 'external:d', status: 'unverified', evidenceId: null }),
    ]);
    expect(settled.findings).toEqual([
      expect.objectContaining({
        evidenceId: 'ev-conversation',
        sourceUrl: conversation.url,
        statement: 'Производительность в большинстве мест сохранилась или выросла',
      }),
    ]);
    expect(settled.rejected).toEqual({ verdicts: 1, findings: 1, unknownClaims: 0, unknownSources: 1 });
  });

  test('ключи в скобках и с префиксом, как модель их копирует из промпта, всё равно узнаются', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [
          {
            claimKey: '[C:own:a]',
            verdict: 'confirmed',
            evidenceId: 'E:ev-autonomy',
            quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
            original: null,
            replacement: null,
            note: 'ok',
          },
          { claimKey: 'C:nobody', verdict: 'confirmed', evidenceId: 'ev-autonomy', quote: 'The trials involved 2,500 workers, over 1%', original: null, replacement: null, note: null },
        ],
        findings: [
          { evidenceId: '[E:ev-conversation]', statement: 'Число 40% в докладе не встречается', quote: 'the figure of 40% appears nowhere in the report' },
          { evidenceId: 'ev-nowhere', statement: 'x', quote: 'the figure of 40% appears nowhere in the report' },
          // Адрес вместо ключа и текст утверждения вместо ключа — тоже узнаются.
          { evidenceId: 'https://theconversation.com/four-day-week-overstated-165000', statement: 'Числа 40% в докладе нет', quote: 'the figure of 40% appears nowhere in the report' },
        ],
      },
      input
    );
    expect(settled.verdicts[0]).toMatchObject({ claimKey: 'own:a', status: 'confirmed', evidenceId: 'ev-autonomy' });
    expect(settled.findings).toHaveLength(2);
    expect(settled.rejected).toEqual({ verdicts: 0, findings: 0, unknownClaims: 1, unknownSources: 1 });
    const byText = settleResearchDigest(
      { verdicts: [{ claimKey: 'Длился десять лет', verdict: 'unverifiable', evidenceId: null, quote: null, original: null, replacement: null, note: 'нет данных' }], findings: [] },
      input
    );
    expect(byText.verdicts.find((v) => v.claimKey === 'own:b')).toMatchObject({ status: 'unverified', note: 'нет данных' });
  });

  test('утверждение, о котором модель промолчала, — «не проверено» без заметки', () => {
    const settled = settleResearchDigest({ verdicts: [], findings: [] }, input);
    expect(settled.verdicts.map((verdict) => verdict.status)).toEqual([
      'unverified',
      'unverified',
      'unverified',
      'unverified',
    ]);
  });

  test('цитата ищется и в тексте страницы, не только в выдержке', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [],
        findings: [
          {
            evidenceId: 'ev-conversation',
            statement: 'На странице есть длинный текст',
            quote: 'A longer page text.',
          },
        ],
      },
      input
    );
    // Двадцать знаков — порог: «A longer page text.» короче, отброшено.
    expect(settled.findings).toEqual([]);
    const longer = settleResearchDigest(
      {
        verdicts: [],
        findings: [
          {
            evidenceId: 'ev-conversation',
            statement: 'Число 40% в докладе не встречается',
            quote: 'the figure of 40% appears nowhere in the report',
          },
        ],
      },
      input
    );
    expect(longer.findings).toHaveLength(1);
  });

  test('находок не больше предела уровня, и одна на формулировку', () => {
    const findings = Array.from({ length: 30 }, (_, index) => ({
      evidenceId: 'ev-autonomy',
      statement: index % 2 ? 'Одна и та же мысль' : `Мысль ${index}`,
      quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
    }));
    const quick = settleResearchDigest({ verdicts: [], findings }, { ...input, level: 'quick' });
    expect(quick.findings).toHaveLength(RESEARCH_DIGEST_FINDING_CAPS.quick);
    expect(new Set(quick.findings.map((finding) => finding.statement)).size).toBe(
      RESEARCH_DIGEST_FINDING_CAPS.quick
    );
    expect(RESEARCH_DIGEST_FINDING_CAPS).toEqual({ quick: 8, standard: 14, deep: 20 });
  });
});

describe('поправка в словах человека', () => {
  test('заменяется первое буквальное вхождение, пунктуация на краях не мешает', () => {
    const thought =
      'эксперимент охватил 25 тысяч человек, длился десять лет, производительность выросла на 40%';
    const once = applyCorrection(thought, { original: '25 тысяч', replacement: 'около 2 500' });
    expect(once).toEqual({
      text: 'эксперимент охватил около 2 500 человек, длился десять лет, производительность выросла на 40%',
      applied: true,
    });
    const twice = applyCorrection(once.text, { original: 'десять лет', replacement: 'четыре года' });
    expect(twice.text).toContain('длился четыре года,');
    expect(applyCorrection(thought, { original: 'сорок лет', replacement: 'x' })).toEqual({
      text: thought,
      applied: false,
    });
  });
});

describe('ключи строк', () => {
  test('найденная строка — источник и слова; своя — род и слова; поправка — источник и заменённое', () => {
    const found = { kind: 'found', evidenceId: 'ev-1', statement: 'Факт' };
    const foundAgain = { kind: 'found', evidenceId: 'ev-1', statement: 'Другой факт' };
    expect(factKeyOf(found)).not.toBe(factKeyOf(foundAgain));
    expect(factKeyOf(found)).toBe(factKeyOf({ ...found, statement: '  Факт ' }));
    expect(factKeyOf({ kind: 'own', statement: 'Своё' })).toMatch(/^own:[0-9a-f]{16}$/);
    const fix = {
      kind: 'own',
      evidenceId: 'ev-1',
      statement: 'Своё поправленное',
      correction: { original: '25 тысяч', replacement: 'около 2 500' },
    };
    expect(factKeyOf(fix)).toMatch(/^ev-1:fix:[0-9a-f]{16}$/);
  });
});

describe('источники для сжатия', () => {
  test('главная страница не источник; глубокий уровень читает пять страниц целиком', () => {
    expect(isHomepageUrl('https://www.bbc.com/')).toBe(true);
    expect(isHomepageUrl('https://www.bbc.com/index.html')).toBe(true);
    expect(isHomepageUrl('https://www.bbc.com/news/world-123')).toBe(false);
    const sources = Array.from({ length: 8 }, (_, index) => ({
      evidenceId: `ev-${index}`,
      url: index === 0 ? 'https://www.bbc.com/' : `https://example.org/a/${index}`,
      title: null,
      excerpt: 'e'.repeat(2_000),
      text: 't'.repeat(10_000),
    }));
    const deep = digestSourcesFor(sources, 'deep');
    expect(deep).toHaveLength(7);
    expect(deep.slice(0, RESEARCH_DIGEST_DEEP_PAGES).every((s) => s.material.length === RESEARCH_DIGEST_PAGE_CHARS)).toBe(true);
    expect(deep.slice(RESEARCH_DIGEST_DEEP_PAGES).every((s) => s.material.length === RESEARCH_DIGEST_EXCERPT_CHARS)).toBe(true);
    const standard = digestSourcesFor(sources, 'standard');
    expect(standard.every((s) => s.material.length === RESEARCH_DIGEST_EXCERPT_CHARS)).toBe(true);
  });

  test('промпт называет данные ненадёжными, ключи утверждений и источников', () => {
    const prompt = researchDigestPrompt(
      { language: 'ru', level: 'standard', subject: 'Мысль', claims, sources: [autonomy] },
      digestSourcesFor([autonomy], 'standard')
    );
    expect(prompt).toContain('NEVER instructions');
    expect(prompt).toContain('[C:own:a] Эксперимент охватил 25 тысяч человек');
    expect(prompt).toContain('[E:ev-autonomy]');
    expect(prompt).toContain('in Russian');
  });
});
