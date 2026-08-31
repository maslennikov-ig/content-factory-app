'use strict';

/**
 * Что было бы, если эталоном были живые авторы, а не собственная генерация.
 *
 * ## Зачем этот замер
 *
 * Вопрос владельца 28.08.2026: «я же присылал реальные посты каждого, разве
 * этого недостаточно, чтобы сравнить». Половина ответа — да, достаточно, и они
 * уже так и работают: шеренга подставных с 27.08 собирается из настоящих
 * коротких текстов других авторов системы. Вторая половина — норма, против
 * которой автор ОПИСЫВАЕТСЯ, — до сих пор построена на собственной генерации
 * продукта без голоса. Решение владельца 25.08.2026, и причина у него была
 * лицензионная: готовых корпусов русской короткой формы с проверенными
 * условиями не нашлось, а чужих настоящих текстов тогда не было ни одного.
 *
 * Теперь их три канала. Значит, довод 25.08 больше не действует, и вопрос
 * решается замером, а не рассуждением.
 *
 * ## Как считается
 *
 * Норма собирается тем же `normStatOf`, что и продуктовая: медиана и MAD по
 * каждому измерению, посчитанному ПО ПОСТАМ. Отличие ровно одно — посты берутся
 * не из генерации, а из корпусов настоящих авторов.
 *
 * **Автора в его собственной норме нет.** Это не гигиена, а то же исправление,
 * которое эпик уже делал для шеренги: текст, участвовавший в постройке эталона,
 * сравнивается с собой, и расхождение уезжает вниз без единого признака
 * неисправности. Поэтому норма для каждого автора собирается из ОСТАЛЬНЫХ.
 *
 * ## Что этот замер не может
 *
 * Авторов три. Исключив описываемого, получаем норму из двух человек. Свод
 * исследования §2.3 просит от тридцати до пятидесяти на язык для устойчивых
 * перцентилей и от ста для надёжных. Два — это не популяция, и число отсюда
 * называется «не опровергнуто», а не «измерено». Замер отвечает ровно на один
 * вопрос: становится ли различение хотя бы направленно лучше.
 *
 * Ни одного вызова модели.
 */

const { loadTypeScriptModule } = require('../../../tests/helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const scales = loadTypeScriptModule(`${BASE}/style-scales.ts`);
const types = loadTypeScriptModule(`${BASE}/brand-voice.types.ts`);
const {
  normStatOf,
  deviationsForCorpus,
  MIN_NORM_POSTS,
  VOICE_NORM_VERSION,
} = loadTypeScriptModule(`${BASE}/voice-norm.ts`);
const { RU_LOCALE_PACK } = loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`);
const { normFor } = loadTypeScriptModule(`${BASE}/voice-norm.sets.ts`);

/**
 * Тот же класс символов, которым считают эмодзи норма, привычки поста и
 * `deviationsForCorpus`. Четвёртая копия — четвёртый шанс посчитать разное.
 */
const EMOJI = /\p{Extended_Pictographic}/gu;

const METRICS = [...types.STYLE_SCALE_KEYS, 'postLength', 'emojiRate'];

/** Норма из готовых текстов: медиана и MAD по каждому измерению, по постам. */
function normOfTexts(texts, pack, label) {
  const collected = new Map(METRICS.map((key) => [key, []]));
  for (const text of texts) {
    const body = String(text ?? '').trim();
    if (!body) continue;
    const measured = scales.measureSingleText(body, pack);
    for (const key of types.STYLE_SCALE_KEYS) {
      const value = measured[key];
      if (Number.isFinite(value)) collected.get(key).push(value);
    }
    collected.get('postLength').push(body.length);
    collected
      .get('emojiRate')
      .push((1000 * (body.match(EMOJI) ?? []).length) / Math.max(1, body.length));
  }
  const stats = {};
  for (const [key, values] of collected) {
    const stat = normStatOf(values);
    if (stat) stats[key] = stat;
  }
  return {
    version: `${VOICE_NORM_VERSION}+people/${label}`,
    locale: 'ru',
    posts: texts.length,
    source: label,
    stats,
  };
}

/** Сколько измерений различают пару авторов и какие именно. */
function pairsOf(placed) {
  const metrics = [
    ...new Set(placed.flatMap((one) => Object.keys(one.byMetric ?? {}))),
  ].sort();
  const pairs = [];
  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const differing = metrics.filter(
        (metric) =>
          (placed[left].byMetric?.[metric]?.band ?? 'absent') !==
          (placed[right].byMetric?.[metric]?.band ?? 'absent')
      );
      pairs.push({
        between: [placed[left].name, placed[right].name],
        differing: differing.length,
        of: metrics.length,
        metrics: differing,
      });
    }
  }
  return { metrics, pairs };
}

/**
 * @param corpora `{ name, samples }` — все, что есть в реестре на этом языке
 * @param cap потолок постов на автора. Корпуса разного размера: у одного тысяча
 *   постов, у другого сто двадцать пять, и норма без потолка описала бы
 *   большего из них. Берётся каждый k-й, а не первые k: начало канала — это его
 *   прошлое.
 */
function compareNorms(corpora, cap = 150) {
  const pack = RU_LOCALE_PACK;
  const thinned = corpora.map(({ name, samples }) => {
    const step = Math.max(1, Math.ceil(samples.length / cap));
    return {
      name,
      all: samples.map((one) => one.text),
      taken: samples
        .filter((unused, index) => index % step === 0)
        .map((one) => one.text),
    };
  });

  const shipped = normFor('ru');
  const onGeneration = thinned.map(({ name, all }) => ({
    name,
    ...(deviationsForCorpus(
      all.map((text) => ({ text })),
      pack,
      shipped
    ) ?? { byMetric: {} }),
  }));

  const onPeople = thinned.map(({ name, all }) => {
    /** Остальные авторы — и ни одного собственного текста. */
    const others = thinned
      .filter((one) => one.name !== name)
      .flatMap((one) => one.taken);
    const built = normOfTexts(others, pack, `без «${name}»`);
    return {
      name,
      reference: { posts: others.length, metrics: Object.keys(built.stats) },
      ...(deviationsForCorpus(
        all.map((text) => ({ text })),
        pack,
        built
      ) ?? { byMetric: {} }),
    };
  });

  return {
    minNormPosts: MIN_NORM_POSTS,
    authors: thinned.map((one) => ({
      name: one.name,
      posts: one.all.length,
      takenIntoNorm: one.taken.length,
    })),
    onGeneration: { placed: onGeneration, ...pairsOf(onGeneration) },
    onPeople: { placed: onPeople, ...pairsOf(onPeople) },
  };
}

const render = (report) => {
  const lines = [];
  lines.push(
    'эталон из генерации против эталона из живых авторов; автора в его ' +
      'собственной норме нет'
  );
  lines.push(
    'авторы: ' +
      report.authors
        .map((one) => `${one.name} (${one.posts}, в норму ${one.takenIntoNorm})`)
        .join(', ')
  );
  lines.push('');
  for (const [title, side] of [
    ['эталон — собственная генерация продукта (отгружено)', report.onGeneration],
    ['эталон — настоящие посты остальных авторов', report.onPeople],
  ]) {
    lines.push(title);
    for (const pair of side.pairs) {
      lines.push(
        `  ${pair.between.join(' / ')}: различают ${pair.differing} из ${
          pair.of
        }${pair.differing ? ` — ${pair.metrics.join(', ')}` : ''}`
      );
    }
    const total = side.pairs.reduce((sum, one) => sum + one.differing, 0);
    lines.push(`  всего различий по трём парам: ${total}`);
    lines.push('');
  }
  lines.push(
    `оговорка: авторов три, и после исключения описываемого норма стоит на двух.`
  );
  lines.push(
    'свод §2.3 просит тридцать-пятьдесят на язык. Число отсюда — «не опровергнуто».'
  );
  return lines.join('\n');
};

module.exports = { compareNorms, render, normOfTexts };
