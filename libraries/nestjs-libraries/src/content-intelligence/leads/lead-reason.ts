/**
 * Why a lead is worth reading, in a sentence a person can act on.
 *
 * Deterministic and local — no model call, paid or otherwise. Three rules, in
 * order, and the first that matches wins; the fourth is the honest fallback
 * when none does. `Ideas.dc.html`'s three cards are exactly these three:
 * "вы писали про сроки в июле", "тема повторилась у трёх подписок", and the
 * plain "материал на английском" case, which is rule four with nothing more
 * to say than where it came from.
 */

export type LeadReasonInputV1 = {
  title: string;
  excerpt?: string | null;
  subscriptionDisplayName: string;
  /** Plain, lower-cased text of the workspace's own recent posts. */
  ownPostsText: readonly string[];
  /** Titles of the other new items this same check cycle turned up. */
  siblingTitles: readonly string[];
};

export type LeadReasonV1 = { ru: string; en: string };

function significantWords(text: string): string[] {
  return (text || '')
    .toLocaleLowerCase()
    .replace(/<[^>]*>/gu, ' ')
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length >= 5);
}

function anyWordIn(words: readonly string[], text: string): boolean {
  return words.length > 0 && words.some((word) => text.includes(word));
}

export function leadReason(input: LeadReasonInputV1): LeadReasonV1 {
  const words = significantWords(`${input.title} ${input.excerpt || ''}`);

  if (anyWordIn(words, input.ownPostsText.join(' ').toLocaleLowerCase())) {
    return {
      ru: 'Вы уже писали об этом — здесь повод продолжить или уточнить.',
      en: 'You already wrote about this — here is a reason to follow up.',
    };
  }

  const repeatedElsewhere = input.siblingTitles.some((title) =>
    anyWordIn(words, title.toLocaleLowerCase())
  );
  if (repeatedElsewhere) {
    return {
      ru: 'Тема повторилась у нескольких ваших подписок за этот заход.',
      en: 'The topic came up across more than one of your subscriptions this pass.',
    };
  }

  return {
    ru: `Новое из подписки «${input.subscriptionDisplayName}» — решать вам, стоит ли ответить.`,
    en: `New from your subscription "${input.subscriptionDisplayName}" — whether to respond is up to you.`,
  };
}
