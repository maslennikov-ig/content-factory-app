'use strict';

/**
 * Tails of the second-release review (`content-factory-next-97dq.19`,
 * `evidence/correctness-review-second-release.md` P2-3..P2-5). Each was «the
 * next edit here will break»; each is pinned here so it cannot.
 *
 *  - P2-3: the core prompt's fact blocks tile the whole space of
 *    selected × verified × origin × kind × source: a selected fact is printed
 *    in exactly one block, and no fact is printed twice.
 *  - P2-4: one text selection from an old tab ticks one row, and a
 *    «correction» that changes nothing is none.
 *  - P2-5: the entity decoder maps replacements by name, so an entry with its
 *    own group does not shift the ones after it.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const coreWrite = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts',
  { '@contentfactory/nestjs-libraries/openai/ai.clients': {} }
);
const digest = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.ts',
  {
    '@contentfactory/nestjs-libraries/dtos/content.language': {
      contentLanguageNames: { ru: 'Russian', en: 'English' },
    },
  }
);
const { createEntityDecoder } = loadTypeScriptModule(
  'libraries/helpers/src/utils/html-entities.ts'
);

describe('P2-3: the core prompt’s fact blocks tile the space', () => {
  const ORIGINS = ['input', 'person', 'search', 'memory', 'avatar', 'model'];
  const KINDS = ['own', 'found', 'external', undefined];
  const facts = [];
  let index = 0;
  for (const origin of ORIGINS)
    for (const kind of KINDS)
      for (const verified of [true, false])
        for (const selected of [true, false])
          for (const sourceUrl of [null, 'https://source.example/a'])
            facts.push({
              statement: `Строка номер ${++index} для проверки блоков.`,
              origin,
              kind,
              verified,
              selected,
              sourceUrl,
              evidenceId: null,
              factId: null,
              status: verified ? 'confirmed' : 'unverified',
            });
  const prompt = coreWrite.corePrompt({
    organizationId: 'org',
    language: 'ru',
    brief: {
      inputKind: 'thought',
      thesis: 'Тезис.',
      position: null,
      disagreement: null,
      audience: null,
      origins: {},
      ungrounded: [],
      facts,
    },
    answers: [],
    questionTextByKey: {},
    personText: '',
    borrowed: null,
    foreignShingles: [],
  });
  const times = (fact) => prompt.split(fact.statement).length - 1;
  const described = (fact) =>
    `${fact.origin}/${fact.kind}/verified=${fact.verified}/selected=${fact.selected}/url=${Boolean(fact.sourceUrl)}`;

  test('no fact is printed in two blocks', () => {
    expect(facts.filter((fact) => times(fact) > 1).map(described)).toEqual([]);
  });

  test('a selected fact always has a block, except the two classes left out on purpose', () => {
    const missing = facts
      .filter((fact) => fact.selected && times(fact) === 0)
      // The person's own row without a link rides in their words and answers;
      // someone else's claim typed without a source is never a fact of the core.
      .filter((fact) => !(fact.origin === 'person' && !fact.sourceUrl))
      .filter(
        (fact) =>
          !(fact.origin === 'input' && fact.kind === 'external' && !fact.verified && !fact.sourceUrl)
      );
    expect(missing.map(described)).toEqual([]);
  });

  test('the twelve rows v6 dropped now stand in the block of what was taken from research', () => {
    for (const origin of ['memory', 'avatar', 'model'])
      for (const kind of ['own', undefined]) {
        const fact = facts.find(
          (row) =>
            row.origin === origin &&
            row.kind === kind &&
            row.selected &&
            !row.verified &&
            !row.sourceUrl
        );
        expect(times(fact)).toBe(1);
      }
  });
});

describe('P2-4: a no-op correction is none', () => {
  const autonomy = {
    evidenceId: 'ev-autonomy',
    url: 'https://autonomy.work/portfolio/icelandsww/',
    title: 'Iceland',
    excerpt: 'The trials involved 2,500 workers, over 1% of Iceland’s working population.',
    text: null,
  };
  const settle = (original, replacement) =>
    digest.settleResearchDigest(
      {
        verdicts: [
          {
            claimKey: 'own:a',
            verdict: 'conflicting',
            evidenceId: 'ev-autonomy',
            quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
            original,
            replacement,
            note: 'Доклад называет 2 500 участников.',
          },
        ],
        findings: [],
      },
      {
        claims: [{ key: 'own:a', statement: 'Эксперимент охватил 25 тысяч человек', own: true }],
        sources: [autonomy],
      }
    ).verdicts[0];

  test('a replacement equal to the original, up to case and spacing, gives no twin', () => {
    expect(settle('25 тысяч', '25 тысяч').correction).toBeNull();
    expect(settle('25 тысяч', '  25  Тысяч ').correction).toBeNull();
    expect(settle('25 тысяч', 'около 2 500').correction).toEqual({
      original: '25 тысяч',
      replacement: 'около 2 500',
    });
  });
});

describe('P2-5: entity replacements are found by name, not by group number', () => {
  test('an entry with its own group does not shift the entries after it', () => {
    const decode = createEntityDecoder([
      ['&(apos|#0?39);', "'"],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&amp;', '&'],
    ]);
    expect(decode('&lt;b&gt; &apos;x&#39; &amp;lt;')).toBe("<b> 'x' &lt;");
  });

  test('one pass: what a replacement wrote is not read again', () => {
    const decode = createEntityDecoder([
      ['&amp;', '&'],
      ['&lt;', '<'],
    ]);
    expect(decode('&amp;lt;')).toBe('&lt;');
    expect(decode('')).toBe('');
  });
});
