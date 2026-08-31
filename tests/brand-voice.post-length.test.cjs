'use strict';

/**
 * Length: the author's own range, a check outside the model, one edit.
 *
 * The owner writes 823 characters; the product produced 1800–2944 and told
 * every model «Post should be long» whoever it was writing as. Both answers of
 * the research say the same thing about why an instruction alone cannot fix
 * that — the tokenizer works in sub-words, so there is nothing to count
 * characters with — and both arrive at the same scheme: draft, deterministic
 * check, at most one surgical edit.
 *
 * The edit is the part that needs guarding. A general "shorten to N" comes back
 * as a summary in the model's own register, which is the voice gone. So the
 * judgement below refuses a proposal that lost a number, that is not actually
 * shorter, that fell under the author's own floor, or that shares too few words
 * with what it claims to have trimmed.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const postLength = loadTypeScriptModule(`${base}/post-length.ts`);
const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);

const RANGE = { median: 823, low: 520, high: 1180 };

const POST =
  'Сел разбирать прогон и посчитал руками, потому что глазами такое не ловится. ' +
  'Вышло хуже, чем я ждал: разница 0,057 не держится между прогонами. ' +
  'Записал сюда, чтобы не забыть, — своей памяти я в этом месте уже не верю. ' +
  'Ссылка на таблицу: https://example.org/table и там же лежат все 24 замера.';

describe('проверка длины стоит вне модели', () => {
  it('текст внутри диапазона так и назван', () => {
    const check = postLength.checkPostLength('x'.repeat(800), RANGE);

    expect(check.placement).toBe('inside');
    expect(check.overBy).toBe(0);
    expect(check.characters).toBe(800);
  });

  it('короткий и длинный различаются, а не сваливаются в «не так»', () => {
    expect(postLength.checkPostLength('x'.repeat(200), RANGE).placement).toBe(
      'below'
    );
    expect(postLength.checkPostLength('x'.repeat(2000), RANGE).placement).toBe(
      'above'
    );
  });

  /**
   * Потолок выше верхней границы на четверть: исследование прямо говорит, что
   * последние проценты точности длины стоят дороже естественности ритма, и
   * платный вызов ради одиннадцати знаков не покупает ничего.
   */
  it('одна правка не запускается из-за десятка знаков сверх', () => {
    const barely = postLength.checkPostLength('x'.repeat(1200), RANGE);

    expect(barely.placement).toBe('above');
    expect(barely.overBy).toBe(0);
  });

  it('вдвое длиннее — это превышение с числом', () => {
    const twice = postLength.checkPostLength('x'.repeat(2400), RANGE);

    expect(twice.overBy).toBe(2400 - twice.ceiling);
    expect(twice.ceiling).toBe(1475);
  });

  it('без измеренной длины проверки нет вовсе', () => {
    expect(postLength.checkPostLength(POST, null)).toBeNull();
    expect(postLength.checkPostLength(POST, { median: 0 })).toBeNull();
  });
});

describe('одна правка называет, что сохранить', () => {
  const check = postLength.checkPostLength(POST.repeat(3), RANGE);
  const prompt = postLength.buildLengthTrimPrompt({
    text: POST.repeat(3),
    check,
    locale: 'ru',
  });

  it('это удаление лишнего, а не пересказ', () => {
    expect(prompt).toMatch(/УБИРАЯ лишнее, а не пересказывая/u);
    expect(prompt).toMatch(/Ни одного нового слова от себя/u);
  });

  it('числа и ссылки перечислены дословно', () => {
    expect(prompt).toContain('СОХРАНИТЬ ДОСЛОВНО');
    expect(prompt).toContain('https://example.org/table');
  });

  it('цель по длине — диапазон автора, а не круглое число', () => {
    expect(prompt).toContain('823');
    expect(prompt).toContain('520');
    expect(prompt).toContain('1180');
  });
});

describe('правку принимают только если она правка', () => {
  const long = POST.repeat(5);
  const check = postLength.checkPostLength(long, RANGE);

  it('короче и с теми же числами — принято', () => {
    const trimmed = POST.repeat(2);
    const keep = postLength
      .protectedFragments(long)
      .filter((one) => trimmed.includes(one));

    expect(postLength.judgeLengthTrim(long, trimmed, check, keep).ok).toBe(true);
  });

  it('потерянное число — отказ', () => {
    const withoutNumber = POST.replace('0,057', 'разница').slice(0, 700);

    expect(
      postLength.judgeLengthTrim(long, withoutNumber, check, ['0,057']).reason
    ).toBe('FRAGMENT_LOST');
  });

  it('не стало короче — отказ', () => {
    expect(
      postLength.judgeLengthTrim(long, `${long} ещё немного`, check, []).reason
    ).toBe('NOT_SHORTER');
  });

  it('ушло ниже собственного пола автора — отказ', () => {
    expect(
      postLength.judgeLengthTrim(long, 'Померил. Не держится.', check, []).reason
    ).toBe('TOO_SHORT');
  });

  it('пересказ своими словами — отказ', () => {
    // Длиннее нижней границы автора: иначе отказ пришёл бы за длину и ничего
    // не сказал бы о переписывании.
    const retold =
      'Автор провёл измерение показателей и зафиксировал отсутствие устойчивости результата между отдельными итерациями эксперимента, о чём составил соответствующую заметку для последующего обращения, поскольку полагаться исключительно на собственную память представляется нецелесообразным. ' +
      'Дополнительно отмечается, что соответствующие сведения размещены в отдельном документе, доступ к которому обеспечивается по указанному адресу, а совокупное количество выполненных наблюдений составляет двадцать четыре единицы. ' +
      'Приведённые обстоятельства позволяют констатировать необходимость проведения дополнительной серии измерений с последующим сопоставлением полученных значений между собой.';

    expect(postLength.judgeLengthTrim(long, retold, check, []).reason).toBe(
      'REWRITTEN'
    );
  });
});

describe('диапазон автора доходит до промпта', () => {
  it('строка длины называет и медиану, и границы', () => {
    const line = directives.lengthDirective(RANGE);

    expect(line).toContain('823');
    expect(line).toContain('520');
    expect(line).toContain('1180');
    expect(line).toMatch(/Do not pad/u);
  });

  it('без измеренной длины строки нет', () => {
    expect(directives.lengthDirective(undefined)).toBeNull();
    expect(directives.lengthDirective({ median: 0 })).toBeNull();
  });

  it('строка стоит среди указаний голоса', () => {
    const lines = directives.voiceInstructionLines({
      pointOfView: 'first_person',
      postLength: RANGE,
    });

    expect(lines.some((one) => one.includes('823'))).toBe(true);
  });
});

/**
 * The check moved to the whole post (`trimToAuthorLength` now measures
 * `[hook, content].join('\n\n')`), but the judge and the trim prompt kept
 * reading `check.range` — the author's *whole-post* corridor — while they
 * only ever see `content`. A perfectly fine trim, one that already brings
 * hook+content back inside the author's range, was refused as `TOO_SHORT`
 * because `content` alone sits under the whole's floor, and the trim prompt
 * told the model to aim for the whole post's numbers while showing it only
 * the content to edit.
 *
 * `contentBudget` is the same corridor with whatever sits beside the content
 * (the hook, plus the join separator) subtracted — named in the type rather
 * than recomputed ad hoc at each call site, so the next caller cannot repeat
 * this by reaching for `range` out of habit. It equals `range` exactly when
 * nothing is fixed beside the content (`fixedLength` defaults to 0), so every
 * existing content-only call above is unaffected.
 */
describe('судья и промпт подрезки видят бюджет контента, а не диапазон целого поста', () => {
  const HOOK =
    'Каждую неделю сначала выбираю одну задачу, которая правда сдвинет дело, а не то, что просто кажется срочным. ';
  const fixedLength = HOOK.length + 2; // тот же разделитель, что `[hook, content].join('\n\n')`
  const original = POST.repeat(5);
  const whole = [HOOK, original].join('\n\n');
  const check = postLength.checkPostLength(whole, RANGE, fixedLength);

  it('правка всё ещё срабатывает по целому', () => {
    expect(check.overBy).toBeGreaterThan(0);
  });

  it('бюджет контента — диапазон автора минус хук с разделителем, а не сам диапазон', () => {
    expect(check.contentBudget).toEqual({
      median: RANGE.median - fixedLength,
      low: RANGE.low - fixedLength,
      high: RANGE.high - fixedLength,
    });
  });

  it('без хука (fixedLength не передан) бюджет — это сам диапазон', () => {
    const contentOnly = postLength.checkPostLength(original, RANGE);
    expect(contentOnly.contentBudget).toEqual(RANGE);
  });

  it('предложение, из-за которого целое уже внутри диапазона, судья больше не бракует как TOO_SHORT', () => {
    // Хук 113 знаков + это предложение уже даёт целое выше нижней границы
    // автора (520), но сам контент — ниже неё. Старый судья сравнивал именно
    // контент с границей целого и отвергал такую правку.
    const proposal = original.slice(0, RANGE.low - fixedLength + 20);
    expect(proposal.length).toBeLessThan(RANGE.low);
    expect(HOOK.length + 2 + proposal.length).toBeGreaterThan(RANGE.low);

    expect(postLength.judgeLengthTrim(original, proposal, check, [])).toEqual({
      ok: true,
    });
  });

  it('цель по длине в промпте — бюджет контента, а не диапазон целого поста', () => {
    const prompt = postLength.buildLengthTrimPrompt({
      text: original,
      check,
      locale: 'ru',
    });

    expect(prompt).toContain(`${check.contentBudget.median}`);
    expect(prompt).toContain(`${check.contentBudget.low}`);
    expect(prompt).toContain(`${check.contentBudget.high}`);
    expect(prompt).not.toContain(`около ${RANGE.median} знаков`);
  });

  it('«сейчас» в промпте — длина контента, а не длина целого поста', () => {
    const prompt = postLength.buildLengthTrimPrompt({
      text: original,
      check,
      locale: 'ru',
    });

    expect(prompt).toContain(`Сейчас ${original.trim().length}.`);
    expect(prompt).not.toContain(`Сейчас ${check.characters}.`);
  });
});
