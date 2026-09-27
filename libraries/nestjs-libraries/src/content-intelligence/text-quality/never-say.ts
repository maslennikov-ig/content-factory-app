/**
 * Слова аватара «Никогда не говорить» (NEVER_SAY) — найденными в тексте.
 *
 * `content-factory-next-l7tm`, живой прогон W2 27.09.2026, D3: «Убрать следы
 * ИИ» оставил «синергию», хотя она стоит в строке NEVER_SAY аватара. Проверка
 * этой строки не видела вовсе: запрет уходил только в промпт письма, и модель
 * проверки не знала, что слово у этого автора запрещено.
 *
 * Детерминированно и без модели, как каталог: модель получает список
 * найденных мест, а не просьбу поискать. Русское слово приходит в строку
 * аватара в начальной форме, а в тексте стоит в падеже («синергия» →
 * «синергию»), поэтому у длинных слов снимается окончание и допускается до
 * трёх букв своего. Короткие слова и слова с цифрами сравниваются целиком:
 * у них окончание не отличить от корня.
 *
 * Это не каталог штампов и в «Штампов: N» не считается: у каждого автора
 * свой запрет, и число на странице — про каталог, одинаковый для всех.
 */
import { LEFT, RIGHT } from './slop-rules.types';

/** Сколько запретов аватара доходит до проверки. Больше — уже не список. */
export const NEVER_SAY_MAX = 50;

export type NeverSayFinding = {
  /** Запрет так, как его записал человек. */
  phrase: string;
  /** Что именно стоит в тексте. */
  excerpt: string;
  start: number;
  end: number;
};

const ENDING = /[аяоеёиыуюйь]{1,2}$/u;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const wordPattern = (word: string): string => {
  const lower = word.toLowerCase();
  if (lower.length < 5 || /[^\p{L}-]/u.test(lower)) return escape(lower);
  const stem = lower.replace(ENDING, '');
  return stem.length >= 4
    ? `${escape(stem)}\\p{L}{0,3}`
    : escape(lower);
};

const patternOf = (phrase: string): RegExp | null => {
  const words = phrase
    .replace(/[«»"“”„]/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (!words.length) return null;
  const body = words.map(wordPattern).join('\\s+').replace(/ё/gu, '[её]');
  return new RegExp(`${LEFT}${body}${RIGHT}`, 'giu');
};

/** Строка NEVER_SAY из аватара: как её хранит голос или как её ввёл человек. */
export const neverSayList = (value: unknown): string[] => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? value.split(/\s*[;\n]\s*/u)
    : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const one of raw) {
    if (typeof one !== 'string') continue;
    const phrase = one.trim().slice(0, 120);
    const key = phrase.toLowerCase();
    if (phrase.length < 2 || seen.has(key)) continue;
    seen.add(key);
    list.push(phrase);
    if (list.length >= NEVER_SAY_MAX) break;
  }
  return list;
};

/** Каждое вхождение каждого запрета, по порядку в тексте, без наложений. */
export const neverSayFindings = (
  text: string,
  phrases: readonly string[] | undefined
): NeverSayFinding[] => {
  const found: NeverSayFinding[] = [];
  for (const phrase of neverSayList(phrases ?? [])) {
    const pattern = patternOf(phrase);
    if (!pattern) continue;
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      found.push({ phrase, excerpt: match[0], start, end: start + match[0].length });
    }
  }
  found.sort((left, right) => left.start - right.start || right.end - left.end);
  const kept: NeverSayFinding[] = [];
  for (const finding of found) {
    const previous = kept.at(-1);
    if (previous && finding.start < previous.end) continue;
    kept.push(finding);
  }
  return kept;
};
