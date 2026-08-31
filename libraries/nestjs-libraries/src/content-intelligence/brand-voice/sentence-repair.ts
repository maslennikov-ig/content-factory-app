import { z } from 'zod';
import type { BrandVoiceLocale } from './brand-voice.types';

/**
 * Repairing one sentence, and proving the meaning survived it.
 *
 * The boundary the owner drew on 2026-08-24 is style, not sense: a sentence
 * carrying a number or a name gives them back word for word, and that is
 * checked the same way a quote in the profile proposal is checked — by looking
 * for the string, not by trusting the model to say it did.
 *
 * What counts as a fact is deliberately generous. Digits, because a rewritten
 * "89 баллов" that comes back "около девяноста" has destroyed the point of the
 * sentence. Quoted spans, because somebody else's words are not the author's to
 * paraphrase. Links, handles and hashtags, because they either work or do not.
 * Latin-script words, because in this domain they are product names — DeepSeek,
 * Temporal, Prisma — and a model that "improves" one has invented a claim.
 *
 * The generosity has a cost and it is the right one: the guard sometimes
 * refuses a rewrite that was fine. A refusal shows the author the original,
 * unchanged, and asks nothing of them. The other failure would hand back a
 * sentence that reads like them and says something they did not say.
 */

export const REPAIR_SCHEMA_NAME = 'voice_sentence_repair';

export const repairResultSchema = z.object({
  /** One sentence. The rest of the text is not this call's business. */
  sentence: z.string().min(2).max(600),
  /** What was changed, in one short phrase, for the person deciding. */
  note: z.string().min(3).max(200),
});

export type RepairResult = z.infer<typeof repairResultSchema>;

const FACT_PATTERNS: RegExp[] = [
  // Numbers, including 4,2 and 2026.08. A group separator splits them into two
  // facts, which is harmless: both halves have to survive either way.
  /\d+(?:[.,]\d+)*/gu,
  // Quoted speech, either Russian or straight quotes.
  /«[^»]{1,200}»/gu,
  /"[^"]{1,200}"/gu,
  // Links, handles and hashtags: these either work afterwards or do not.
  /https?:\/\/[^\s<>"]+/gu,
  /@[A-Za-z0-9_]{2,}/gu,
  /#[\p{L}\d_]{2,}/gu,
  // Latin-script words. In this domain they are product names.
  /\b[A-Za-z][A-Za-z0-9.+-]*\b/gu,
];

const flatten = (value: string) =>
  value.replace(/\s+/gu, ' ').replace(/[«»“”]/gu, '"').trim();

/**
 * Everything in the sentence that a rewrite is not allowed to lose.
 *
 * Deduplicated and longest first, so that checking `V4` after `V4 Pro` does not
 * report a fact kept twice.
 */
export function extractFacts(sentence: string): string[] {
  const found = new Set<string>();
  for (const pattern of FACT_PATTERNS) {
    for (const match of sentence.matchAll(pattern)) {
      // A link at the end of a clause swallows the comma after it, and then
      // the guard demands a comma the rewrite has no reason to keep.
      const value = match[0].trim().replace(/[.,;:!?»)\]]+$/u, '');
      if (value.length >= 1) found.add(value);
    }
  }
  return [...found].sort((left, right) => right.length - left.length);
}

export type FactVerdict = { kept: string[]; lost: string[] };

/** A fact survives when its exact characters are still there. */
export function checkFacts(facts: readonly string[], proposal: string): FactVerdict {
  const haystack = flatten(proposal).toLowerCase();
  const kept: string[] = [];
  const lost: string[] = [];
  for (const fact of facts) {
    if (haystack.includes(flatten(fact).toLowerCase())) kept.push(fact);
    else lost.push(fact);
  }
  return { kept, lost };
}

export type RepairContext = {
  sentence: string;
  /** The neighbours, for context only. The model may not return them. */
  before: string | null;
  after: string | null;
  /** What the check said is wrong with this sentence. */
  note: string;
  /** The author's own sentence-length corridor, where the measurement has one. */
  corridor: { low: number; high: number } | null;
  /** A line or two of the author's own writing, so the model has the manner. */
  examples: readonly string[];
  facts: readonly string[];
  locale: BrandVoiceLocale;
};

/**
 * The prompt.
 *
 * It carries one sentence and its two neighbours and nothing else of the text.
 * That is the economy the owner asked for — a short call instead of a full
 * regeneration — and it is also the guarantee: a model that never sees the rest
 * of the post cannot rewrite it.
 */
export function buildRepairPrompt(context: RepairContext): string {
  const russian = context.locale !== 'en';
  const lines: string[] = [];

  lines.push(
    russian
      ? 'Перепиши ОДНО предложение так, чтобы оно звучало как остальные тексты автора.'
      : 'Rewrite ONE sentence so that it sounds like the rest of this author’s writing.'
  );
  lines.push(
    russian
      ? 'Смысл, факты, числа, имена и ссылки сохрани дословно. Не добавляй нового смысла и не убирай существующий.'
      : 'Keep the meaning, the facts, the numbers, the names and the links word for word. Add no new meaning and remove none.'
  );
  lines.push(
    russian
      ? 'Ответ — одно предложение. Соседние предложения даны только для контекста, их переписывать нельзя.'
      : 'Answer with one sentence. The neighbours are context only and must not be rewritten.'
  );

  lines.push('');
  lines.push(russian ? `ЧТО НЕ ТАК: ${context.note}` : `WHAT IS WRONG: ${context.note}`);
  if (context.corridor) {
    lines.push(
      russian
        ? `ОБЫЧНАЯ ДЛИНА ФРАЗЫ АВТОРА: ${context.corridor.low}–${context.corridor.high} слов.`
        : `THE AUTHOR’S USUAL SENTENCE LENGTH: ${context.corridor.low}–${context.corridor.high} words.`
    );
  }
  if (context.facts.length) {
    lines.push(
      russian
        ? `СОХРАНИТЬ ДОСЛОВНО: ${context.facts.join(' · ')}`
        : `KEEP VERBATIM: ${context.facts.join(' · ')}`
    );
  }
  for (const example of context.examples.slice(0, 3)) {
    lines.push(russian ? `ТАК ПИШЕТ АВТОР: ${example}` : `THE AUTHOR WRITES: ${example}`);
  }

  lines.push('');
  if (context.before) {
    lines.push(russian ? `ПЕРЕД (не трогать): ${context.before}` : `BEFORE (do not touch): ${context.before}`);
  }
  lines.push(russian ? `ПЕРЕПИСАТЬ: ${context.sentence}` : `REWRITE: ${context.sentence}`);
  if (context.after) {
    lines.push(russian ? `ПОСЛЕ (не трогать): ${context.after}` : `AFTER (do not touch): ${context.after}`);
  }

  return lines.join('\n');
}

export type RepairFailure = 'FACTS_LOST' | 'UNCHANGED' | 'TOO_LONG';

/**
 * Whether the model's answer may be shown to the person.
 *
 * Length has a ceiling because a "repair" three times the original is a
 * rewrite of the paragraph wearing a sentence's clothes, and the one thing
 * this path promises is that the rest of the text was not touched.
 */
export function judgeRepair(
  original: string,
  proposal: string,
  facts: readonly string[]
): { ok: boolean; reason?: RepairFailure; verdict: FactVerdict } {
  const verdict = checkFacts(facts, proposal);
  if (verdict.lost.length > 0) {
    return { ok: false, reason: 'FACTS_LOST', verdict };
  }
  if (flatten(proposal) === flatten(original)) {
    return { ok: false, reason: 'UNCHANGED', verdict };
  }
  if (proposal.length > Math.max(240, original.length * 2)) {
    return { ok: false, reason: 'TOO_LONG', verdict };
  }
  return { ok: true, verdict };
}

/**
 * The replacement, done by the caller and never by this module on its own.
 *
 * Nothing is applied automatically — that is point four of the owner's
 * decision — so this exists for the moment the person says yes, and for the
 * test that proves the rest of the text came through untouched.
 */
export function applyRepair(
  text: string,
  spot: { start: number; end: number },
  proposal: string
): string {
  return `${text.slice(0, spot.start)}${proposal}${text.slice(spot.end)}`;
}
