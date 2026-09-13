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
 *
 * `content-factory-next-75xn.23` puts one sentence ahead of all of them, and it
 * is the only one that ever reads the material: `lead-discovery-judge.ts` runs
 * once per topic check inside the search operation and says what the page
 * reports. When it wrote a sentence, that sentence is the reason and the rules
 * below do not run. They still own every lead it did not judge — a feed item,
 * a workspace with no model key, a call that failed — which is why they stay
 * exactly as strict as the facts they have.
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
   * What a topic subscription actually watches, when it watches a topic.
   *
   * The «тема повторилась» rule below subtracts these words before counting:
   * five subscriptions about work and AI share the word «работа» by
   * construction, and on 13.09.2026 that made the rule fire on almost every
   * row of every topic (F14). A feed subscription leaves it unset.
   */
  subscriptionQuery?: string;
  /**
   * The sentence a model wrote about what this material says
   * (`lead-discovery-judge.ts`), when one was written.
   *
   * It wins over every rule below, and that is the point: the rules can say
   * «вы уже писали об этом» and «свежее за тридцать дней», and neither says
   * what is in the material. A judgement that arrived with an empty sentence
   * is not one — the caller passes `null` and the rules run.
   */
  judgedReason?: { ru: string; en: string } | null;
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

/**
 * The same crude stem `lead-junk.ts` compares with — the first five letters of
 * a word — repeated here rather than imported, because this file stays free of
 * imports so a test can read the rule without loading anything around it.
 */
function stems(text: string): Set<string> {
  return new Set(significantWords(text).map((word) => word.slice(0, 5)));
}

function anyWordIn(words: readonly string[], text: string): boolean {
  return words.length > 0 && words.some((word) => text.includes(word));
}

/** How many of `wanted` appear in the text, counted once each. */
function sharedStems(wanted: ReadonlySet<string>, text: string): number {
  if (wanted.size === 0) return 0;
  let shared = 0;
  for (const stem of stems(text)) if (wanted.has(stem)) shared += 1;
  return shared;
}

/**
 * Two stems, not one, and neither of them the subscription's own words.
 *
 * «Тема повторилась у нескольких ваших подписок» was printed over a third of
 * the rows of the 13.09.2026 sweep, because one shared word longer than five
 * letters was enough and the shared word was usually the topic itself. Two
 * words the subscription did not ask for is a coincidence worth naming; one is
 * the subject of the search.
 */
const REPEATED_TOPIC_MINIMUM_STEMS = 2;

export function leadReason(input: LeadReasonInputV1): LeadReasonV1 {
  /**
   * First, and before any rule: a sentence about the material itself beats
   * every sentence this file can compose about the workspace around it.
   */
  const judged = input.judgedReason;
  if (judged && judged.ru.trim() && judged.en.trim()) {
    return { ru: judged.ru.trim(), en: judged.en.trim() };
  }

  const words = significantWords(`${input.title} ${input.excerpt || ''}`);

  if (anyWordIn(words, input.ownPostsText.join(' ').toLocaleLowerCase())) {
    return {
      ru: 'Вы уже писали об этом — здесь повод продолжить или уточнить.',
      en: 'You already wrote about this — here is a reason to follow up.',
    };
  }

  // What the subscription itself asked for cannot be evidence that a topic
  // «repeated»: it is the question, not an echo of it.
  const asked = stems(
    `${input.subscriptionQuery || ''} ${input.subscriptionDisplayName}`
  );
  const carried = new Set(
    [...stems(`${input.title} ${input.excerpt || ''}`)].filter(
      (stem) => !asked.has(stem)
    )
  );
  const repeatedElsewhere = input.siblingTitles.some(
    (title) => sharedStems(carried, title) >= REPEATED_TOPIC_MINIMUM_STEMS
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
