/**
 * What the radar is allowed to rank, and where the candidates come from.
 *
 * From two places, and neither of them is invention: the facts the workspace
 * has accumulated in its own memory, and what it has already published. A
 * topic nobody has facts for is still listed — with the sentence saying there
 * is nothing to build on, which is more useful than hiding it — and a topic
 * already written about is listed as needing a new angle rather than dropped.
 *
 * The ranking itself is `scoreTopics` in `brand-voice/brief-gate.ts`. This
 * file only decides what a candidate is; the reasons a person reads come from
 * there.
 */

import type { TopicCandidate } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';

export type RadarLanguage = 'ru' | 'en';

/** One row of the workspace's fact memory, as its own service hands it over. */
export type RadarFactV1 = {
  id: string;
  claimKey: string;
  statement: string;
  status: string;
  freshUntil?: Date | string | null;
};

/** One thing the workspace has already published. */
export type RadarPostV1 = { content?: string | null };

const DAY = 24 * 60 * 60 * 1000;

/**
 * A claim key is `namespace|key`; the namespace is the topic.
 *
 * Exported because the witness screen (`content-factory-next-odb8.1`) filters
 * the same catalogue by the same topic and must not grow a second parser for
 * one string shape — `ContentFactService.listFacts` calls this directly
 * rather than re-deriving it from `claimKey` a second way.
 */
export const topicKey = (claimKey: string) =>
  (claimKey.split('|')[0] || claimKey).trim().toLocaleLowerCase();

/** The same topic key, in words a person reads rather than types. */
export const humanize = (key: string) => {
  const words = key.replace(/[_.:-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
};

const plainText = (value?: string | null) =>
  (value || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase();

/**
 * How far past its own freshness horizon the material is.
 *
 * A fact still inside its `freshUntil` is current, so the distance is zero; one
 * that has expired is as old as the time since it did. A fact with no horizon
 * at all is timeless and never ages — reporting a number for it would be
 * inventing one.
 */
function stalenessDays(fact: RadarFactV1, now: Date) {
  if (!fact.freshUntil) return 0;
  const until = new Date(fact.freshUntil).getTime();
  if (!Number.isFinite(until) || until >= now.getTime()) return 0;
  return Math.floor((now.getTime() - until) / DAY);
}

function covered(published: string[], title: string) {
  const term = title.toLocaleLowerCase();
  const words = term.split(' ').filter((word) => word.length >= 4);
  return words.length
    ? published.some((text) => words.every((word) => text.includes(word)))
    : published.some((text) => text.includes(term));
}

export function topicCandidates(
  facts: readonly RadarFactV1[],
  posts: readonly RadarPostV1[],
  now: Date
): TopicCandidate[] {
  const published = posts.map((post) => plainText(post.content));
  const groups = new Map<string, RadarFactV1[]>();

  for (const fact of facts) {
    const key = topicKey(fact.claimKey || '');
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), fact]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const title = humanize(key);
    return {
      id: key,
      title,
      // Only a verified fact counts as something to build on. A fact still
      // waiting for its evidence is on the topic, not under it.
      evidenceCount: group.filter((fact) => fact.status === 'VERIFIED').length,
      covered: covered(published, title),
      freshnessDays: Math.min(
        ...group.map((fact) => stalenessDays(fact, now))
      ),
    };
  });
}

const NOTICES = {
  empty: {
    ru: 'В памяти рабочего пространства пока нет ни одного факта — радару не на чем строить темы. Добавьте факт со ссылкой, которую можно проверить, и тема появится здесь.',
    en: 'The workspace memory holds no facts yet, so the radar has nothing to build a topic from. Add a fact with a source a reader can check and a topic will appear here.',
  },
  unconfirmed: {
    ru: 'Писать пока не на чем: ни у одной темы нет подтверждённого факта. Подтвердите факт источником — и тема поднимется в списке.',
    en: 'Nothing to write from yet: no topic has a confirmed fact. Confirm a fact with a source and its topic moves up the list.',
  },
} as const;

export const RADAR_FAILED_NOTICE = {
  ru: 'Радар не собрался. Бриф и его ответы сохранены.',
  en: 'The radar did not build. The brief and its answers are kept.',
} as const;

/**
 * "Нечего написать" said in words.
 *
 * An empty list with no sentence beside it reads as a broken radar, and a list
 * of zeroes reads as a ranking nobody can argue with.
 */
export function radarNotice(
  facts: readonly RadarFactV1[],
  candidates: readonly TopicCandidate[],
  language: RadarLanguage
): string | undefined {
  if (!facts.length || !candidates.length) return NOTICES.empty[language];
  if (candidates.every((candidate) => candidate.evidenceCount === 0)) {
    return NOTICES.unconfirmed[language];
  }
  return undefined;
}
