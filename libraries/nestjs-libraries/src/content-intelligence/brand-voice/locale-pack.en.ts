/**
 * The English word lists the scales divide by.
 *
 * Until 2026-08-25 English had no lists of its own: `analyzer.ts` mapped `en`
 * to the Russian pack. Every scale that divides by a word list then measured
 * an English corpus with Russian words. `dashCopula` found no copulas, so it
 * had no opportunities at all; `firstPerson` compared "мы" against "компания"
 * in English text and reported nothing; `nominalisation` looked for `-ение`
 * and returned zero, which this product reads as "this author never writes
 * clerically" — a claim, not a gap. English is the product's primary language.
 *
 * Versioned apart from the analyser, for the same reason the Russian pack is:
 * changing a dictionary moves a corridor a workspace already saw, so every
 * measurement records which pack produced it.
 */

export const EN_LOCALE_PACK_VERSION = 'en-2026-08-25';

/**
 * Abbreviations whose full stop is followed by a proper noun, so the capital
 * after it is not a new sentence: "met Dr. Feldman", "on Baker St. near the
 * park".
 *
 * Only these belong here. `etc.`, `e.g.`, `i.e.`, `vs.` and `approx.` are
 * followed by lowercase in running prose, and the sentence splitter's own
 * capital-letter test already keeps them from ending a sentence; adding them
 * would glue two real sentences together whenever one of them does end a
 * sentence, which shortens the mean and inflates the share of short phrases.
 */
export const EN_ABBREVIATIONS_BEFORE_NAME = [
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'st.',
  'ave.',
  'rd.',
  'blvd.',
  'jr.',
  'sr.',
  'capt.',
  'sgt.',
  'lt.',
  'gov.',
  'sen.',
  'rep.',
  'no.',
] as const;

/**
 * The copulas a dash stands in for.
 *
 * Scale 6 measures a choice between two spellings of one clause — "the answer
 * is simple" against "the answer — simple" — so this list is the scale's other
 * half. English reaches for the dash less often than Russian does, which the
 * scale will report as a lower share rather than as a missing measurement; the
 * denominator is the same either way.
 */
export const EN_COPULAS = [
  'is',
  'are',
  'was',
  'were',
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  'means',
  'meant',
  'remains',
  'becomes',
  'became',
  'amounts to',
  'stands for',
  'consists of',
  'is called',
  'are called',
] as const;

/**
 * First person plural, every form.
 *
 * Scale 7 asks whether the writer says "we" or names the organisation from
 * outside, so both halves are counted the same way. `us` is left in despite
 * being also the object of "let us know" — the same ambiguity is counted the
 * same way on both sides of any comparison, which is all a rate asks.
 */
export const EN_FIRST_PERSON = [
  'we',
  "we're",
  "we've",
  "we'll",
  "we'd",
  'us',
  'our',
  'ours',
  'ourselves',
] as const;

/**
 * First person singular, every form the habits look for.
 *
 * Read by the post habits: an opening that puts one of these beside an
 * admission stem is a person saying they got it wrong.
 */
export const EN_FIRST_PERSON_SINGULAR = [
  'i',
  "i'm",
  "i've",
  "i'd",
  "i'll",
  'me',
  'my',
  'mine',
  'myself',
] as const;

/**
 * The organisation named from outside, the other half of scale 7.
 *
 * One word per entry. The counter that reads this list walks tokens, so "the
 * company" could never match anything — an entry with a space in it is an
 * entry that is never counted, and a scale whose second half never fires
 * reports every writer as speaking for themselves.
 */
export const EN_INSTITUTIONAL = [
  'company',
  'company\u2019s',
  'team',
  'firm',
  'agency',
  'studio',
  'brand',
  'organisation',
  'organization',
  'business',
  'management',
  'newsroom',
  'editorial',
] as const;

/**
 * Suffixes of the deverbal nouns scale 8 counts.
 *
 * English carries a warning Russian does not need. `-ение` and `-ание` are
 * markers of a bureaucratic register almost wherever they appear; `-tion` and
 * `-ment` are ordinary in plain English — "question", "moment", "information"
 * are not clerical. The exception list below is therefore doing more work
 * here, the scale is weaker in English than in Russian, and that is recorded
 * rather than hidden. `content-factory-next-pl1.7` is where the composition of
 * the scales is reconsidered; until then this measures what it can.
 */
export const EN_NOMINALISATION_SUFFIXES = [
  'tion',
  'tions',
  'sion',
  'sions',
  'ment',
  'ments',
  'ance',
  'ances',
  'ence',
  'ences',
  'ization',
  'izations',
  'isation',
  'isations',
  'ancy',
  'ency',
  'encies',
] as const;

/**
 * Everyday words with the same ending that carry no clerical register.
 *
 * Without them the scale calls "question", "moment" and "experience"
 * bureaucratic and reports a plain writer as a civil servant. The list is
 * deliberately of ordinary, high-frequency words: adding every `-tion` noun
 * anybody dislikes would leave the scale measuring the list's author.
 */
export const EN_NOMINALISATION_EXCEPTIONS = new Set([
  'question',
  'questions',
  'mention',
  'mentions',
  'attention',
  'intention',
  'intentions',
  'section',
  'sections',
  'station',
  'stations',
  'direction',
  'directions',
  'position',
  'positions',
  'decision',
  'decisions',
  'version',
  'versions',
  'session',
  'sessions',
  'discussion',
  'discussions',
  'conversation',
  'conversations',
  'situation',
  'situations',
  'information',
  'moment',
  'moments',
  'comment',
  'comments',
  'element',
  'elements',
  'document',
  'documents',
  'argument',
  'arguments',
  'experiment',
  'experiments',
  'instrument',
  'instruments',
  'equipment',
  'apartment',
  'apartments',
  'movement',
  'movements',
  'agreement',
  'agreements',
  'experience',
  'experiences',
  'difference',
  'differences',
  'audience',
  'audiences',
  'sentence',
  'sentences',
  'reference',
  'references',
  'evidence',
  'confidence',
  'balance',
  'chance',
  'chances',
  'distance',
  'performance',
  'importance',
  'appearance',
  'maintenance',
]);

/**
 * Words too common to say anything about a person's vocabulary.
 *
 * Read by the lexicon, not by a scale: a list of an author's favourite words
 * that opened with "the, and, to" would be a list of English, not of them.
 */
export const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'there', 'here', 'as', 'at', 'by', 'for',
  'from', 'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'over', 'to',
  'up', 'upon', 'with', 'within', 'without', 'about', 'after', 'again',
  'against', 'all', 'also', 'am', 'any', 'are', 'be', 'because', 'been',
  'before', 'being', 'below', 'between', 'both', 'can', 'could', 'did',
  'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now',
  'once', 'only', 'other', 'others', 'ought', 'our', 'ours', 'ourselves',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'their', 'theirs',
  'them', 'themselves', 'they', 'through', 'too', 'under', 'until', 'us',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'would', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'get', 'got', 'go', 'going', 'make', 'made',
  'like', 'one', 'two', 'still', 'even', 'much', 'many', 'well', 'back',
  'way', 'thing', 'things', 'time', 'times', 'lot', 'lots', 'need',
  'want', 'know', 'think', 'see', 'say', 'said', 'says', 'let', 'may',
  'might', 'must', 'shall', 'yet', 'always', 'never', 'often', 'sometimes',
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
  "can't", "won't", "it's", "that's", "i'm", "i've", "we're", "we've",
  "you're", "they're", "there's",
]);

/**
 * The most-cited authorship marker there is, for English.
 *
 * Ninety terms: prepositions, conjunctions, pronouns, auxiliaries and the
 * common contractions. Contractions are kept as their own terms rather than
 * expanded, because whether a writer types "don't" or "do not" is exactly the
 * kind of habit this feature exists to catch, and expanding them would erase
 * it.
 *
 * Ambiguity is left in rather than resolved: `that` is a conjunction, a
 * determiner and a pronoun; `as` is a preposition and a conjunction. Resolving
 * them needs a parser; leaving them costs nothing, because the same ambiguity
 * is counted the same way in every text compared — which is all a distance
 * between two frequency vectors asks of a term.
 */
export const EN_FUNCTION_WORDS = [
  // Prepositions (30).
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'by', 'despite', 'during', 'for', 'from', 'in', 'into', 'of', 'off', 'on',
  'over', 'through', 'to', 'under',
  // Conjunctions (16).
  'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although', 'though',
  'while', 'whereas', 'unless', 'until', 'since', 'if', 'than',
  // Pronouns and determiners (22).
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that',
  'these', 'those',
  // Auxiliaries and modals (14).
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would',
  // Contractions (8).
  "don't", "it's", "that's", "i'm", "i've", "we're", "you're", "can't",
] as const;

/**
 * The words that make an opening a confession rather than a claim.
 *
 * A stem list and not a classifier, for the same reason the Russian one is:
 * under it lies a plain claim — an opening that puts a first-person pronoun
 * next to one of these stems is a person saying they got it wrong — and a
 * claim a reader can check beats an accuracy nobody can audit.
 */
export const EN_ADMISSION_MARKERS = [
  'was wrong',
  'were wrong',
  'my mistake',
  'i messed',
  'i screwed',
  'got it wrong',
  'turns out',
  'turned out',
  'i thought',
  'i assumed',
  'i believed',
  'i was sure',
  'i admit',
  'i owe',
  'it did not work',
  "it didn't work",
  'did not work out',
  "didn't work out",
  'i failed',
  'we failed',
  'i lost',
  'i regret',
  'in hindsight',
  'looking back',
] as const;

/** What an ending asks the reader to do. */
export const EN_CALL_TO_ACTION = [
  'subscribe',
  'sign up',
  'follow ',
  'read more',
  'read the',
  'check out',
  'have a look',
  'take a look',
  'let me know',
  'tell me',
  'share ',
  'drop a comment',
  'in the comments',
  'link in',
  'click ',
  'try it',
  'give it a try',
  'join ',
  'download',
  'get started',
  'reply ',
  'write to me',
] as const;

/**
 * Units that turn a digit into a measurement.
 *
 * `3` alone is a number; `3 releases` and `89 points` are something the author
 * checked. Short and concrete on purpose — a general "digit near a noun" rule
 * counts dates and prices as measurements too.
 */
export const EN_MEASUREMENT_UNITS = [
  '%',
  'percent',
  'point',
  'points',
  'times',
  'second',
  'seconds',
  'minute',
  'minutes',
  'hour',
  'hours',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
  'km',
  'kg',
  'gb',
  'mb',
  'ms',
  'thousand',
  'million',
  'billion',
  'people',
  'users',
  'x',
] as const;

export const EN_LOCALE_PACK = {
  version: EN_LOCALE_PACK_VERSION,
  functionWords: EN_FUNCTION_WORDS,
  admissionMarkers: EN_ADMISSION_MARKERS,
  callToAction: EN_CALL_TO_ACTION,
  measurementUnits: EN_MEASUREMENT_UNITS,
  abbreviationsBeforeName: EN_ABBREVIATIONS_BEFORE_NAME,
  copulas: EN_COPULAS,
  firstPerson: new Set<string>(EN_FIRST_PERSON),
  firstPersonSingular: EN_FIRST_PERSON_SINGULAR,
  institutional: EN_INSTITUTIONAL,
  nominalisationSuffixes: EN_NOMINALISATION_SUFFIXES,
  nominalisationExceptions: EN_NOMINALISATION_EXCEPTIONS,
  stopwords: EN_STOPWORDS,
} as const;
