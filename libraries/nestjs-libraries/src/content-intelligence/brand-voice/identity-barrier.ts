import { words } from './segment';
import type { Observation } from './assist.contract';

/**
 * Manner without the person.
 *
 * ADR-0011 sets the boundary and this file implements it. Two things about the
 * implementation are structural rather than defensive, and the difference
 * matters: a filter can be bypassed by a new branch of code, while a renderer
 * with no field for verbatim text cannot be bypassed without noticing.
 *
 * So there are two renderers, not one renderer with a flag. In own-voice mode
 * an observation must quote; in reference mode the profile has nowhere to put a
 * quote at all. `renderReferenceProfile` returns a shape whose type has no
 * `examples` and no `quote`, which is why passing it an observation carrying
 * one is a type error rather than a runtime check that someone can delete.
 *
 * What the product may claim about all this is limited by the research: style
 * and content cannot be provably separated, so nothing here promises absence
 * of leakage. It measures leakage and reports what it measured.
 */

export type RedactionCategory =
  | 'PERSON'
  | 'FACT_NUMBER'
  | 'LINK'
  | 'MENTION'
  | 'VERBATIM';

export type Redaction = {
  category: RedactionCategory;
  occurrences: number;
  /** Short, for the screen. Never written into a profile. */
  examples: string[];
};

/**
 * The reference profile: numbers and categories, and no way to hold a quote.
 *
 * Deliberately not `BrandProfileContentV1 & { examples: never }`. A type that
 * merely forbids a field still has code paths built for it; this one was never
 * shaped to carry text, so the barrier is the shape rather than a rule about
 * the shape.
 */
export type ReferenceStyleProfile = {
  mode: 'STYLE_REFERENCE';
  /** Metric key to measured value. Numbers only. */
  metrics: Record<string, number>;
  /** Categorical decisions, from closed vocabularies. */
  categories: Record<string, string>;
  /** Author label for the person's own use. Never leaves the interface. */
  privateAuthorLabel: string | null;
};

export type OwnVoiceProfile = {
  mode: 'OWN_VOICE';
  metrics: Record<string, number>;
  categories: Record<string, string>;
  /** Own-voice mode quotes, and must: an observation without one is refused. */
  examples: { text: string; sampleCode: string }[];
};

const NUMERIC = /\p{Nd}/u;

const PATTERNS: { category: RedactionCategory; pattern: RegExp }[] = [
  {
    category: 'LINK',
    pattern:
      /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\d-]+\.(?:ru|com|org|net|io|me|example)\b(?:\/\S*)?/giu,
  },
  { category: 'MENTION', pattern: /@[\p{L}\d_]{2,}/gu },
  {
    category: 'FACT_NUMBER',
    pattern:
      /\b\d[\d\s.,]*(?:\s*(?:млн|млрд|тыс|руб|%|км|кг|т|шт|год[ауе]?|лет))?\b/giu,
  },
];

/**
 * People and organisations named in the text.
 *
 * Russian NER does not exist on Node and a Python service is not being run, so
 * the model does this in its own structured call. What lands here is the
 * result, and the shape of this function says so: it takes the entity list
 * rather than computing it. The research's prohibition is on raw text reaching
 * the *profile*, not on the model seeing it.
 */
export function redactReference(
  text: string,
  entities: { people: string[]; organisations: string[] },
  verbatimPhrases: string[]
): { redacted: string; redactions: Redaction[] } {
  const found = new Map<RedactionCategory, { count: number; examples: string[] }>();
  const note = (category: RedactionCategory, example: string) => {
    const entry = found.get(category) ?? { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3 && example.trim()) {
      entry.examples.push(example.trim().slice(0, 60));
    }
    found.set(category, entry);
  };

  let redacted = text;

  for (const person of entities.people) {
    if (!person.trim()) continue;
    const pattern = new RegExp(escape(person), 'gu');
    redacted = redacted.replace(pattern, () => {
      note('PERSON', person);
      // A number keeps its slot so the sentence keeps its length: the length is
      // the only thing about it that the profile is allowed to learn.
      return '·';
    });
  }
  for (const organisation of entities.organisations) {
    if (!organisation.trim()) continue;
    redacted = redacted.replace(new RegExp(escape(organisation), 'gu'), () => {
      note('MENTION', organisation);
      return '·';
    });
  }
  for (const phrase of verbatimPhrases) {
    if (!phrase.trim()) continue;
    redacted = redacted.replace(new RegExp(escape(phrase), 'gu'), () => {
      note('VERBATIM', phrase);
      return '·';
    });
  }
  for (const { category, pattern } of PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      if (category === 'FACT_NUMBER' && !NUMERIC.test(match)) return match;
      note(category, match);
      return '·';
    });
  }

  const order: RedactionCategory[] = [
    'PERSON',
    'FACT_NUMBER',
    'LINK',
    'MENTION',
    'VERBATIM',
  ];
  return {
    redacted,
    redactions: order
      .filter((category) => found.has(category))
      .map((category) => ({
        category,
        occurrences: found.get(category)!.count,
        examples: found.get(category)!.examples,
      })),
  };
}

const escape = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The four gates, on a conjunction.
 *
 * Not a majority and not a score. Russian entity recognition runs around 0.91,
 * so roughly nine entities in a hundred walk past the first gate — which is
 * precisely why there are four and why passing three is not passing.
 */
export type LeakageReport = {
  entityLeaks: string[];
  longestSharedNgram: number;
  contentSimilarity: number;
  randomBaseline: number;
  rareWordLeaks: string[];
  passed: boolean;
};

/** The threshold is contract. Four tokens, not "about four". */
export const MAX_SHARED_NGRAM = 3;

export function sharedNgrams(
  output: string,
  source: string,
  size = 4
): string[] {
  const grams = (text: string) => {
    const list = words(text.toLowerCase());
    const set = new Set<string>();
    for (let index = 0; index + size <= list.length; index += 1) {
      set.add(list.slice(index, index + size).join(' '));
    }
    return set;
  };
  const sourceGrams = grams(source);
  return [...grams(output)].filter((gram) => sourceGrams.has(gram));
}

export function longestSharedRun(output: string, source: string): number {
  const left = words(output.toLowerCase());
  const right = words(source.toLowerCase());
  let best = 0;
  const previous = new Array(right.length + 1).fill(0);
  for (let index = 1; index <= left.length; index += 1) {
    let diagonal = 0;
    for (let jndex = 1; jndex <= right.length; jndex += 1) {
      const temporary = previous[jndex];
      if (left[index - 1] === right[jndex - 1]) {
        previous[jndex] = diagonal + 1;
        if (previous[jndex] > best) best = previous[jndex];
      } else {
        previous[jndex] = 0;
      }
      diagonal = temporary;
    }
  }
  return best;
}

export function evaluateLeakage({
  output,
  sourceText,
  sourceEntities,
  rareWords,
  contentSimilarity,
  randomBaseline,
}: {
  output: string;
  sourceText: string;
  sourceEntities: string[];
  rareWords: string[];
  /** Semantic closeness of the output to the author's content. */
  contentSimilarity: number;
  /** The same measure against unrelated authors. */
  randomBaseline: number;
}): LeakageReport {
  const flat = output.toLowerCase();
  const entityLeaks = sourceEntities.filter(
    (entity) => entity.trim() && flat.includes(entity.toLowerCase())
  );
  const longestSharedNgram = longestSharedRun(output, sourceText);
  const rareWordLeaks = rareWords.filter(
    (word) => word.trim() && flat.includes(word.toLowerCase())
  );

  return {
    entityLeaks,
    longestSharedNgram,
    contentSimilarity,
    randomBaseline,
    rareWordLeaks,
    passed:
      entityLeaks.length === 0 &&
      longestSharedNgram <= MAX_SHARED_NGRAM &&
      contentSimilarity <= randomBaseline &&
      rareWordLeaks.length === 0,
  };
}

/**
 * Reference mode's renderer. It has no parameter that could carry a quote.
 *
 * An observation is accepted only for its metric and its category; its `quote`
 * is read by nothing here and cannot reach the returned shape, because the
 * returned shape has no field for it.
 */
export function renderReferenceProfile(input: {
  metrics: Record<string, number>;
  categories: Record<string, string>;
  privateAuthorLabel?: string | null;
}): ReferenceStyleProfile {
  return {
    mode: 'STYLE_REFERENCE',
    metrics: { ...input.metrics },
    categories: { ...input.categories },
    // Held for the person who chose the reference, and read only by the
    // interface. It never enters a generation prompt, an output or marketing
    // copy — the owner's decision of 2026-08-22, recorded in ADR-0011.
    privateAuthorLabel: input.privateAuthorLabel ?? null,
  };
}

/** Own-voice mode's renderer, which requires the quote reference mode forbids. */
export function renderOwnVoiceProfile(input: {
  metrics: Record<string, number>;
  categories: Record<string, string>;
  observations: readonly (Observation & { sampleCode: string })[];
}): OwnVoiceProfile {
  const examples = input.observations
    .filter((observation) => observation.quote.trim().length > 0)
    .map((observation) => ({
      text: observation.quote,
      sampleCode: observation.sampleCode,
    }));
  if (examples.length === 0) {
    throw new Error('own-voice profile requires at least one quoted example');
  }
  return {
    mode: 'OWN_VOICE',
    metrics: { ...input.metrics },
    categories: { ...input.categories },
    examples,
  };
}
