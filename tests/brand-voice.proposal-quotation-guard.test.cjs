const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/';
const pipeline = loadTypeScriptModule(base + 'assist.pipeline.ts');
const contract = loadTypeScriptModule(base + 'assist.contract.ts');
// Exact neutral recorded text/quote; run/sample/tenant IDs are not retained.
const recordedTone =
  'Используйте самоиронию, превращая собственные привычки в персонажей или наглядные образы: «Я тоже люблю уверенно кивать на встречах. Потом открываю заметки и обнаруживаю, что кивал сразу двум несовместимым решениям»; «Мой личный эксперт по посмертным выводам работает без выходных, но доступ к протоколу ему теперь ограничен». Шутка направлена на собственную невнимательность, склонность усложнять и делать выводы задним числом, а не на читателя. Формулируйте методические правила прямо, но обозначайте границы проверки: «Условия проверки должны появляться раньше результатов, а не догонять их в отчё';
const recordedQuote =
  'Условия проверки должны появляться раньше результатов, а не догонять их в отчёте.';
const otherQuote = 'Мы проверяем условия до начала работы.';
const otherText = 'Пишите от лица участника проверки.';
const portrait = {
  text: 'Автор проверяет условия работы и обсуждает причины решений. '.repeat(
    5
  ),
  observationRefs: ['neutral#1', 'neutral#2'],
};
const measurement = { scales: {}, postHabits: null, postLayout: null };

async function run(text = recordedTone, extra = {}, version = 2) {
  const seen = [];
  const answers = [];
  const reduced = {
    fields: [
      { field: 'TONE', text, observationRefs: ['neutral#1'] },
      { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
    ],
    portrait,
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
    ...extra,
  };
  const transport = {
    complete: async ({ stage }) => {
      seen.push(stage);
      if (stage === 'map')
        return {
          sampleCode: 'neutral',
          observations: [
            {
              field: 'TONE',
              metric: null,
              quote: recordedQuote,
              claim: 'Называет условия проверки заранее.',
            },
            {
              field: 'WHO_SPEAKS',
              metric: null,
              quote: otherQuote,
              claim: 'Говорит от лица участников проверки.',
            },
          ],
        };
      answers.push(structuredClone(reduced));
      return reduced;
    },
  };
  const result = await (version === 2
    ? pipeline.runAssistV2
    : pipeline.runAssist)({
    samples: [
      {
        code: 'neutral',
        text: recordedQuote + ' ' + otherQuote,
        language: 'ru',
        contentHash: 'offline',
      },
    ],
    measurement,
    transport,
    sampleLimit: 1,
  });
  return { result, seen, reduced, answers };
}

test('recorded600 cut quotation is omitted at prior complete sentence in new V2 generation without a retry', async () => {
  assert.equal(recordedTone.length, 600);
  const { result, seen, reduced } = await run();
  const tone = result.proposal.fields.find((f) => f.field === 'TONE');
  assert.ok(tone.text.endsWith('а не на читателя.'));
  assert.ok(recordedTone.startsWith(tone.text));
  assert.ok(tone.text.length < 600);
  assert.equal(
    (tone.text.match(/«/g) || []).length,
    (tone.text.match(/»/g) || []).length
  );
  contract.proposedFieldSchemaV2.parse(tone);
  assert.equal(reduced.fields[0].text, recordedTone);
  assert.deepEqual(tone.observationRefs, ['neutral#1']);
  assert.deepEqual(seen, ['map', 'reduce']);
  assert.deepEqual(result.calls, [
    { stage: 'map', attempt: 1, ok: true },
    { stage: 'reduce', attempt: 1, ok: true },
  ]);
  assert.deepEqual(
    result.proposal.fields.find((f) => f.field === 'WHO_SPEAKS'),
    reduced.fields[1]
  );
  assert.deepEqual(result.proposal.portrait, portrait);
  assert.equal(result.observations[0].quote, recordedQuote);
  assert.equal(result.observations[1].quote, otherQuote);
});

test('V1 generation and historical display keep the original600 text', async () => {
  const { result, seen } = await run(recordedTone, {}, 1);
  assert.equal(result.proposal.fields[0].text, recordedTone);
  assert.deepEqual(seen, ['map', 'reduce']);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  assert.equal(
    words.proposalInWords({ fields: [{ text: recordedTone }] }).fields[0].text,
    recordedTone
  );
});

test.each([
  ['complete quoted text', 'Правило: «' + recordedQuote + '»'],
  ['ordinary full prose', 'Пишите прямо и обозначайте границы проверки.'],
  ['quoted word boundary', recordedTone.replace(/отчё$/u, 'отч') + ' '],
  ['shorter cut field', recordedTone.slice(0, -1)],
  [
    'missing source quotation',
    'А'.repeat(520) + ' Правило: «' + 'Б'.repeat(70),
  ],
])('%s remains unchanged', async (_label, text) => {
  if (text.length > 600) text = text.slice(0, 600);
  const { result, seen } = await run(text);
  assert.equal(
    result.proposal.fields.find((f) => f.field === 'TONE').text,
    text
  );
  assert.deepEqual(seen, ['map', 'reduce']);
});

test('referenced admitted quote is required even when another observation has the continuation', async () => {
  const fields = [
    { field: 'TONE', text: recordedTone, observationRefs: ['neutral#2'] },
    { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
  ];
  const { result, seen } = await run(recordedTone, { fields });
  assert.equal(
    result.proposal.fields.find((f) => f.field === 'TONE').text,
    recordedTone
  );
  assert.deepEqual(seen, ['map', 'reduce']);
});

const guard = loadTypeScriptModule(base + 'proposal-quotation-guard.ts');
const fragment = recordedTone.slice(recordedTone.lastIndexOf('«') + 1);
const quoteOnly = [{ ref: 'neutral#1', field: 'TONE', quote: recordedQuote }];
const paddedCut = (prefix) => {
  const gap = 600 - prefix.length - fragment.length - 1;
  return (
    prefix + 'дополнительные условия '.repeat(50).slice(0, gap) + '«' + fragment
  );
};
const fieldOf = (text) => ({
  field: 'TONE',
  text,
  observationRefs: ['neutral#1'],
});

test('no safe complete prefix omits only the new TONE field, keeping portrait/evidence and call count', async () => {
  const text = paddedCut('Условия проверки ');
  assert.equal(text.length, 600);
  const { result, seen } = await run(text);
  assert.deepEqual(result.proposal.fields, [
    { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
  ]);
  assert.deepEqual(result.proposal.portrait, portrait);
  assert.equal(result.observations[0].quote, recordedQuote);
  assert.deepEqual(seen, ['map', 'reduce']);
});

test.each([
  'Проверьте адрес г. Москва ',
  'Проверьте адрес корп. Москва ',
  'Ask Dr. Smith ',
  'Read approx. Date ',
  'Проверьте дату 23.10.2026 ',
  'Проверьте страницу example.com ',
])(
  'uncertain abbreviation/decimal/URL stop cannot become a partial retained claim: %s',
  (prefix) => {
    const field = fieldOf(paddedCut(prefix));
    assert.equal(field.text.length, 600);
    assert.equal(guard.omitIncompleteToneQuotation(field, quoteOnly), null);
  }
);

test('punctuation inside earlier quotations cannot become the retained boundary', () => {
  const prefix = 'Проверяйте «Первую мысль. Вторую мысль». Правило ';
  const field = fieldOf(paddedCut(prefix));
  const result = guard.omitIncompleteToneQuotation(field, quoteOnly);
  assert.equal(result.text, 'Проверяйте «Первую мысль. Вторую мысль».');
  assert.strictEqual(result.observationRefs, field.observationRefs);
});

test('Unicode complete prefix keeps emoji/code points without slicing a surrogate or adding words', () => {
  const field = fieldOf(paddedCut('Проверяйте 🧩 вместе. Правило '));
  const result = guard.omitIncompleteToneQuotation(field, quoteOnly);
  assert.equal(result.text, 'Проверяйте 🧩 вместе.');
  assert.ok(field.text.startsWith(result.text));
  assert.ok(Array.from(result.text).includes('🧩'));
});

test.each([
  ['two unmatched openers', recordedTone.slice(1).replace('«', '««')],
  ['ambiguous mixed quotes', '"Контекст". ' + recordedTone.slice(12)],
  [
    'balanced complete quotes at600',
    'А'.repeat(600 - recordedQuote.length - 2) + '«' + recordedQuote + '»',
  ],
  ['unmatched closer first', '»' + recordedTone.slice(1)],
])('%s abstains with unchanged text', (label, text) => {
  assert.equal(text.length, 600, label);
  const field = fieldOf(text);
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, quoteOnly),
    field
  );
});

test('quote must continue the partial word, not merely the sentence after a word boundary', () => {
  const field = fieldOf(recordedTone);
  const observations = quoteOnly.map((o) => ({
    ...o,
    quote: o.quote.replace('отчёте.', 'отчё те.'),
  }));
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, observations),
    field
  );
});


test('all unsafe fields omitted uses existing empty-proposal outcome without extra pipeline calls', async () => {
  const text = paddedCut('Условия проверки ');
  const { result, seen } = await run(text, { fields: [fieldOf(text)] });
  assert.deepEqual(result.proposal.fields, []);
  assert.equal(result.observations.length, 2);
  assert.deepEqual(seen, ['map', 'reduce']);
  assert.deepEqual(result.proposal.portrait, portrait);
});
