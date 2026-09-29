/**
 * The claim key a fact is filed under, from the words of the claim
 * (`content-factory-next-fn33.57`, `fn33.112`).
 *
 * Import-free on purpose: the fact form (`content-facts.adapter.ts`) and the
 * chat's `facts.add` (`kcxz.24`) file a fact the same way, so one sentence is
 * never filed under two keys depending on where it was typed. Moved here from
 * the adapter, which re-exports it.
 */

/**
 * The words a sentence is built with rather than about
 * (content-factory-next-fn33.112).
 *
 * Short and deliberately dull: prepositions, conjunctions, particles,
 * pronouns and the auxiliary verbs of two languages. It is not morphology and
 * does not pretend to be — it only keeps the key from being filed under the
 * word a sentence happens to start with. Anything not on the list counts as
 * meaning something, which is the safe way round: a word wrongly kept makes a
 * clumsy topic, a word wrongly dropped loses the topic altogether.
 */
const FUNCTION_WORDS = new Set([
  // Russian: prepositions and conjunctions
  'в', 'во', 'на', 'над', 'под', 'перед', 'при', 'про', 'за', 'из', 'изо', 'к',
  'ко', 'о', 'об', 'обо', 'от', 'ото', 'по', 'до', 'для', 'без', 'с', 'со',
  'у', 'через', 'между', 'после', 'вместе', 'и', 'а', 'но', 'или', 'либо',
  'что', 'чтобы', 'как', 'если', 'когда', 'чем', 'то', 'также', 'тоже',
  // Russian: particles, pronouns, quantifiers
  'же', 'ли', 'бы', 'не', 'ни', 'вот', 'уже', 'ещё', 'еще', 'только', 'очень',
  'более', 'менее', 'этот', 'эта', 'это', 'эти', 'этом', 'этой', 'этого',
  'тот', 'та', 'те', 'том', 'той', 'того', 'весь', 'вся', 'всё', 'все', 'всех',
  'каждый', 'каждое', 'каждая', 'каждые', 'любой', 'наш', 'наша', 'наше',
  'наши', 'нашей', 'нашего', 'наших', 'нашим', 'свой', 'своя', 'своё', 'свои',
  'своей', 'своего', 'своих', 'мы', 'нас', 'нам', 'нами', 'я', 'меня', 'мне',
  'он', 'она', 'оно', 'они', 'его', 'её', 'ее', 'их', 'им', 'ему', 'ей',
  'вы', 'вас', 'вам', 'ваш', 'ваша', 'ваши', 'там', 'тут', 'здесь', 'где',
  // Russian: the verb of being and its neighbours
  'быть', 'был', 'была', 'было', 'были', 'есть', 'будет', 'будут',
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'from', 'by', 'with', 'without', 'into', 'over', 'under', 'after', 'before',
  'during', 'per', 'via', 'about', 'as', 'if', 'than', 'then', 'so', 'not',
  'no', 'all', 'every', 'each', 'any', 'some', 'this', 'that', 'these',
  'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
  'had', 'do', 'does', 'did', 'we', 'our', 'ours', 'you', 'your', 'they',
  'their', 'it', 'its', 'his', 'her', 'my', 'i',
]);

/**
 * A short, stable stamp of the claim itself.
 *
 * FNV-1a, six hex characters. Not a security thing and not a checksum: it is
 * there so a claim written entirely in function words still gets a key of its
 * own instead of colliding with every other such claim, and so the preview
 * under the field and the key that is saved agree on what it is.
 */
function shortStamp(text: string): string {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

/** What a claim of nothing but function words is filed under. */
const UNNAMED_TOPIC = 'утверждение';

/**
 * The key nobody should have to invent (content-factory-next-fn33.57).
 *
 * `claimKey` is filing, not writing: `ContentFact` groups by it and the radar
 * turns its «тема» half into a topic name. The owner's decision of 01.09.2026
 * (`docs/product/content-section-map.md` §3, §4) takes the engineering
 * apparatus out of the interface, and an internal key with a shape rule is
 * exactly that. So it is filed from the words of the claim itself, and the
 * person stays free to type their own under «Подробнее».
 *
 * Which words: the first two or three that mean something. Taking them in the
 * order they were written — the first word as the topic — produced topics
 * called «В», «Наши» and «Редакция», and the radar offered them as three
 * subjects to write about (`content-factory-next-fn33.112`). Function words
 * and one-character words are skipped for that reason and no other: this is
 * not stemming, nothing here is language-aware beyond a list, and the same
 * sentence always files the same key.
 *
 * A claim made only of function words is filed under «утверждение» with a
 * stamp of its own text, so such claims sit together rather than each
 * inventing a topic. An empty string comes back when the statement carries no
 * letters or numbers at all — the caller then has nothing to save either,
 * because the statement is required.
 */
export function claimKeyFromStatement(statement: string): string {
  const words = statement
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const meaningful = words.filter(
    (word) =>
      word.length > 1 &&
      !FUNCTION_WORDS.has(word) &&
      // A bare number is the value, not what the claim is about: «период_14»
      // and «период_30» are one attribute filed twice.
      !/^\p{N}+$/u.test(word)
  );
  if (!meaningful.length) return `${UNNAMED_TOPIC}|${shortStamp(statement)}`;
  const topic = meaningful[0].slice(0, 40);
  const attribute = (meaningful.slice(1, 3).join('_') || topic).slice(0, 60);
  return `${topic}|${attribute}`;
}
