/**
 * The Russian word lists the scales divide by.
 *
 * Versioned apart from the analyser on purpose. Changing a dictionary changes
 * the numbers a workspace already saw — a corridor moves, and with it what the
 * generator is allowed to write — so a measurement records which pack produced
 * it and an old measurement stays readable after the pack moves on.
 */

export const RU_LOCALE_PACK_VERSION = 'ru-2026-08-24';

/**
 * Abbreviations whose full stop is followed by a proper noun, so the capital
 * letter after it is not a new sentence: "работал на ул. Ленина".
 *
 * The split matters. The boundary test already requires a capital or a digit
 * after the stop, so a suppression list is only consulted in that case — and
 * there the two kinds of abbreviation behave oppositely. "4,2 млрд. Это
 * рекорд" is two sentences; "ул. Ленина" is one. Treating every abbreviation
 * as non-terminal glues real sentences together and shortens the mean,
 * widens the spread and inflates the share of short phrases at once.
 */
export const RU_ABBREVIATIONS_BEFORE_NAME = [
  'ул.',
  'пр.',
  'пер.',
  'д.',
  'корп.',
  'кв.',
  'им.',
  'тов.',
  'акад.',
  'проф.',
  'г.',
  'гг.',
  'обл.',
  'р-н',
] as const;

/**
 * Abbreviations that read as a full stop inside a clause when what follows is
 * lowercase, and end the sentence when what follows is capitalised. They need
 * no entry in the suppression list — the capital-letter test already handles
 * them — and are listed here so the next reader does not add them to the one
 * above by reflex: `т.е.`, `т.к.`, `т.д.`, `т.п.`, `др.`, `см.`, `руб.`,
 * `тыс.`, `млн.`, `млрд.`, `стр.`, `рис.`, `табл.`, `и.о.`.
 */

/**
 * The copulas a dash stands in for. Scale 6 measures a choice between two
 * spellings of the same clause, so this list is its other half — without it
 * the scale would divide by every sentence and could never reach the 74% the
 * design shows.
 */
export const RU_COPULAS = [
  'это',
  'есть',
  'является',
  'являются',
  'представляет собой',
  'представляют собой',
  'служит',
  'служат',
] as const;

/**
 * First person singular, every form.
 *
 * Read by the post habits rather than by a scale: an opening that puts one of
 * these beside an admission stem is a person saying they got it wrong. It used
 * to sit hardcoded inside `post-habits.ts`, which meant every language got the
 * Russian one — the same defect the scales had, one file further down.
 */
export const RU_FIRST_PERSON_SINGULAR = [
  'я',
  'мне',
  'меня',
  'мной',
  'мною',
  'мой',
  'моя',
  'моё',
  'мое',
  'мои',
  'моего',
  'моей',
  'моих',
  'сам',
  'сама',
] as const;

/**
 * First person plural, every form. Scale 7 asks whether the writer says "we"
 * or names the organisation, so both halves have to be counted the same way.
 */
export const RU_FIRST_PERSON = [
  'мы',
  'нас',
  'нам',
  'нами',
  'наш',
  'наша',
  'наше',
  'наши',
  'нашего',
  'нашей',
  'нашему',
  'нашим',
  'нашем',
  'наших',
  'нашими',
  'нашу',
] as const;

/** The other half of scale 7: the organisation named from outside. */
export const RU_INSTITUTIONAL = [
  'компания',
  'организация',
  'предприятие',
  'завод',
  'фабрика',
  'фирма',
  'редакция',
  'команда',
  'коллектив',
  'бренд',
] as const;

/** Suffixes of the deverbal nouns scale 8 counts. */
export const RU_NOMINALISATION_SUFFIXES = [
  'ение',
  'ения',
  'ению',
  'ением',
  'ении',
  'ений',
  'ениям',
  'ениями',
  'ениях',
  'ание',
  'ания',
  'анию',
  'анием',
  'ании',
  'аний',
  'аниям',
  'аниями',
  'аниях',
] as const;

/**
 * Everyday words with the same ending that are not clerical. Without them the
 * scale would call "мнение", "время" and "решение" bureaucratic and report a
 * plain writer as a civil servant.
 */
export const RU_NOMINALISATION_EXCEPTIONS = new Set([
  'значение',
  'значения',
  'мнение',
  'мнения',
  'здание',
  'здания',
  'знание',
  'знания',
  'растение',
  'растения',
  'настроение',
  'настроения',
  'объявление',
  'объявления',
  'сообщение',
  'сообщения',
  'решение',
  'решения',
  'движение',
  'движения',
  'внимание',
  'внимания',
  'желание',
  'желания',
  'задание',
  'задания',
  'название',
  'названия',
  'расписание',
  'расписания',
  'собрание',
  'собрания',
  'сознание',
  'сознания',
  'воспитание',
  'воспитания',
  'питание',
  'питания',
  'заседание',
  'заседания',
]);

/** Words too common to say anything about a person's vocabulary. */
export const RU_STOPWORDS = new Set([
  'и',
  'в',
  'во',
  'не',
  'что',
  'он',
  'на',
  'я',
  'с',
  'со',
  'как',
  'а',
  'то',
  'все',
  'она',
  'так',
  'его',
  'но',
  'да',
  'ты',
  'к',
  'у',
  'же',
  'вы',
  'за',
  'бы',
  'по',
  'только',
  'ее',
  'её',
  'мне',
  'было',
  'вот',
  'от',
  'меня',
  'ещё',
  'еще',
  'нет',
  'о',
  'из',
  'ему',
  'теперь',
  'когда',
  'даже',
  'ну',
  'вдруг',
  'ли',
  'если',
  'уже',
  'или',
  'ни',
  'быть',
  'был',
  'него',
  'до',
  'вас',
  'нибудь',
  'опять',
  'уж',
  'вам',
  'ведь',
  'там',
  'потом',
  'себя',
  'ничего',
  'ей',
  'может',
  'они',
  'тут',
  'где',
  'есть',
  'надо',
  'ней',
  'для',
  'мы',
  'тебя',
  'их',
  'чем',
  'была',
  'сам',
  'чтоб',
  'без',
  'будто',
  'чего',
  'раз',
  'тоже',
  'себе',
  'под',
  'будет',
  'ж',
  'тогда',
  'кто',
  'этот',
  'того',
  'потому',
  'этого',
  'какой',
  'совсем',
  'ним',
  'здесь',
  'этом',
  'один',
  'почти',
  'мой',
  'тем',
  'чтобы',
  'нее',
  'неё',
  'были',
  'куда',
  'зачем',
  'всех',
  'никогда',
  'можно',
  'при',
  'наконец',
  'два',
  'об',
  'другой',
  'хоть',
  'после',
  'над',
  'больше',
  'тот',
  'через',
  'эти',
  'нас',
  'про',
  'всего',
  'них',
  'какая',
  'много',
  'разве',
  'три',
  'эту',
  'моя',
  'впрочем',
  'хорошо',
  'свою',
  'этой',
  'перед',
  'иногда',
  'лучше',
  'чуть',
  'том',
  'нельзя',
  'такой',
  'им',
  'более',
  'всегда',
  'конечно',
  'всю',
  'между',
]);

/**
 * The service words the similarity measure counts: prepositions, conjunctions
 * and particles, 86 of them, and nothing else.
 *
 * This is the one list in this file that answers "is this the same person",
 * rather than "what is this person's habit". The research says why
 * (`docs/research/writer-voice-style-transfer-2026-08-22.md` §1): function-word
 * frequency is the most-cited topic-independent authorship marker there is, and
 * the Russian "author's invariant" tradition counts exactly this class —
 * conjunctions, prepositions, particles. Particles are listed in full on
 * purpose: §1 names them the Russian-specific signal, the way Japanese
 * particles behave, and dropping `же`, `ли`, `бы`, `вот`, `ведь` would throw
 * away the part of the list that carries the most about a Russian writer.
 *
 * Only invariant forms. Pronouns and adverbs would need morphology to count —
 * `наш`, `нашего`, `нашим` are one word to a reader and three to a tokeniser —
 * and this product deliberately runs no morphological parser. Prepositions,
 * conjunctions and particles have no paradigm to miss, so a plain token count
 * is the whole measurement rather than an approximation of one.
 *
 * Ambiguity is left in rather than resolved: `да` is a conjunction and a
 * particle, `надо` is a preposition and a predicative, `б` is a particle and an
 * abbreviation. Resolving them needs a parser; leaving them costs nothing,
 * because the same ambiguity is counted the same way in every text compared —
 * which is all a distance between two frequency vectors asks of a term.
 *
 * Written without `ё`. The counter folds `ё` to `е` before matching, so
 * `причём` and `причем` are one term and not two half-populated ones.
 */
export const RU_FUNCTION_WORDS = [
  // Prepositions (38).
  'в', 'во', 'на', 'над', 'надо', 'под', 'подо', 'за', 'перед', 'передо',
  'при', 'про', 'о', 'об', 'обо', 'от', 'ото', 'до', 'из', 'изо',
  'к', 'ко', 'с', 'со', 'у', 'по', 'для', 'без', 'через', 'между',
  'около', 'после', 'среди', 'кроме', 'ради', 'вместо', 'сквозь', 'против',
  // Conjunctions (26).
  'и', 'а', 'но', 'да', 'или', 'либо', 'что', 'чтобы', 'чтоб', 'как',
  'когда', 'если', 'хотя', 'хоть', 'потому', 'поэтому', 'зато', 'тоже',
  'также', 'пока', 'чем', 'будто', 'словно', 'однако', 'притом', 'причем',
  // Particles (22).
  'же', 'ж', 'ли', 'бы', 'б', 'вот', 'вон', 'ведь', 'уж', 'разве',
  'неужели', 'даже', 'лишь', 'только', 'именно', 'просто', 'не', 'ни',
  'ну', 'якобы', 'мол', 'пусть',
] as const;

/**
 * The words that make an opening a confession rather than a claim.
 *
 * Measured on the owner's channel on 2026-08-24: the model wrote correctly
 * about first person, lists, dashes and phrase length, and wrote nothing about
 * the two things a reader sees immediately — that he brings numbers he checked
 * himself, and that he often opens by admitting he was wrong. It could not:
 * nothing counted either, so there was nothing to explain.
 *
 * A stem list and not a classifier. Under it lies a plain claim — an opening
 * that puts a first-person pronoun next to one of these stems is a person
 * saying they got it wrong — and a claim a reader can check beats an accuracy
 * nobody can audit.
 */
export const RU_ADMISSION_MARKERS = [
  'ошиб',
  'ошибал',
  'зря',
  'думал',
  'считал',
  'казалось',
  'ставил на',
  'поставил на',
  'не угадал',
  'промахн',
  'признаю',
  'каюсь',
  'провал',
  'не получилось',
  'не вышло',
  'не сработал',
  'потерял',
  'проиграл',
  'был неправ',
  'была неправа',
  'заблужд',
] as const;

/** What an ending asks the reader to do. */
export const RU_CALL_TO_ACTION = [
  'подпиш',
  'подпис',
  'пишите',
  'пиши ',
  'напишите',
  'расскажите',
  'поделит',
  'жмите',
  'жми ',
  'переходи',
  'переходите',
  'забирай',
  'читайте',
  'читать',
  'смотрите',
  'ставьте',
  'ставь ',
  'в комментар',
  'ссылка в',
  'ссылку в',
  'записывайт',
  'приходите',
  'попробуйте',
  'попробуй ',
] as const;

/**
 * Units that turn a digit into a measurement.
 *
 * `3` alone is a number; `3 релиза` and `89 баллов` are something the author
 * checked. The list is short and concrete on purpose — a general "digit near a
 * noun" rule counts dates and prices as measurements too.
 */
export const RU_MEASUREMENT_UNITS = [
  '%',
  'процент',
  'балл',
  'раз',
  'раза',
  'разів',
  'секунд',
  'минут',
  'час',
  'часа',
  'часов',
  'день',
  'дня',
  'дней',
  'недел',
  'месяц',
  'штук',
  'шт',
  'релиз',
  'прогон',
  'попыт',
  'запрос',
  'токен',
  'мс',
  'кб',
  'мб',
  'гб',
  'руб',
  'тысяч',
  'млн',
  'млрд',
] as const;

export const RU_LOCALE_PACK = {
  version: RU_LOCALE_PACK_VERSION,
  functionWords: RU_FUNCTION_WORDS,
  admissionMarkers: RU_ADMISSION_MARKERS,
  callToAction: RU_CALL_TO_ACTION,
  measurementUnits: RU_MEASUREMENT_UNITS,
  abbreviationsBeforeName: RU_ABBREVIATIONS_BEFORE_NAME,
  copulas: RU_COPULAS,
  firstPerson: new Set<string>(RU_FIRST_PERSON),
  firstPersonSingular: RU_FIRST_PERSON_SINGULAR,
  institutional: RU_INSTITUTIONAL,
  nominalisationSuffixes: RU_NOMINALISATION_SUFFIXES,
  nominalisationExceptions: RU_NOMINALISATION_EXCEPTIONS,
  stopwords: RU_STOPWORDS,
} as const;
