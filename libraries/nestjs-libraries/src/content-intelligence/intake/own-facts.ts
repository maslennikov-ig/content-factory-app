import type { PieceFactV2 } from '../pieces/piece-facts.v2';
import { authorNumbersIn, editorialAnswerText } from '../pieces/core-write';
import { normalizeForMatch, numbersIn } from './research-digest';
import { contentFromIntent } from './intake-content';

/**
 * Числа человека становятся строками опор, даже когда модель их не выписала
 * (`content-factory-next-97dq.1`, живые прогоны 18.09.2026).
 *
 * Один и тот же вход в 170 знаков трижды дал три разных ответа заполнения
 * брифа: три атомарные строки, ОДНУ склеенную с припиской «Автор утверждает,
 * что…» и ни одной строки вовсе. Последний случай самый дорогой: проверять
 * стало нечего, сжатие выдумало четыре вердикта по несуществующим ключам, все
 * четыре были отброшены, и «25 тысяч», «десять лет» и «40%» доехали до сути
 * непроверенными при пустом `ungrounded`.
 *
 * Промпт `intake-brief-fill/v5` просит правильную форму, а этот файл её
 * добирает без второго вызова модели: приписка снимается, склеенная строка
 * делится по частям предложения, а число человека, которого нет ни в одной
 * строке, получает свою — из того предложения, где оно стоит.
 *
 * Детектор чисел один на продукт: `numbersIn` из сжатия ресерча и
 * `authorNumbersIn`/`editorialAnswerText` из сути. Третьего здесь нет
 * намеренно — разошедшиеся половины одного правила уже стоили этой волне
 * одного захода.
 *
 * Файл чистый: ни сети, ни модели, ни Nest.
 */

/** «Автор утверждает, что…» — это рамка пересказа, а не слова человека. */
const ATTRIBUTION = new RegExp(
  '^\\s*(?:' +
    'по\\s+словам\\s+автора|со\\s+слов\\s+автора|' +
    'автор\\s+(?:утверждает|пишет|говорит|считает|заявляет|указывает|отмечает)|' +
    'человек\\s+(?:утверждает|пишет|говорит)|' +
    'according\\s+to\\s+the\\s+author|' +
    'the\\s+author\\s+(?:claims|states|says|writes|argues|notes)' +
  ')\\s*[,:]?\\s*(?:что\\s+|that\\s+)?',
  'iu'
);

/** Границы предложений — те же, что у разбора вида входа. */
const SENTENCE_SPLIT = new RegExp('(?<=[.!?…])\\s+|\\n+', 'u');

/**
 * Границы частей одного предложения: запятая, точка с запятой и союз.
 *
 * Ровно те, которыми человек перечисляет: «охватил 25 тысяч человек и длился
 * десять лет, а производительность выросла на 40%».
 *
 * Запятая между цифрами границей НЕ является. «Конверсия выросла с 1,2% до 3%»
 * без этой оговорки распадалась на «Конверсия выросла с 1» и «2% до 3%», и в
 * квитанции появлялись числа, которых человек не писал, — а оттуда они уходили
 * в платную проверку как его утверждения.
 */
const CLAUSE_SPLIT = new RegExp(
  '(?<!\\d)\\s*[,;]\\s*(?!\\d)|\\s+(?:и|а|но|and|but)\\s+',
  'u'
);

/**
 * Слова-числа, по которым часть предложения всё ещё несёт проверяемое
 * утверждение: «длился десять лет» — строка опоры, «потом всё изменилось» — нет.
 *
 * Список закрытый и намеренно короткий: он решает ровно один вопрос — оставить
 * часть отдельной строкой или пришить её к соседней. Счёт самих чисел живёт в
 * `numbersIn` и остаётся цифровым.
 */
const NUMBER_WORDS = new RegExp(
  '(?:^|[^\\p{L}])(?:' +
    'дв(?:а|е|ух)|тр(?:и|ёх|ех)|четыр(?:е|ёх)|пят(?:ь|и)|шест(?:ь|и)|сем(?:ь|и)|' +
    'восьм(?:и)?|восемь|девят(?:ь|и)|десят(?:ь|и|ок)|одиннадцат|двенадцат|' +
    'двадцат|тридцат|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяност|' +
    'ст[оа]|двест|трист|четырест|полтор|половин|трет(?:ь|и)|четверт|' +
    'тысяч|миллион|миллиард|' +
    'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|' +
    'hundred|thousand|million|billion|half|quarter' +
  ')(?=$|[^\\p{L}])',
  'iu'
);

/** Сколько строк этот разбор вправе добавить сверх ответа модели. */
export const OWN_FACT_REBUILD_CAP = 8;

const capitalized = (value: string): string =>
  value ? value[0].toLocaleUpperCase() + value.slice(1) : value;

/**
 * Союз, оставшийся в начале части: «, а производительность…» после деления по
 * запятой начинается с «а», и строкой опоры это быть не может.
 */
const LEADING_CONJUNCTION = new RegExp('^(?:и|а|но|and|but)\\s+', 'iu');

/** Часть предложения, дочитанная до самостоятельной строки. */
const tidy = (value: string): string => {
  const text = value
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[-–—:;,]+\s*/u, '')
    .replace(LEADING_CONJUNCTION, '');
  if (!text) return '';
  return /[.!?…]$/u.test(text) ? capitalized(text) : `${capitalized(text)}.`;
};

export const stripAuthorAttribution = (statement: string): string => {
  const text = (statement || '').trim();
  return ATTRIBUTION.test(text) ? tidy(text.replace(ATTRIBUTION, '')) : text;
};

const wordCount = (value: string): number =>
  value.split(/\s+/u).filter((word) => /\p{L}|\p{Nd}/u.test(word)).length;

/** Несёт ли часть предложения число — цифрой или словом. */
const carriesNumber = (part: string): boolean =>
  numbersIn(part).length > 0 || NUMBER_WORDS.test(part);

/**
 * Предложение, разложенное по частям, — или оно само, когда разложить нечего.
 *
 * «Чисто» значит: частей больше одной и каждая сама по себе читается — не
 * меньше двух значащих слов. Не разложилось — строка возвращается дословно, не
 * тронутая даже точкой: переписанная формулировка разошлась бы с ключом строки
 * и с выбором человека. Честность такой строки держит правило поправки: у
 * строки с несколькими числами поправка не делает «подтверждено»
 * (`research-digest.correctionCoversStatement`).
 *
 * Часть без числа отдельной строкой не становится. «Мы работали десять лет,
 * потом всё изменилось, рост 40%» дало бы опору «Потом всё изменилось.» —
 * утверждение, которое человек не выдвигал и проверить нельзя. Такая часть
 * возвращается соседней: предыдущей, а до первой строки — следующей.
 */
export const splitOwnStatement = (statement: string): string[] => {
  const parts = statement
    .split(CLAUSE_SPLIT)
    .map((part) => (part || '').trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => wordCount(part) < 2)) {
    return [statement.trim()];
  }
  const merged: string[] = [];
  let pending = '';
  for (const part of parts) {
    const piece = pending ? `${pending}, ${part}` : part;
    pending = '';
    if (carriesNumber(part) || !merged.length) {
      if (carriesNumber(piece)) {
        merged.push(piece);
        continue;
      }
      pending = piece;
      continue;
    }
    merged[merged.length - 1] = `${merged[merged.length - 1]}, ${piece}`;
  }
  if (pending) {
    if (merged.length) merged[merged.length - 1] = `${merged[merged.length - 1]}, ${pending}`;
    else merged.push(pending);
  }
  return (merged.length < 2 ? [statement.trim()] : merged.map(tidy)).filter(Boolean);
};

const isOwn = (fact: PieceFactV2): boolean =>
  fact.kind === 'own' ||
  (!fact.kind && fact.origin === 'input' && !fact.evidenceId && !fact.factId);

const ownRow = (statement: string): PieceFactV2 => ({
  statement,
  sourceUrl: null,
  factId: null,
  evidenceId: null,
  origin: 'input',
  kind: 'own',
  status: 'unverified',
  verified: false,
});

/**
 * Строки опор после заполнения брифа: приписки сняты, склейки разложены,
 * пропущенные числа человека возвращены.
 *
 * `personText` — слова самого человека и только они: у вставленного чужого
 * поста числа принадлежат его автору, и строить из них «своё» нельзя. Вызывающий
 * передаёт пустую строку для всего, что не мысль.
 */
export const settleOwnFacts = (input: {
  facts: readonly PieceFactV2[];
  personText: string;
}): PieceFactV2[] => {
  const rows: PieceFactV2[] = [];
  for (const fact of input.facts) {
    if (!isOwn(fact)) {
      rows.push(fact);
      continue;
    }
    const statement = stripAuthorAttribution(fact.statement);
    const parts =
      numbersIn(statement).length > 1 ? splitOwnStatement(statement) : [statement];
    for (const part of parts) rows.push({ ...fact, statement: part });
  }

  /*
    Предложения режутся ДО того, как схлопнутся пробелы: список без точек в
    конце строк — обычная форма мысли, и `editorialAnswerText` сам по себе
    сделал бы из него одну строку опоры на весь список. Адрес и служебная
    фраза снимаются потом, с каждой строки отдельно.
  */
  const raw = contentFromIntent(input.personText || '');
  const text = editorialAnswerText(raw);
  if (!text || !authorNumbersIn(text, [])) return rows;

  // Число внутри адреса числом человека не является — ни в его словах, ни в
  // строке модели, которая этот адрес принесла.
  const covered = new Set(
    rows.filter(isOwn).flatMap((fact) => numbersIn(editorialAnswerText(fact.statement)))
  );
  const missing = numbersIn(text).filter((number) => !covered.has(number));
  if (!missing.length) return rows;

  const seen = new Set(rows.filter(isOwn).map((fact) => normalizeForMatch(fact.statement)));
  const added: PieceFactV2[] = [];
  for (const line of raw.split(SENTENCE_SPLIT)) {
    const sentence = editorialAnswerText(line);
    const sentenceNumbers = numbersIn(sentence);
    if (!sentenceNumbers.some((number) => missing.includes(number))) continue;
    const parts = (
      sentenceNumbers.length > 1 ? splitOwnStatement(sentence) : [sentence]
    ).map(tidy);
    for (const part of parts) {
      const key = normalizeForMatch(part);
      if (!part || seen.has(key)) continue;
      seen.add(key);
      added.push(ownRow(part));
      if (added.length >= OWN_FACT_REBUILD_CAP) return [...rows, ...added];
    }
  }
  return [...rows, ...added];
};
