/**
 * The gate that refuses to write when there is nothing to say.
 *
 * Taken from the donor as an idea and written here: a draft is not produced
 * until the brief carries a thesis, facts with sources, the author's own
 * position, something they disagree with, and who it is for. When any of those
 * is missing the answer is the missing question, not a paragraph.
 *
 * The point is not strictness. A model asked to write about a topic with no
 * substance will produce something fluent — that is what it is for — and the
 * result reads like content and says nothing. The gate turns that failure from
 * an invisible one into a question a person can answer in a sentence.
 *
 * "Disagreement" is the requirement that surprises people, and it is the most
 * load-bearing: a piece nobody could argue with is a piece nobody needed. Ask
 * for the objection and either it exists, or the topic does not.
 */

export type BriefField =
  | 'thesis'
  | 'facts'
  | 'position'
  | 'disagreement'
  | 'audience';

export type BriefFact = {
  statement: string;
  /** A source the reader could check. A fact without one is an assertion. */
  sourceUrl?: string | null;
  /** A fact carried from the memory of the workspace, with its own id. */
  factId?: string | null;
};

export type Brief = {
  goal?: string;
  thesis?: string;
  channel?: string;
  format?: string;
  facts?: BriefFact[];
  position?: string;
  disagreement?: string;
  audience?: string;
};

export type BriefQuestion = {
  field: BriefField;
  question: { ru: string; en: string };
};

const QUESTIONS: Record<BriefField, BriefQuestion['question']> = {
  thesis: {
    ru: 'Что именно вы утверждаете? Одно предложение, которое можно оспорить.',
    en: 'What exactly are you claiming? One sentence somebody could argue with.',
  },
  facts: {
    ru: 'На чём это стоит? Нужен хотя бы один факт со ссылкой, которую можно проверить.',
    en: 'What does it rest on? At least one fact with a source a reader can check.',
  },
  position: {
    ru: 'Что вы об этом думаете? Пересказ чужого материала не нуждается в вашем голосе.',
    en: 'What do you think about it? A retelling of someone else’s material does not need your voice.',
  },
  disagreement: {
    ru: 'С чем здесь можно не согласиться? Текст, с которым спорить нечего, никому не нужен.',
    en: 'What could somebody disagree with here? A piece nobody could argue with is a piece nobody needed.',
  },
  audience: {
    ru: 'Для кого это? Не «для всех» — назовите людей, которые это прочитают.',
    en: 'Who is it for? Not "everyone" — name the people who will read it.',
  },
};

/** Short answers are usually a field filled to get past the gate. */
const MIN_ANSWER = 12;

const filled = (value?: string | null) =>
  Boolean(value && value.trim().length >= MIN_ANSWER);

/**
 * A fact needs somewhere it came from. One taken from the workspace's own
 * memory carries a `factId` instead of a URL, which is the same guarantee by a
 * different route: it was checked when it entered.
 */
const grounded = (fact: BriefFact) =>
  Boolean(fact.statement?.trim()) &&
  Boolean(fact.sourceUrl?.trim() || fact.factId?.trim());

export type BriefVerdict = {
  ready: boolean;
  missing: BriefField[];
  questions: BriefQuestion[];
  /** Facts that were offered but carry nothing a reader could check. */
  ungroundedFacts: string[];
};

export function evaluateBrief(brief: Brief): BriefVerdict {
  const missing: BriefField[] = [];

  if (!filled(brief.thesis)) missing.push('thesis');

  const facts = brief.facts ?? [];
  const good = facts.filter(grounded);
  if (good.length === 0) missing.push('facts');

  if (!filled(brief.position)) missing.push('position');
  if (!filled(brief.disagreement)) missing.push('disagreement');
  if (!filled(brief.audience)) missing.push('audience');

  return {
    ready: missing.length === 0,
    missing,
    // Questions, not error messages. A person can answer a question; there is
    // nothing to do with "field required".
    questions: missing.map((field) => ({
      field,
      question: QUESTIONS[field],
    })),
    ungroundedFacts: facts
      .filter((fact) => !grounded(fact))
      .map((fact) => fact.statement)
      .filter(Boolean),
  };
}

/**
 * Topic candidates, ranked, each with the reason it ranked where it did.
 *
 * The reason is not decoration. A list of topics with scores and no reasons is
 * a ranking nobody can argue with, which is the same failure the brief gate
 * exists to prevent, one step earlier.
 */
export type TopicCandidate = {
  id: string;
  title: string;
  /** How much of the workspace's own material already supports it. */
  evidenceCount: number;
  /** Whether the workspace has published on it before. */
  covered: boolean;
  /** Days since the newest supporting fact. */
  freshnessDays: number;
};

export type ScoredTopic = TopicCandidate & {
  score: number;
  reasons: { ru: string; en: string }[];
};

export function scoreTopics(
  candidates: readonly TopicCandidate[]
): ScoredTopic[] {
  return [...candidates]
    .map((candidate) => {
      const reasons: ScoredTopic['reasons'] = [];
      let score = 0;

      if (candidate.evidenceCount > 0) {
        score += Math.min(40, candidate.evidenceCount * 10);
        reasons.push({
          ru: `${candidate.evidenceCount} подтверждённых фактов уже есть`,
          en: `${candidate.evidenceCount} confirmed facts already on hand`,
        });
      } else {
        reasons.push({
          ru: 'нет ни одного подтверждённого факта — писать пока не на чем',
          en: 'no confirmed facts yet — nothing to build on',
        });
      }

      if (!candidate.covered) {
        score += 30;
        reasons.push({
          ru: 'вы об этом ещё не писали',
          en: 'you have not written about this yet',
        });
      } else {
        reasons.push({
          ru: 'вы уже писали об этом — нужен новый угол',
          en: 'you have written about this — it needs a new angle',
        });
      }

      if (candidate.freshnessDays <= 14) {
        score += 30;
        reasons.push({
          ru: `материал свежий, ${candidate.freshnessDays} дн.`,
          en: `the material is ${candidate.freshnessDays} days old`,
        });
      } else {
        reasons.push({
          ru: `материалу ${candidate.freshnessDays} дн. — проверьте, не устарел ли`,
          en: `the material is ${candidate.freshnessDays} days old — check whether it still holds`,
        });
      }

      return { ...candidate, score, reasons };
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}
