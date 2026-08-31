'use strict';

/**
 * Чужие тексты для стенда: те, которых измеряемый автор не писал.
 *
 * Продукт берёт их из базы — `VoiceSampleRepository.foreignSamples`, — а стенд
 * из кэшей реестра, потому что `measure` обязан работать без базы. Дальше и там
 * и там одно и то же: `lineup.ts` строит из них шеренгу, `voice-calibration.ts`
 * снимает по ним порог. Арифметика здесь не повторяется намеренно — стенд
 * существует ровно для того, чтобы судить тем же, чем судит продукт.
 *
 * Зачем это понадобилось. До 27.08.2026 подставными были три файла
 * документации этого репозитория, одни и те же для всех. Подозреваемый пишет
 * посты в Telegram, а в шеренге стоят руководства по развёртыванию: у них
 * выигрывает почти любой текст, похожий на пост. Запас между потолком
 * (отложенные посты автора) и полом (генерация без голоса), замер 27.08.2026:
 *
 * | автор | документация | другие авторы |
 * | --- | --- | --- |
 * | owner, 153 поста | 57,2 | 51,4 |
 * | avetov, 1023 поста | 18,4 | 57,5 |
 * | britva, 125 постов | 16,1 | 59,0 |
 *
 * Разброс втрое схлопнулся в семь пунктов, и худший корпус перестал быть
 * худшим втрое.
 */

const fs = require('node:fs');
const path = require('node:path');

const cacheFile = (name) => path.join(__dirname, `corpus.${name}.json`);

const readCached = (name) => {
  const file = cacheFile(name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Тексты всех корпусов реестра того же языка, кроме измеряемого.
 *
 * @param cap потолок на число текстов. Триста: замер 27.08.2026 показал, что
 *   подставной, собранный с десяти текстов, разрежен настолько, что запас
 *   между потолком и полом падает вдвое — 26,8 пункта против 59,0 у худшего
 *   корпуса. Берётся каждый k-й, а не первые k:
 *   начало канала — это его прошлое, и шеренга, собранная на нём, стояла бы из
 *   того, как эти люди писали раньше.
 * @returns тексты и список корпусов, кэша которых не нашлось — вызывающий
 *   обязан о них сказать, иначе прогон молча посчитан на неполной шеренге и
 *   несравним с прежними
 */
function foreignTexts(name, registry, cap = 300) {
  const mine = registry[name];
  if (!mine) throw new Error(`unknown corpus "${name}"`);
  const mineCache = readCached(name);

  const others = Object.keys(registry)
    .filter((other) => other !== name)
    .filter((other) => registry[other].language === mine.language);

  const texts = [];
  const missing = [];
  const used = [];
  const perCorpus = Math.max(1, Math.floor(cap / Math.max(1, others.length)));

  for (const other of others) {
    const cached = readCached(other);
    if (!cached?.samples?.length) {
      missing.push(other);
      continue;
    }
    /**
     * Своим же корпусом не подставляется даже при совпадении имён в реестре.
     *
     * Реестр правит человек, и две записи под разными именами могут указывать
     * на одного аватара. Тогда автор оказался бы в собственной шеренге,
     * выиграть у себя он не может, и голосование поехало бы вниз без единого
     * признака неисправности.
     */
    if (
      cached.corpus?.avatarId &&
      mineCache?.corpus?.avatarId === cached.corpus.avatarId
    ) {
      continue;
    }
    const pool = cached.samples;
    const step = Math.max(1, Math.ceil(pool.length / perCorpus));
    let taken = 0;
    for (let index = 0; index < pool.length && taken < perCorpus; index += step) {
      texts.push(pool[index].text);
      taken += 1;
    }
    used.push(`${other}×${taken}`);
  }

  return { texts, missing, used };
}

module.exports = { foreignTexts };
