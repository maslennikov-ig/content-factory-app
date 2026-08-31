'use strict';

/**
 * The factorial design, and the one way it fails silently.
 *
 * Every paid run so far compared the whole voice block against no voice block
 * and found nothing: 0.637 from the author with no voice, 0.644 with all of it.
 * That answer is unusable, because the block does two different jobs at once —
 * it describes the manner in adjectives and it shows the manner by quoting the
 * author — and a null result over both of them says nothing about either.
 *
 * Splitting them is only worth 96 model calls if the variants really differ in
 * the prompt. A `shape` that dropped nothing, or dropped everything, would
 * produce a table of six columns that looks like an experiment and is one
 * variant repeated, so the properties held here are: each variant keeps what it
 * claims to keep, drops what it claims to drop, and no two of them narrow to
 * the same voice.
 */

const variants = require('../scripts/evidence/voice-eval/variants.cjs');
const { voiceInstructionLines } = require('../tests/helpers/load-tsx.cjs').loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);

/** A voice with every group populated, so a dropped group is visible. */
const FULL = {
  persona: {
    kind: 'PERSON',
    portrait:
      'Он ведёт участок и пишет о том, что сам чинил на этой неделе. Считает ' +
      'очевидным, что цифру без прогона показывать нельзя. Раздражается на ' +
      'слово «синергия» и говорит вместо него, что именно сломалось.',
  },
  pointOfView: 'first_person',
  formality: 'conversational',
  traits: [{ name: 'манера', guidance: 'говорит коротко и по делу' }],
  sentenceStyle: 'короткие фразы, редкие длинные',
  ctaStyle: 'зовёт попробовать, не давит',
  emojiPolicy: 'restrained',
  hashtagPolicy: 'none',
  lexicon: { preferred: [{ term: 'прогон' }], avoid: [{ term: 'решение' }] },
  project: { name: 'Стенд', audiences: [{ need: 'инженеры, которые сами меряют' }] },
  guardrails: { prohibitedTopics: ['прогнозы курса'] },
  examples: [{ kind: 'on_brand', text: 'Сел считать руками, потому что глазами такое не ловится.' }],
  postLength: { median: 823, low: 500, high: 1200 },
  directions: [
    {
      metric: 'shortSentences',
      band: 'far-above',
      text: 'Часто рубит фразу совсем коротко — намного сильнее, чем у обычного поста',
      detail: '36.4 % фраз короче восьми слов',
    },
  ],
};

const shapeOf = (id) => {
  const variant = variants.byId(id);
  return variant.shape ? variant.shape(FULL) : FULL;
};

describe('варианты факторного прогона', () => {
  it('в наборе восемь, и три обязательных внутри', () => {
    expect(variants.FACTORIAL).toHaveLength(8);
    variants.MANDATORY.forEach((id) =>
      expect(variants.FACTORIAL).toContain(id)
    );
  });

  it('портрет мерится сам по себе и как добавка ко всему остальному', () => {
    const alone = shapeOf('portrait');
    const without = shapeOf('no-portrait');

    expect(alone.persona.portrait).toBeDefined();
    expect(alone.pointOfView).toBeUndefined();
    expect(alone.examples).toBeUndefined();

    expect(without.persona).toBeUndefined();
    expect(without.pointOfView).toBe('first_person');
    expect(without.examples).toHaveLength(1);
  });

  it('портрет не входит в «описания»: это не длинное прилагательное', () => {
    expect(shapeOf('describe').persona).toBeUndefined();
    expect(shapeOf('show').persona).toBeUndefined();
  });

  it('прогон без базовой линии не собирается', () => {
    expect(() => variants.resolve(['product', 'describe', 'show'])).toThrow(
      /mandatory/u
    );
  });

  it('«описания» несут манеру и ни одного примера', () => {
    const voice = shapeOf('describe');

    expect(voice.pointOfView).toBe('first_person');
    expect(voice.sentenceStyle).toBeDefined();
    expect(voice.lexicon).toBeDefined();
    expect(voice.examples).toBeUndefined();
    expect(voice.postLength).toBeUndefined();
  });

  it('«показ» несёт примеры и длину и ни одного описания', () => {
    const voice = shapeOf('show');

    expect(voice.examples).toHaveLength(1);
    expect(voice.postLength.median).toBe(823);
    expect(voice.pointOfView).toBeUndefined();
    expect(voice.sentenceStyle).toBeUndefined();
    expect(voice.lexicon).toBeUndefined();
  });

  it('«примеры» отличаются от «показа» ровно длиной', () => {
    const show = shapeOf('show');
    const examples = shapeOf('examples');

    expect(examples.examples).toEqual(show.examples);
    expect(examples.postLength).toBeUndefined();
  });

  it('ограничения остаются везде: опыт идёт над манерой, а не над безопасностью', () => {
    for (const id of ['describe', 'show', 'examples']) {
      expect(shapeOf(id).guardrails.prohibitedTopics).toEqual(['прогнозы курса']);
    }
  });
});

describe('прогон, на который профиль не может ответить, не оплачивается', () => {
  const { assertVariantsCanBeAnswered } = require('../scripts/evidence/voice-eval/generate.cjs');
  const six = variants.resolve(variants.FACTORIAL);

  it('профиль без примеров останавливает прогон до первого вызова', () => {
    const { examples, ...withoutExamples } = FULL;

    expect(() => assertVariantsCanBeAnswered(six, withoutExamples)).toThrow(
      /examples/u
    );
  });

  it('профиль без длины останавливает «show»', () => {
    const { postLength, ...withoutLength } = FULL;

    expect(() => assertVariantsCanBeAnswered(six, withoutLength)).toThrow(
      /postLength/u
    );
  });

  it('профиль без портрета останавливает прогон о портрете', () => {
    const { persona, ...withoutPortrait } = FULL;

    expect(() => assertVariantsCanBeAnswered(six, withoutPortrait)).toThrow(
      /persona\.portrait/u
    );
  });

  it('прежние три варианта эти поля не требуют', () => {
    const three = variants.resolve(variants.MANDATORY);

    expect(() => assertVariantsCanBeAnswered(three, {})).not.toThrow();
  });

  it('полный профиль проходит', () => {
    expect(() => assertVariantsCanBeAnswered(six, FULL)).not.toThrow();
  });

  /**
   * Найдено 26.08.2026 перед платным прогоном волны четыре.
   *
   * Отказ был написан по списку имён вариантов — `show`, `examples`,
   * `portrait`, — а `avatar` добавлен позже и стоит сразу на двух этих полях.
   * Прогон `none,legacy,product,avatar` против профиля без портрета выродил бы
   * `avatar` в базовую линию и отчитался бы разницей как находкой, то есть
   * ровно тем, ради чего отказ и написан. Теперь требования берутся у самой
   * формы варианта, а не у списка рядом с ней.
   */
  it('аватар держит длину числом и не держит её строкой', () => {
    /**
     * Прогон `owner-2026-08-26-a`: вариант выбрасывал `postLength` целиком, и
     * медиана вышла 3450 знаков против 823 у автора — длиннее, чем без голоса
     * (2432). Одно поле кормит четыре вещи, и три из них не инструкции.
     */
    const shaped = variants.byId('avatar').shape({
      persona: FULL.persona,
      examples: FULL.examples,
      postLength: FULL.postLength,
      guardrails: FULL.guardrails,
      pointOfView: 'first_person',
    });

    expect(shaped.postLength).toMatchObject({
      median: FULL.postLength.median,
      stated: false,
    });
    expect(voiceInstructionLines(shaped).join('\n')).not.toContain(
      String(FULL.postLength.median)
    );
  });

  it('вариант аватара требует и портрет, и примеры', () => {
    const wave = variants.resolve(['none', 'legacy', 'product', 'avatar']);
    const { persona, ...withoutPortrait } = FULL;
    const { examples, ...withoutExamples } = FULL;

    expect(() => assertVariantsCanBeAnswered(wave, withoutPortrait)).toThrow(
      /persona\.portrait/u
    );
    expect(() => assertVariantsCanBeAnswered(wave, withoutExamples)).toThrow(
      /examples/u
    );
    expect(() => assertVariantsCanBeAnswered(wave, FULL)).not.toThrow();
  });

  it('вариант, стоящий на несущем поле, без него прогон не пропускает', () => {
    /**
     * Иначе новый вариант снова тихо выпадет из отказа, как выпал `avatar`.
     * Список несущих полей берётся из самого отказа, а не переписывается сюда:
     * копия списка разошлась бы с кодом ровно тем же способом.
     */
    const { LOAD_BEARING } = require('../scripts/evidence/voice-eval/generate.cjs');
    const probe = Object.fromEntries(
      Object.keys(LOAD_BEARING).map((field) => [field, true])
    );
    const bare = { guardrails: FULL.guardrails };
    const checked = [];

    // `product` и `legacy` формы не имеют вовсе: первый берёт голос целиком,
    // второй читается из закреплённого коммита. Выродиться в базовую линию им
    // не от чего, и отказ их не касается — ни в коде, ни здесь.
    const shaped = variants.BUILT_IN.filter(
      (one) => one.withProfile && typeof one.shape === 'function'
    );

    shaped.forEach((variant) => {
      const rests = Object.keys(variant.shape(probe)).filter(
        (field) => LOAD_BEARING[field]
      );
      if (!rests.length) return;
      checked.push(variant.id);
      expect(() =>
        assertVariantsCanBeAnswered(
          variants.resolve([...variants.MANDATORY, variant.id]),
          bare
        )
      ).toThrow();
    });

    expect(checked).toContain('avatar');
  });

  it('«описания» ни на одно несущее поле не встают и прогон не держат', () => {
    // Прилагательные читаются из полей, которые есть у любого голоса, поэтому
    // отказ о них молчит — и это не пробел, а верный ответ.
    const three = variants.resolve([...variants.MANDATORY, 'describe']);

    expect(() =>
      assertVariantsCanBeAnswered(three, { guardrails: FULL.guardrails })
    ).not.toThrow();
  });
});

describe('варианты доходят до промпта разными', () => {
  /**
   * The check that matters, done on the real builder rather than on the shape:
   * `voiceInstructionLines` is what turns a voice into the lines the model
   * reads, and it is where a field that survived narrowing would show up.
   */
  const linesOf = (id) => voiceInstructionLines(shapeOf(id));

  /**
   * `legacy` and `pre-avatar` are deliberately outside this check. Neither
   * narrows anything — each is the *same* voice handed to the generator of a
   * pinned commit, and what differs is the code that receives it. Demanding a
   * different block from them would be demanding that a historical variant stop
   * being historical.
   */
  const PINNED = ['none', 'legacy', 'pre-avatar'];
  const NARROWING = variants.FACTORIAL.filter((id) => !PINNED.includes(id));

  it('ни два варианта не дают одинаковый блок', () => {
    const blocks = NARROWING.map((id) => linesOf(id).join('\n'));

    expect(blocks).toHaveLength(5);
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it('исторические варианты отличаются кодом, а не голосом', () => {
    expect(variants.byId('legacy').ref).toBe(variants.LEGACY_REF);
    expect(variants.byId('legacy').shape).toBeUndefined();
    expect(linesOf('legacy')).toEqual(linesOf('product'));

    // Блок «портрет и прилагательные вместе» рабочее дерево больше не строит:
    // при портрете оно печатает человека, а прилагательные не печатает вовсе.
    expect(variants.byId('pre-avatar').ref).toBe(variants.PRE_AVATAR_REF);
    expect(variants.byId('pre-avatar').shape).toBeUndefined();
  });

  /**
   * Вычитания переписаны 26.08.2026 вместе с подменой: `product` — это аватар,
   * и прежние пары считали бы прилагательные внутри блока, в котором их нет.
   */
  it('вычитание считает то, ради чего прогон и платный', () => {
    const product = linesOf('product');
    const portrait = linesOf('portrait');
    const examples = linesOf('examples');

    // product − portrait: строки, которые приносят собственные тексты автора.
    const showing = product.filter((one) => !portrait.includes(one));
    expect(showing.some((one) => one.includes('This is them writing'))).toBe(true);

    // product − examples: строка, которая приносит человека.
    const being = product.filter((one) => !examples.includes(one));
    expect(being.some((one) => one.includes('You are writing as this person'))).toBe(
      true
    );

    // И ни одного прилагательного ни в той, ни в другой разнице.
    for (const described of ['They write as "I"', 'The rhythm they write in']) {
      expect(product.some((one) => one.includes(described))).toBe(false);
    }
  });

  /**
   * `avatar` и `product` сошлись после подмены, и это утверждение, а не
   * совпадение: `avatar` подаёт графу голос, в котором прилагательных нет, а
   * `product` подаёт голос, в котором они есть и который их не печатает. День,
   * когда блоки разойдутся, — это день, когда описание вернулось в промпт.
   */
  it('аватар и продукт дают один и тот же блок', () => {
    expect(linesOf('avatar')).toEqual(linesOf('product'));
  });

  it('«примеры» короче «показа» ровно на строку длины', () => {
    const show = linesOf('show');
    const examples = linesOf('examples');

    expect(show.length - examples.length).toBe(1);
    expect(show.filter((one) => !examples.includes(one))).toEqual([
      expect.stringContaining('Their posts run about'),
    ]);
  });
});

/**
 * Directions are a third device, and the reason they are not shipped yet.
 *
 * `pl1.20` priced the adjectives at zero on all four rulers. A direction rests
 * on a number and says how far from an ordinary post a habit sits, which is a
 * different kind of statement — but «different» is not «better», and the epic
 * has been burned once already by a device that was obviously right and
 * measured at nothing. So the block carries them only where a variant asks
 * for them, and the default is untouched until a run says otherwise.
 */
describe('направления живут вариантом, а не подменяют блок', () => {
  it('«направления» несут измеренные строки и ни одного прилагательного', () => {
    const voice = shapeOf('directions');

    expect(voice.directions).toHaveLength(1);
    expect(voice.pointOfView).toBeUndefined();
    expect(voice.sentenceStyle).toBeUndefined();
    expect(voice.traits).toBeUndefined();
    // Портрет, примеры и длина остаются: вопрос варианта — прилагательные
    // против направлений, а не всё против всего.
    expect(voice.persona).toBeDefined();
    expect(voice.examples).toHaveLength(1);
    expect(voice.postLength).toBeDefined();
  });

  it('«одни направления» меряют их в одиночку', () => {
    const voice = shapeOf('only-directions');

    expect(voice.directions).toHaveLength(1);
    expect(voice.persona).toBeUndefined();
    expect(voice.examples).toBeUndefined();
    expect(voice.postLength).toBeUndefined();
  });

  it('ни один прежний вариант направлений не получил', () => {
    for (const id of ['describe', 'show', 'examples', 'portrait', 'no-portrait']) {
      expect(shapeOf(id).directions).toBeUndefined();
    }
  });

  /**
   * Строка направления доходит до промпта там, где блок вообще описывает
   * манеру, — то есть у голоса без портрета. С портретом рабочее дерево
   * печатает человека и не печатает наблюдений, поэтому сам вариант
   * `directions` с 26.08.2026 пинится к дереву до подмены: иначе он молча стал
   * бы `product`, и оплаченный прогон сравнил бы вещь с собой.
   */
  it('строка направления доходит до промпта вместе с сырым числом', () => {
    const { persona, ...withoutPortrait } = shapeOf('directions');
    const lines = voiceInstructionLines(withoutPortrait);
    const said = lines.find((line) => line.includes('рубит фразу'));

    expect(said).toBeDefined();
    // Сырое число едет рядом: направление без него — это то же прилагательное.
    expect(said).toContain('36.4 % фраз короче восьми слов');
  });

  it('вариант направлений пинится к дереву, которое их печатает', () => {
    expect(variants.byId('directions').ref).toBe(variants.PRE_AVATAR_REF);
  });

  it('в сегодняшнем блоке направления не печатаются вовсе', () => {
    const withoutField = { ...FULL };
    delete withoutField.directions;

    expect(voiceInstructionLines(FULL)).toEqual(
      voiceInstructionLines(withoutField)
    );
  });
});

/**
 * The avatar, and the owner's instruction behind it.
 *
 * «Нельзя загонять модель в жёсткие рамки. Важно, чтобы был просто аватар,
 * которым она представляется» — 2026-08-25. The measurements had said it
 * twice already without anybody drawing the conclusion: the adjectives earn
 * zero on all four rulers, and the measured directions overshoot to 117–134%
 * of the gap, which is generation sitting closer to the author's centre than
 * his own posts do. A rule executed evenly compresses a person onto their
 * average.
 *
 * What is held here is that the variant really is free of rules — and that
 * the guardrails are not one of them.
 */
describe('аватар — это человек, а не свод правил', () => {
  it('несёт портрет и его собственные тексты, и ничего о манере', () => {
    const voice = shapeOf('avatar');

    expect(voice.persona.portrait).toBeDefined();
    expect(voice.examples).toHaveLength(1);
    for (const rule of [
      'pointOfView',
      'formality',
      'traits',
      'sentenceStyle',
      'ctaStyle',
      'emojiPolicy',
      'hashtagPolicy',
      'lexicon',
      'project',
      'directions',
    ]) {
      expect(voice[rule]).toBeUndefined();
    }

    /**
     * Длина — единственное правило, которое проверяется не отсутствием поля.
     *
     * До 26.08.2026 здесь стояло `expect(voice.postLength).toBeUndefined()`, и
     * это было верным способом спросить неверную вещь. Правило варианта — «ни
     * одной строки о манере в промпте», а не «ни одного числа в голосе»:
     * `postLength` кормит ещё потолок токенов, детерминированную подрезку и
     * подавление унаследованного «Post should be long». Убрав поле, вариант
     * снимал три проверки ради одной строки и получал 3450 знаков против 823 у
     * автора. Спрашивается теперь то же самое правило у промпта.
     */
    expect(voice.postLength).toBeDefined();
    const lines = voiceInstructionLines(voice).join('\n');
    expect(lines).not.toContain('Match that length');
    expect(lines).not.toContain(String(FULL.postLength.median));
  });

  it('ограничения остаются: это не манера, а что пространству можно печатать', () => {
    expect(shapeOf('avatar').guardrails).toBeDefined();
  });

  it('без единого правила блок не объясняет, чем правило крыть', () => {
    // Строка «это описание, а не свод правил» разрешает спор наблюдения с
    // человеком. Спорить не с чем — и она вводила бы его же цитаты как
    // описание самих себя.
    const lines = voiceInstructionLines(shapeOf('avatar'));

    expect(lines.some((line) => line.includes('not a rulebook'))).toBe(false);
    expect(lines[0]).toContain('You are writing as this person');
    expect(lines[1]).toContain('This is them writing');
  });

  /**
   * Строки «это описание, а не свод правил» больше нет ни в одном блоке: она
   * разрешала спор наблюдения с человеком, а с 26.08.2026 наблюдения и человек
   * в одном блоке не встречаются. У голоса без портрета спорить не с кем, у
   * голоса с портретом нет наблюдений.
   */
  it('спор наблюдения с человеком больше негде завести', () => {
    for (const id of ['product', 'avatar', 'describe', 'no-portrait']) {
      const lines = voiceInstructionLines(shapeOf(id));

      expect(lines.some((line) => line.includes('not a rulebook'))).toBe(false);
    }
  });
});
