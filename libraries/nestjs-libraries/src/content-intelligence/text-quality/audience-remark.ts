/**
 * A sentence of the post about whom the post is for (W3 live walk
 * 28.09.2026, P3-E; narrowed by the correctness review of the fixes, F3).
 *
 * The piece's audience is a brief line — «Для кого этот текст?», answered by
 * the person or by «Решите за меня» — and the adaptation prompt reads it as
 * direction: «Written for (the model's proposal …)», «never quote them». The
 * walk's Telegram adaptation still carried it as a sentence of the post:
 * «Эта мысль адресована небольшим командам, которые решают, нужен ли им
 * отдельный человек…». A reader never needs to be told whom a post is for;
 * the sentence is the brief leaking into the text.
 *
 * Narrow on purpose — a remark is all three, at the start of its sentence:
 *
 * 1. the text itself as the subject («Эта мысль», «Этот пост», «This post»);
 * 2. a predicate of address: «адресован(а)», «предназначен(а) для»,
 *    «обращён(а) к», «написан(а) для»; «is/was addressed to», «aimed at»,
 *    «written/meant/intended for»;
 * 3. a group of people after it («небольшим командам», «для руководителей»,
 *    «for small teams», «at anyone who…»).
 *
 * So these stay (the review's must-keep list): «This post is for anyone who
 * has ever shipped on a Friday.» (a hook, like «Пост для тех, кто…»),
 * «Этот текст рассчитан на пять минут чтения.», «Эта мысль обращена в
 * будущее.», «Эта статья написана для журнала „Х“ в 2019 году.», «Мне
 * кажется, этот пост адресован не мне.» — and every sentence about the
 * reader's own situation.
 *
 * The author addressing a group (kcxz W3 final live recheck 28.09.2026,
 * F-3a): «Решите за меня» decided the audience, and the core answered «Для
 * кого этот текст?» in its own text — «Я обращаюсь к сотрудникам, которые
 * открывают кофейню и начинают утреннюю смену: короткий список помогает…» —
 * which the adaptation then carried into the post. Also narrow, all of:
 *
 * 1. at the start of the sentence, «(Я|Мы) обращаюсь/обращаемся к(о)» /
 *    «I'm (We're) addressing», «I'm writing this for»;
 * 2. a group named by a noun («сотрудникам», «владельцам кофеен», «small
 *    teams») — not a pronoun: «Обращаюсь к вам…» is a rhetorical address, and
 *    «writing this for anyone who…» is the hook above;
 * 3. then the sentence ends straight after the group, or a colon or a dash
 *    follows — straight after it, or after its «, которые…» / «who…» clause
 *    or a few more words («владельцам небольших кофеен:»).
 *
 * So these stay: «Я обращаюсь к коллегам за советом.», «Я обращаюсь к
 * коллегам, когда застреваю.», «Я обращаюсь к коллегам, которые знают тему,
 * за советом.», «Когда застреваю, я обращаюсь к коллегам.»,
 * «Я обращаюсь к врачу раз в год.», «Обращаюсь к вам с просьбой: …», «Мы
 * обращаемся к клиентам по имени.», «Мы обращаемся к клиентам лично.», «Я
 * обращаюсь к коллегам за советом: …», «I'm talking to founders who raised
 * last year.», «I'm writing this for anyone who ships on Fridays.».
 *
 * A remark followed by a colon or a dash keeps what comes after it — that is
 * the sentence's substance: «Я обращаюсь к сотрудникам…: короткий список
 * помогает…» becomes «Короткий список помогает…». A remark with nothing after
 * it goes whole.
 *
 * Pure and deterministic. `audienceRemarksIn` feeds the core's meta-speech
 * check (one combined repair, `core-write.ts`). `withoutAudienceRemarks`
 * remains a historical standalone utility for receipts/tests; active core
 * writing and adaptation persistence preserve the model's meaningful text
 * and no longer call this stylistic deletion helper (.19).
 */

const L = '\\p{L}\\p{Nd}';
const END = `(?![${L}])`;
/** The start of a sentence: the text's or a line's start, or after a stop. */
const SENTENCE_START = `(?<=(?:^|\\n|[.!?…][»"”)]*[^\\S\\n]+)[«"„“]?)`;

const SUBJECT_RU =
  '(?:эт(?:а|от|о)|данн(?:ая|ый|ое))\\s+(?:мысль|идея|пост|текст|заметка|запись|материал|статья|публикация)';
const PREDICATE_RU =
  '(?:адресован[аоы]?|предназначен[аоы]?\\s+для|обращ[её]н[аоы]?\\s+к|написан[аоы]?\\s+для)';
/** Groups of people named by a noun. */
const GROUP_NOUNS_RU =
  '(?:людям|людей|читател\\p{L}*|аудитори\\p{L}*|руководител\\p{L}*|команд\\p{L}*|менеджер\\p{L}*|специалист\\p{L}*|предпринимател\\p{L}*|основател\\p{L}*|владельц\\p{L}*|собственник\\p{L}*|разработчик\\p{L}*|инженер\\p{L}*|маркетолог\\p{L}*|дизайнер\\p{L}*|новичк\\p{L}*|начинающ\\p{L}*|коллег\\p{L}*|подписчик\\p{L}*|клиент\\p{L}*|родител\\p{L}*|студент\\p{L}*|бариста|сотрудник\\p{L}*|лидер\\p{L}*|профессионал\\p{L}*)';
/** A group of people: a pronoun of address or a noun of a group, after at most two words. */
const GROUP_RU = `(?:(?:[\\p{L}-]+\\s+){0,2}(?:тем|тех|всем|всех|вам|вас|тебе|тебя|${GROUP_NOUNS_RU}))`;
/** A group named by a noun, after at most two words — never a pronoun. */
const GROUP_NOUN_RU = `(?:(?:[\\p{L}-]+\\s+){0,2}${GROUP_NOUNS_RU})`;
const SUBJECT_EN = 'this\\s+(?:thought|idea|post|text|note|piece|article)';
const PREDICATE_EN =
  '(?:is|was)\\s+(?:addressed\\s+to|aimed\\s+at|written\\s+for|meant\\s+for|intended\\s+for)';
const GROUP_NOUNS_EN =
  '(?:readers?|teams?|founders?|managers?|leaders?|developers?|engineers?|marketers?|designers?|beginners?|newcomers?|owners?|executives?|professionals?|specialists?|colleagues?|customers?|clients?|parents?|students?)';
const GROUP_EN = `(?:(?:[\\p{L}-]+\\s+){0,2}(?:anyone|anybody|everyone|everybody|those|people|you|${GROUP_NOUNS_EN}))`;
const GROUP_NOUN_EN = `(?:(?:[\\p{L}-]+\\s+){0,2}${GROUP_NOUNS_EN})`;
/** The sentence ends here, or a colon or a dash follows. */
const REMARK_STOP = '(?=[^\\S\\n]*(?:[:—–]|[.!?…]|$))';
/** A colon or a dash follows: the substance comes after it. */
const REMARK_LEAD = '(?=[^\\S\\n]*[:—–])';
/**
 * Up to four words after the group («владельцам небольших кофеен»), none a
 * preposition or a conjunction: «к коллегам за советом: …» is not a group.
 */
const NOT_LINK =
  '(?!(?:за|с|со|по|в|во|на|о|об|от|до|из|при|для|раз|когда|если|чтобы|и|а|но|with|for|at|in|on|about|by|when|if|and|but)(?![\\p{L}]))';
const GROUP_WORDS = `(?:[^\\S\\n]+${NOT_LINK}[\\p{L}-]+){1,4}`;
/**
 * After the group: the sentence ends or a colon/dash comes right away; a
 * «, которые …» clause or more words count only when a colon or a dash
 * follows them — «Я обращаюсь к коллегам, которые знают тему, за советом.»
 * and «Мы обращаемся к клиентам лично.» are sentences of the post.
 */
const addressTail = (clause: string) =>
  `(?:${REMARK_STOP}|(?:${GROUP_WORDS})?${clause}${REMARK_LEAD}|${GROUP_WORDS}${REMARK_LEAD})`;
const OPENER_RU = '(?:(?:прежде\\s+всего|в\\s+первую\\s+очередь|здесь|сегодня|сейчас)\\s+)?';
/** «Я обращаюсь к сотрудникам(, которые …):» — the author naming whom they write for (F-3a). */
const SELF_ADDRESS_RU =
  `(?:(?:я|мы)\\s+)?${OPENER_RU}обраща(?:юсь|емся)\\s+${OPENER_RU}ко?\\s+${GROUP_NOUN_RU}${END}` +
  addressTail(`[^\\S\\n]*,[^\\S\\n]*(?:котор\\p{L}*|кто)${END}[^.!?…:—–\\n]*`);
const SELF_ADDRESS_EN =
  `(?:i\\s+am|i['’]m|we\\s+are|we['’]re)\\s+(?:addressing|writing\\s+this\\s+for)\\s+${GROUP_NOUN_EN}${END}` +
  addressTail(`[^\\S\\n]*,?[^\\S\\n]+(?:who|that)${END}[^.!?…:—–\\n]*`);

/** The remark itself: subject, predicate and group, or the author's address to a group, at a sentence start. */
export const AUDIENCE_REMARK_PATTERNS: readonly RegExp[] = [
  new RegExp(`${SENTENCE_START}${SUBJECT_RU}\\s+${PREDICATE_RU}\\s+${GROUP_RU}${END}`, 'giu'),
  new RegExp(`${SENTENCE_START}${SUBJECT_EN}\\s+${PREDICATE_EN}\\s+${GROUP_EN}${END}`, 'giu'),
  new RegExp(`${SENTENCE_START}${SELF_ADDRESS_RU}`, 'giu'),
  new RegExp(`${SENTENCE_START}${SELF_ADDRESS_EN}`, 'giu'),
];

/** The remarks found, each once, as they stand in the text. */
export const audienceRemarksIn = (text: string): string[] => {
  const found = new Map<string, string>();
  for (const pattern of AUDIENCE_REMARK_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const hit = match[0].replace(/\s+/gu, ' ').trim();
      if (!found.has(hit.toLowerCase())) found.set(hit.toLowerCase(), hit);
    }
  }
  return [...found.values()];
};

/**
 * A line cut into sentences that join back into it exactly. A stop ends a
 * sentence only before a space and a word that does not start in lower
 * case: «т.е. этот», «v2.0», «example.com» and «3.5» stay inside theirs.
 */
export const sentencesOf = (line: string): string[] => {
  const sentences: string[] = [];
  let start = 0;
  for (const match of line.matchAll(/[.!?…]+[»"”)]*(?:[^\S\n]+|$)/gu)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end < line.length && /\p{Ll}/u.test(line[end])) continue;
    if (end > start) sentences.push(line.slice(start, end));
    start = end;
  }
  if (start < line.length) sentences.push(line.slice(start));
  return sentences;
};

/**
 * The sentence without its remark: `null` when the whole sentence goes, the
 * sentence itself when it holds none. A remark followed by a colon or a dash
 * leaves what comes after it, with a capital letter (F-3a).
 */
const withoutRemark = (sentence: string): string | null => {
  const lead = sentence.match(/^[^\S\n]*/u)?.[0] ?? '';
  const body = sentence.slice(lead.length);
  for (const pattern of AUDIENCE_REMARK_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(body);
    if (!match || match.index > 1) continue;
    const rest = body.slice(match.index + match[0].length);
    const substance = rest.match(/^[^\S\n]*[:—–][^\S\n]*/u);
    if (substance) {
      const kept = rest.slice(substance[0].length);
      if (/\p{L}/u.test(kept)) {
        return `${lead}${kept.charAt(0).toLocaleUpperCase()}${kept.slice(1)}`;
      }
    }
    return null;
  }
  return sentence;
};

/**
 * The text without the sentences that say whom it is for. A paragraph left
 * empty goes with its blank line; a text without such a sentence is returned
 * as the same string. Nothing is removed when the rest would be empty or
 * shorter than `minLength` characters (and shorter than the text itself was):
 * the post stays whole rather than lose its body.
 */
export const withoutAudienceRemarks = (
  text: string,
  options: { minLength?: number } = {}
): string => {
  if (!audienceRemarksIn(text).length) return text;
  const lineWithout = (line: string): string | null => {
    const rest = sentencesOf(line)
      .map(withoutRemark)
      .filter((sentence): sentence is string => sentence !== null)
      .join('')
      .replace(/[^\S\n]+$/u, '');
    return rest.trim() || !line.trim() ? rest : null;
  };
  const parts = text.split(/(\n[^\S\n]*\n\s*)/u);
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const paragraph = parts[index]
      .split('\n')
      .map(lineWithout)
      .filter((line): line is string => line !== null)
      .join('\n');
    if (!paragraph.trim()) continue;
    if (kept.length) kept.push(parts[index - 1] ?? '\n\n');
    kept.push(paragraph);
  }
  const result = kept.join('');
  const floor = Math.min(options.minLength ?? 1, text.trim().length);
  return result.trim().length >= Math.max(floor, 1) ? result : text;
};
