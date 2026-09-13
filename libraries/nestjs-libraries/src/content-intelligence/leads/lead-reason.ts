/**
 * Why a lead is worth reading, in a sentence a person can act on.
 *
 * Deterministic and local — no model call, paid or otherwise. Rules run in
 * order and the first that matches wins; the last is the honest fallback when
 * none does. `Ideas.dc.html`'s three cards are the first two plus that
 * fallback: "вы писали про сроки в июле", "тема повторилась у трёх подписок",
 * and the plain "материал на английском" case, which has nothing more to say
 * than where it came from.
 *
 * `content-factory-next-75xn.7` adds one between the second and the fallback,
 * for the kind of subscription that did not exist when those three were
 * written: a topic, whose leads come from a thirty-day search rather than from
 * an address, and for which «found inside the window» is the honest thing to
 * say when nothing better matched. Still not a model call — the window is a
 * number the check was made with, not a judgement about the text.
 */

export type LeadReasonInputV1 = {
  title: string;
  excerpt?: string | null;
  subscriptionDisplayName: string;
  /** Plain, lower-cased text of the workspace's own recent posts. */
  ownPostsText: readonly string[];
  /** Titles of the other new items this same check cycle turned up. */
  siblingTitles: readonly string[];
  /**
   * Set only for a lead a topic subscription found, and only to the window it
   * was found inside (`content-factory-next-75xn.7`).
   *
   * The caller passes it rather than this file reading
   * `DISCOVERY_WINDOW_DAYS` itself, for two reasons. The number is part of the
   * question that was asked, so a subscription checked with a different window
   * would otherwise be described by a sentence naming the wrong one; and this
   * file stays free of imports, so a test reads the rule without loading the
   * search clients.
   *
   * `LeadTopicGateway.check` already drops anything dated older than the
   * window, which is what makes the sentence true rather than hopeful. A feed
   * subscription leaves this unset — a feed is an address a person chose, and
   * «found inside thirty days» says nothing they did not already know.
   */
  freshWithinDays?: number;
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

  /**
   * The fourth rule, and the only one a feed subscription never reaches.
   *
   * Last, not first: «вы уже писали об этом» and «тема повторилась» say
   * something about this workspace, and freshness alone says only that the
   * product looked. It runs before the plain fallback because for a topic the
   * fallback would be the emptier sentence of the two — the subscription's
   * name is the topic itself, so «новое из подписки «ИИ в медицине»» repeats
   * the title and adds nothing, while the window is a fact the person has not
   * been told.
   */
  if (input.freshWithinDays && input.freshWithinDays > 0) {
    return {
      ru: `Свежее за ${input.freshWithinDays} дней по теме «${input.subscriptionDisplayName}» — решать вам, стоит ли ответить.`,
      en: `Published within ${input.freshWithinDays} days on your topic "${input.subscriptionDisplayName}" — whether to respond is up to you.`,
    };
  }

  return {
    ru: `Новое из подписки «${input.subscriptionDisplayName}» — решать вам, стоит ли ответить.`,
    en: `New from your subscription "${input.subscriptionDisplayName}" — whether to respond is up to you.`,
  };
}
