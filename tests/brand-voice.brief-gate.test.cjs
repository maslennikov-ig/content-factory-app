'use strict';

/**
 * Refusing to write when there is nothing to say.
 *
 * A model asked to write about a topic with no substance produces something
 * fluent — that is what it is for — and the result reads like content and says
 * nothing. The gate turns that invisible failure into a question a person can
 * answer in a sentence.
 *
 * The requirement that surprises people is disagreement, and it carries the
 * most weight: a piece nobody could argue with is a piece nobody needed. Ask
 * for the objection, and either it exists or the topic does not.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const gate = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/brief-gate.ts'
);

const complete = {
  goal: 'Объяснить, почему поменяли поставщика',
  thesis: 'Смена поставщика стоила двух дней и сняла срывы графика',
  channel: 'telegram',
  format: 'one_long',
  facts: [
    {
      statement: 'Старый поставщик срывал сроки три месяца подряд',
      sourceUrl: 'https://example.com/report',
    },
  ],
  position: 'Считаем, что два дня доставки — приемлемая цена за график',
  disagreement: 'Снабжение возражает: дальний склад дороже в логистике',
  audience: 'Смены, мастера и подписчики канала завода',
};

describe('a brief without substance produces questions, not a draft', () => {
  test.each([
    ['thesis', 'thesis'],
    ['facts', 'facts'],
    ['position', 'position'],
    ['disagreement', 'disagreement'],
    ['audience', 'audience'],
  ])('a missing %s blocks the draft and asks for it', (unused, field) => {
    const verdict = gate.evaluateBrief({ ...complete, [field]: undefined });

    expect(verdict.ready).toBe(false);
    expect(verdict.missing).toContain(field);
    // A question, not "field required": there is something to do with a
    // question.
    const asked = verdict.questions.find((one) => one.field === field);
    expect(asked.question.ru).toMatch(/\?/);
    expect(asked.question.en).toMatch(/\?/);
  });

  test('a complete brief passes and asks nothing', () => {
    const verdict = gate.evaluateBrief(complete);

    expect(verdict.ready).toBe(true);
    expect(verdict.questions).toEqual([]);
  });

  test('a fact with no source is not a fact', () => {
    const verdict = gate.evaluateBrief({
      ...complete,
      facts: [{ statement: 'Все знают, что так лучше' }],
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.ungroundedFacts).toEqual(['Все знают, что так лучше']);
  });

  test('a fact from the workspace memory counts, because it was checked on the way in', () => {
    const verdict = gate.evaluateBrief({
      ...complete,
      facts: [{ statement: 'Отгрузки идут по графику', factId: 'fct-01' }],
    });

    expect(verdict.ready).toBe(true);
  });

  test('a one-word answer does not get past the gate', () => {
    // A field filled to make the button light up is the failure this exists
    // to catch, not an edge case.
    expect(gate.evaluateBrief({ ...complete, disagreement: 'нет' }).ready).toBe(
      false
    );
  });

  test('all five are named at once, so the person answers once', () => {
    const verdict = gate.evaluateBrief({ goal: 'Написать пост' });

    expect(verdict.missing).toEqual([
      'thesis',
      'facts',
      'position',
      'disagreement',
      'audience',
    ]);
  });
});

describe('the topic radar explains its ranking', () => {
  const candidates = [
    {
      id: 't1',
      title: 'Смена поставщика подшипников',
      evidenceCount: 4,
      covered: false,
      freshnessDays: 3,
    },
    {
      id: 't2',
      title: 'Итоги квартала',
      evidenceCount: 0,
      covered: true,
      freshnessDays: 90,
    },
  ];

  test('a topic with evidence, unwritten and fresh outranks one without', () => {
    const [first, second] = gate.scoreTopics(candidates);

    expect(first.id).toBe('t1');
    expect(first.score).toBeGreaterThan(second.score);
  });

  test('every candidate carries the reason it ranked where it did', () => {
    for (const topic of gate.scoreTopics(candidates)) {
      // A ranking with scores and no reasons is a ranking nobody can argue
      // with — the same failure the brief gate prevents, one step earlier.
      expect(topic.reasons.length).toBeGreaterThan(0);
      for (const reason of topic.reasons) {
        expect(reason.ru.length).toBeGreaterThan(5);
        expect(reason.en.length).toBeGreaterThan(5);
      }
    }
  });

  test('having nothing to build on is said plainly, not scored quietly', () => {
    const [, weak] = gate.scoreTopics(candidates);

    expect(weak.reasons.some((one) => /нет ни одного/.test(one.ru))).toBe(true);
  });

  test('the ranking is deterministic for equal scores', () => {
    const tie = [
      { id: 'a', title: 'Б', evidenceCount: 1, covered: false, freshnessDays: 1 },
      { id: 'b', title: 'А', evidenceCount: 1, covered: false, freshnessDays: 1 },
    ];

    expect(gate.scoreTopics(tie).map((one) => one.id)).toEqual(['b', 'a']);
    expect(gate.scoreTopics([...tie].reverse()).map((one) => one.id)).toEqual([
      'b',
      'a',
    ]);
  });
});
