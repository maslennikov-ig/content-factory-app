'use strict';

/**
 * What the author does with a post, as opposed to with a sentence.
 *
 * The eight scales all divide by a sentence or a paragraph, and the model was
 * handed nothing else. On the owner's real channel on 2026-08-24 it wrote
 * correctly about first person, lists, dashes and phrase length, and wrote
 * nothing about the two things a reader sees in the first line — that he
 * brings numbers he checked himself and that he sometimes opens by admitting
 * he was wrong. It could not: nothing counted either.
 *
 * These are heuristics and the tests hold them to being the heuristics they
 * claim, not to being classifiers. Where the rule is deliberately narrow — a
 * date is not a measurement, a call to action lives at the end or nowhere —
 * there is a case here saying so.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const pack = loadTypeScriptModule(`${base}/locale-pack.ru.ts`).RU_LOCALE_PACK;
const habits = loadTypeScriptModule(`${base}/post-habits.ts`);
const pipeline = loadTypeScriptModule(`${base}/assist.pipeline.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);

const post = (text) => ({ text });
const repeat = (text, count) => Array.from({ length: count }, () => post(text));

describe('the opening', () => {
  it('skips a heading and reads the first thing the author says', () => {
    const text = '🚀 "Обо мне и мой план"\n\nПривет! Я Игорь, и это моя первая статья.';
    expect(habits.opening(text, pack)).toContain('Привет');
  });

  it('is the first sentence when the post opens with one', () => {
    const text = 'Поставщика поменяли — старый срывал сроки. Новый возит по графику.';
    expect(habits.opening(text, pack)).toBe(
      'Поставщика поменяли — старый срывал сроки.'
    );
  });
});

describe('reading a corpus of posts', () => {
  it('says nothing at all below five posts', () => {
    expect(habits.computePostHabits(repeat('Короткий пост.', 4), pack)).toBeNull();
  });

  it('counts an opening that admits a mistake, and needs both halves', () => {
    const admits = habits.computePostHabits(
      [
        ...repeat(
          'Я ставил на DeepSeek V4 Pro. Если бы поставил — переплачивал бы весь год.',
          3
        ),
        ...repeat('Поставщика поменяли. Новый возит по графику.', 3),
      ],
      pack
    );
    expect(admits.counts.opensWithAdmission).toBe(3);
    expect(admits.opensWithAdmission).toBe(50);

    // A marker without a first person is somebody else's mistake, and a first
    // person without a marker is just a person talking about themselves.
    const neither = habits.computePostHabits(
      [
        ...repeat('Подрядчик ошибался три месяца подряд. Мы это разгребали.', 3),
        ...repeat('Я поменял поставщика. Новый возит по графику.', 3),
      ],
      pack
    );
    expect(neither.counts.opensWithAdmission).toBe(0);
  });

  it('counts an opening with a number and one with a question apart', () => {
    const measured = habits.computePostHabits(
      [
        ...repeat('89 баллов из 100. Вот как это считалось.', 2),
        ...repeat('Стоит ли платить за это? Разбираемся по порядку.', 2),
        ...repeat('Поставщика поменяли. Новый возит по графику.', 2),
      ],
      pack
    );
    expect(measured.counts.opensWithNumber).toBe(2);
    expect(measured.counts.opensWithQuestion).toBe(2);
  });

  it('finds a call to action only where one lives — at the end', () => {
    const atEnd = habits.computePostHabits(
      repeat('Мы поменяли поставщика. Пишите в комментарии, как у вас.', 6),
      pack
    );
    expect(atEnd.counts.endsWithCallToAction).toBe(6);

    const atStart = habits.computePostHabits(
      repeat(
        'Пишите в комментарии, если знаете. Дальше только про поставщика и сроки. Он возит из Челябинска, и это на два дня дольше.',
        6
      ),
      pack
    );
    expect(atStart.counts.endsWithCallToAction).toBe(0);
  });

  it('reads a figure beside a unit as a measurement and a bare year as not', () => {
    expect(
      habits.hasOwnMeasurement('Прогнал шесть релизов, дважды по 89 баллов.', pack)
    ).toBe(true);
    expect(habits.hasOwnMeasurement('Ответ пришёл за 120 мс.', pack)).toBe(true);
    expect(habits.hasOwnMeasurement('Это было в 2026 году в Москве.', pack)).toBe(
      false
    );
  });

  it('reports the usual length as a median, not as a mean', () => {
    const lengths = habits.computePostHabits(
      [
        ...repeat('а'.repeat(500), 5),
        post('б'.repeat(20_000)),
      ],
      pack
    );
    // One long post pulls a mean above every post that produced it, and
    // «обычная длина» has to be a length the author actually writes.
    expect(lengths.length.median).toBe(500);
    expect(lengths.length.shape).toBe('long-tail');
  });

  it('tells an emoji used as a bullet from one used as intonation', () => {
    const bullets = habits.computePostHabits(
      repeat('Что дальше:\n🔍 Найти узкое место.\n⚠️ Убрать штрафы.\n✨ Поставить цель.', 6),
      pack
    );
    expect(bullets.emoji.role).toBe('list-marker');

    const intonation = habits.computePostHabits(
      repeat('Мы догнали план 🙈 и это стоило субботней смены.', 6),
      pack
    );
    expect(intonation.emoji.role).toBe('intonation');

    const none = habits.computePostHabits(
      repeat('Мы догнали план. Смена отработала ровно.', 6),
      pack
    );
    expect(none.emoji.role).toBe('none');
    expect(none.emoji.perThousandChars).toBe(0);
  });

  it('gives the model a count beside every share', () => {
    const measured = habits.computePostHabits(
      repeat('89 баллов из 100. Вот как это считалось.', 5),
      pack
    );
    const rendered = habits.renderPostHabits(measured, 'ru');
    // «в 4 постах из 153» is a claim a reader can check; «3%» is a figure they
    // have to take on trust.
    expect(rendered).toContain('(5 из 5)');
    expect(rendered).toContain('постов разобрано: 5');
  });
});

describe('what the model is given', () => {
  const corpus = (count) =>
    Array.from({ length: count }, (unused, index) => ({
      code: `smp-${index}`,
      text:
        `Я думал, что успеем к четвергу ${index}. Не успели, и врать тут незачем. ` +
        'Прогнал шесть релизов через стенд, дважды по 89 баллов. Поставщика поменяли — старый ' +
        'срывал сроки третий месяц подряд, новый возит из Челябинска по графику. На складе стало ' +
        'спокойнее: остатки сходятся, отгрузки не переносим. Пишите в комментарии, как у вас.',
      language: 'ru',
      contentHash: `hash-${index}`,
    }));

  it('rides on the measurement and reaches the map prompt', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(14), { language: 'ru' });
    expect(measured.postHabits).toBeTruthy();

    const prompt = pipeline.mapPrompt(corpus(14)[0], measured, 'ru');
    // In the one METRICS list beside the eight scales, not under a heading of
    // its own: a separate section reads as background, and the model cited a
    // habit once in 168 observations while they lived under one.
    expect(prompt).toContain('начинает с признания своей ошибки');
    expect(prompt).toContain('обычная длина поста');
    expect(prompt.indexOf('sentenceLength')).toBeLessThan(
      prompt.indexOf('opensWithAdmission')
    );
    expect(prompt).not.toContain('ПРИВЫЧКИ ПОСТА');
  });

  it('lets an observation name a habit as the number it explains', () => {
    // Counting them was not enough. The first run against a real model put the
    // habits in the prompt and got 161 grounded observations back, nearly all
    // explaining one of the eight scales — because the schema only allowed one
    // of the eight to be named. A model told to cite a metric and handed eight
    // names cites one of the eight.
    const contract = loadTypeScriptModule(`${base}/assist.contract.ts`);
    const accepted = contract.observationSchema.parse({
      field: 'TONE',
      metric: 'carriesOwnMeasurement',
      quote: 'дважды по 89 баллов',
      claim: 'Автор приносит числа, которые проверил сам.',
    });
    expect(accepted.metric).toBe('carriesOwnMeasurement');

    // And the prompt shows the key, so the model has something to name.
    const measured = analyzer.analyzeBrandVoice(corpus(14), { language: 'ru' });
    expect(pipeline.mapPrompt(corpus(14)[0], measured, 'ru')).toContain(
      'carriesOwnMeasurement ·'
    );
  });

  it('says nothing where nothing was counted', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(14), { language: 'ru' });
    const prompt = pipeline.mapPrompt(
      corpus(1)[0],
      { ...measured, postHabits: null },
      'ru'
    );
    expect(prompt).not.toContain('обычная длина поста');
  });

  it('hands the corpus-level habits to the reduce step as well', () => {
    // A map observation explains one sample, and «41% постов заканчиваются
    // призывом» is not a fact about one sample. The reduce step is the only
    // place in the pipeline looking at the corpus whole.
    const measured = analyzer.analyzeBrandVoice(corpus(14), { language: 'ru' });
    const withHabits = pipeline.reducePrompt(
      [
        {
          ref: 'smp-0#1',
          sampleCode: 'smp-0',
          field: 'TONE',
          metric: 'sentenceLength',
          quote: 'Не успели, и врать тут незачем.',
          claim: 'Автор пишет короткими фразами.',
        },
      ],
      'ru',
      measured.postHabits
    );
    expect(withHabits).toContain('ПОСЧИТАНО ПО ВСЕМУ КОРПУСУ');
    expect(withHabits).toContain('endsWithCallToAction');
  });

  it('reads more of a large corpus than it used to', () => {
    // Twelve whatever the corpus was meant a channel of 153 posts was described
    // in words taken from twelve of them — eight per cent of the evidence.
    expect(pipeline.sampleLimitFor(153)).toBeGreaterThanOrEqual(25);
    expect(pipeline.sampleLimitFor(153)).toBeLessThanOrEqual(30);
    expect(pipeline.sampleLimitFor(45)).toBe(20);
    expect(pipeline.sampleLimitFor(12)).toBe(12);
  });

  it('still spreads the choice across the corpus rather than taking the head', () => {
    const chosen = pipeline.selectSamples(corpus(100), 28);
    expect(chosen).toHaveLength(28);
    expect(chosen[0].code).toBe('smp-0');
    expect(chosen[chosen.length - 1].code).not.toBe('smp-27');
  });
});
