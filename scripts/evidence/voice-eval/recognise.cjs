'use strict';

/**
 * Материал, на котором владелец отвечает «узнаю ли я себя» — приёмка `pl1.6`.
 *
 * ## Зачем отдельная команда
 *
 * Приёмка `pl1.6` требует прямого ответа человека, а не числа: описание,
 * собранное по норме, обязано читаться как описание его манеры. Прежний
 * материал собирался руками и не пережил рабочую копию — он намеренно не в
 * git, потому что состоит из собственных текстов автора. Команда собирает его
 * заново из того, что уже оплачено и сохранено.
 *
 * ## Что внутри
 *
 * Три части, и порядок важен. Сначала портрет и описание по норме — на них и
 * задаётся вопрос. Потом десять постов вперемешку: пять настоящих и пять
 * написанных продуктом под его голосом. Ключ — в конце, чтобы человек сначала
 * прочитал, а потом сверился.
 *
 * Настоящие посты берутся из ОТЛОЖЕННОЙ половины: посты, на которых профиль
 * строился, автор узнаёт по постройке, и такой ответ ничего не стоит.
 *
 * Порядок перемешивания детерминирован — он выводится из имени корпуса, а не
 * из часов. Иначе два запуска дают два разных ключа, и ответ, записанный по
 * одному, не сойдётся с материалом по другому.
 *
 * Ни одного вызова модели.
 */

const fs = require('fs');
const path = require('path');

const CUT_NOTE = 800;

/**
 * Перемешивание, повторяемое от запуска к запуску.
 *
 * `Math.random` здесь был бы дефектом, а не небрежностью: материал печатается
 * один раз, а ключ читается позже и отдельно.
 */
function seededOrder(count, seed) {
  let state = 0;
  for (const ch of seed) state = (state * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const order = [...Array(count).keys()];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Отбор постов, представляющих корпус, а не его хвост.
 *
 * Берётся середина по длине: самый короткий и самый длинный пост автора
 * рассказывают о нём меньше, чем обычный, а вопрос задаётся про обычное.
 */
function representative(texts, want) {
  const sorted = [...texts].sort((a, b) => a.length - b.length);
  const from = Math.max(0, Math.floor(sorted.length / 4));
  const to = Math.min(sorted.length, Math.ceil((3 * sorted.length) / 4));
  const band = sorted.slice(from, to);
  const source = band.length >= want ? band : sorted;
  const step = Math.max(1, Math.floor(source.length / want));
  const out = [];
  for (let i = 0; i < source.length && out.length < want; i += step) out.push(source[i]);
  return out;
}

function render({ corpusName, portrait, lines, mine, theirs }) {
  const items = [
    ...mine.map((text) => ({ text, origin: 'настоящий пост' })),
    ...theirs.map((text) => ({ text, origin: 'написано продуктом под вашим голосом' })),
  ];
  const order = seededOrder(items.length, corpusName);
  const shuffled = order.map((i) => items[i]);

  const out = [];
  out.push('# Узнаёте ли вы себя');
  out.push('');
  out.push('Материал для одного ответа владельца — приёмка `content-factory-next-pl1.6`.');
  out.push('Ни одного вызова модели при сборке: всё уже посчитано и оплачено раньше.');
  out.push('');
  out.push('## Часть 1. Портрет, который продукт держит о вас');
  out.push('');
  out.push(portrait ? portrait.trim() : '(портрета в действующей версии профиля нет)');
  out.push('');
  out.push('## Часть 2. Ваша манера, описанная относительно обычного поста');
  out.push('');
  out.push('Каждая строка — одно измерение. В скобках то же самое числом,');
  out.push('чтобы было что проверить.');
  out.push('');
  for (const line of lines) {
    out.push(`- ${line.text}`);
    out.push(`  (${line.detail})`);
  }
  out.push('');
  out.push('## Часть 3. Десять постов вперемешку');
  out.push('');
  out.push('Пять написаны вами, пять — продуктом под вашим голосом. Настоящие взяты из');
  out.push('отложенной половины корпуса: на них профиль не строился.');
  out.push(`Тексты показаны целиком; мерка сравнивает первые ${CUT_NOTE} знаков.`);
  out.push('');
  shuffled.forEach((item, index) => {
    out.push(`### № ${index + 1}`);
    out.push('');
    out.push(item.text.trim());
    out.push('');
  });
  out.push('## Вопросы, на которые нужен ответ');
  out.push('');
  out.push('1. Часть 1 и часть 2 — это описание вашей манеры? Да, нет, или что именно неверно.');
  out.push('2. Что в описании отсутствует, хотя вы считаете это главным в своей манере?');
  out.push('3. В части 3 — какие номера ваши. Разбирать не нужно, достаточно списка.');
  out.push('');
  out.push('## Ключ');
  out.push('');
  shuffled.forEach((item, index) => {
    out.push(`№ ${index + 1} — ${item.origin}`);
  });
  return `${out.join('\n')}\n`;
}

/**
 * @param {{
 *   corpusName: string,
 *   portrait: string | null,
 *   lines: Array<{ text: string, detail: string }>,
 *   holdoutTexts: string[],
 *   generatedTexts: string[],
 *   want?: number,
 * }} input
 */
function buildRecognitionMaterial(input) {
  const want = input.want ?? 5;
  if (input.holdoutTexts.length < want) {
    throw new Error(
      `корпус «${input.corpusName}»: отложенных постов ${input.holdoutTexts.length}, нужно ${want}`
    );
  }
  if (input.generatedTexts.length < want) {
    throw new Error(
      `корпус «${input.corpusName}»: генераций под голосом ${input.generatedTexts.length}, нужно ${want}`
    );
  }
  return render({
    corpusName: input.corpusName,
    portrait: input.portrait,
    lines: input.lines,
    mine: representative(input.holdoutTexts, want),
    theirs: representative(input.generatedTexts, want),
  });
}

function writeRecognitionMaterial(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

module.exports = {
  buildRecognitionMaterial,
  writeRecognitionMaterial,
  seededOrder,
  representative,
};
