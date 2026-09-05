import {
  BRIEF_API_BASE,
  type BriefDraftResponseV1,
  type BriefRequestV1,
  type BriefResponseV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  failureNotice,
  jsonReader,
  readFailure,
  screenState,
  type MaterialFailure,
} from './voice-materials.adapter';
import type { VoiceLocale } from './voice-copy';

/**
 * Everything the Brief tab decides, kept out of the component that renders it.
 *
 * The screen was written with the routes it needed already named in
 * `voice-wiring.contract.ts` and was then rendered by nothing but the review
 * fixture — `content-factory-next-07h.4` built the gate, the radar and the
 * composer and scoped the tab itself as routes only. What was missing was this
 * file and the container beside it.
 *
 * The refusal reading, the request helper and the nine-state mapping are
 * imported from `voice-materials.adapter.ts` rather than written again. They
 * are not about material: they are what any surface of this section does with
 * a `VoiceErrorBodyV1` and with the states the design draws. A second copy is
 * how two tabs of one section start disagreeing about what a 403 looks like.
 */

export const BRIEF_API = BRIEF_API_BASE;

export const BRIEF_ROUTES = Object.freeze({
  radar: `${BRIEF_API}/radar`,
  evaluate: `${BRIEF_API}/evaluate`,
  draft: `${BRIEF_API}/draft`,
});

export { failureNotice, jsonReader, readFailure, screenState };
export type BriefFailure = MaterialFailure;

/* -------------------------------------------------------------------------
 * The brief being written
 * ---------------------------------------------------------------------- */

/**
 * One offered fact, as the form holds it.
 *
 * `sourceUrl` is a plain string and is not validated as a URL, here or on the
 * server: a fact with nothing checkable behind it is a legitimate thing to
 * type, and the answer to it is a question a person can act on rather than a
 * validation error they cannot.
 *
 * `factId` is the other way to ground the same fact: an id from this
 * workspace's own memory (`content-facts.container.tsx`, the Provenance tab),
 * checked against the organization rather than left for a reader to check
 * themselves. The two are not mutually exclusive on the wire, but a person
 * fills in one or the other — a pasted link and a remembered id are two
 * separate claims of having checked something.
 */
export type BriefFactDraft = {
  statement: string;
  sourceUrl: string;
  factId: string;
};

export type BriefDraft = {
  goal: string;
  thesis: string;
  channel: string;
  format: string;
  facts: BriefFactDraft[];
  position: string;
  disagreement: string;
  audience: string;
};

export const emptyBrief = (): BriefDraft => ({
  goal: '',
  thesis: '',
  channel: '',
  format: '',
  facts: [{ statement: '', sourceUrl: '', factId: '' }],
  position: '',
  disagreement: '',
  audience: '',
});

/** The five questions the gate asks, and the two fields it does not. */
export const BRIEF_TEXT_FIELDS = [
  'thesis',
  'position',
  'disagreement',
  'audience',
  'goal',
  'format',
  'channel',
] as const;

export type BriefTextField = (typeof BRIEF_TEXT_FIELDS)[number];

/**
 * What travels to the server.
 *
 * Empty strings are dropped rather than sent: the gate reads a missing field
 * and an empty one the same way, and sending `''` would put a blank line into
 * the brief the screen prints back.
 */
export function buildBriefPayload(draft: BriefDraft): BriefRequestV1 {
  const written = (value: string) => value.trim() || undefined;
  const facts = draft.facts
    .filter((fact) => fact.statement.trim())
    .map((fact) => ({
      statement: fact.statement.trim(),
      ...(fact.sourceUrl.trim() ? { sourceUrl: fact.sourceUrl.trim() } : {}),
      // Sent only when filled in. `factId` is `@IsOptional()` on the DTO, so an
      // empty string would pass validation — and then travel all the way to
      // `groundedBrief` as a claim of a remembered fact that names nothing,
      // rather than reading as what it actually is: nothing typed. Read
      // defensively (`?? ''`) so a draft built before this field existed does
      // not crash on a missing key.
      ...((fact.factId ?? '').trim()
        ? { factId: (fact.factId ?? '').trim() }
        : {}),
    }));

  return {
    ...(written(draft.goal) ? { goal: written(draft.goal) } : {}),
    ...(written(draft.thesis) ? { thesis: written(draft.thesis) } : {}),
    ...(written(draft.channel) ? { channel: written(draft.channel) } : {}),
    ...(written(draft.format) ? { format: written(draft.format) } : {}),
    ...(facts.length ? { facts } : {}),
    ...(written(draft.position) ? { position: written(draft.position) } : {}),
    ...(written(draft.disagreement)
      ? { disagreement: written(draft.disagreement) }
      : {}),
    ...(written(draft.audience) ? { audience: written(draft.audience) } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Readings
 * ---------------------------------------------------------------------- */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asText = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

export type BriefReading = {
  topics: BriefResponseV1['topics'];
  questions: BriefResponseV1['questions'];
  ungroundedFacts: readonly string[];
  brief?: Record<string, string>;
  notice?: string;
};

/**
 * The radar and the gate's verdict, read defensively.
 *
 * `questions` is the one field the screen gates on, so an answer that lost it
 * must not read as "nothing is missing": an empty list here would unlock the
 * draft button over a brief nobody checked. A response with no questions field
 * at all is treated as five unanswered questions rather than as a finished
 * brief — which is what `undefined` honestly means before anything was asked.
 */
export function readBrief(value: unknown, fallback?: BriefReading): BriefReading {
  const body = asRecord(value);
  const questions = asArray(body.questions).map((entry) => {
    const row = asRecord(entry);
    return {
      field: asText(row.field) as BriefResponseV1['questions'][number]['field'],
      question: asText(row.question),
    };
  });

  return {
    topics: asArray(body.topics).map((entry) => {
      const topic = asRecord(entry);
      return {
        id: asText(topic.id),
        title: asText(topic.title),
        score: typeof topic.score === 'number' ? topic.score : 0,
        evidenceCount:
          typeof topic.evidenceCount === 'number' ? topic.evidenceCount : 0,
        reasons: asArray(topic.reasons).map((reason) => asText(reason)),
      };
    }),
    questions: 'questions' in body ? questions : fallback?.questions ?? [],
    ungroundedFacts: asArray(body.ungroundedFacts).map((fact) => asText(fact)),
    ...(asRecord(body.brief) && Object.keys(asRecord(body.brief)).length
      ? { brief: asRecord(body.brief) as Record<string, string> }
      : {}),
    ...(asText(body.notice) ? { notice: asText(body.notice) } : {}),
  };
}

/** A draft, or the questions standing between the brief and one. */
export function readDraftOutcome(value: unknown): BriefDraftResponseV1 {
  const body = asRecord(value);
  if (body.outcome === 'ready' && asText(body.postId)) {
    return { outcome: 'ready', postId: asText(body.postId) };
  }
  return {
    outcome: 'insufficient',
    questions: readBrief(value).questions,
  };
}

/* -------------------------------------------------------------------------
 * The container's own words
 * ---------------------------------------------------------------------- */

export const briefCopy = {
  ru: {
    formTitle: 'Ответьте на пять вопросов',
    formLead:
      'Черновик собирается из брифа, а не из темы. Пока в брифе нет сути, модель напишет что-то гладкое и ни о чём.',
    factStatement: 'Утверждение',
    factSource: 'Ссылка, которую можно проверить',
    addFact: 'Добавить факт',
    removeFact: 'Убрать',
    check: 'Проверить бриф',
    checking: 'Проверяем…',
    // content-factory-next-fn33.90.7: the brief is a writer's tool; a reader
    // sees it, fills nothing and is told whom to ask.
    readOnlyRole:
      'Бриф открыт на чтение. Проверить бриф и добавить факт может редактор или администратор области.',
    optional: 'необязательно',
    picked: (title: string) => `Тема взята в бриф: «${title}».`,
    radarFailure:
      'Радар не собрался. Бриф и его ответы сохранены — их это не затрагивает.',
    evaluateFailure:
      'Бриф не дошёл до сервера. Ответы остались в полях, попробуйте ещё раз.',
    draftFailure: 'Черновик не создался. Бриф сохранён, попробуйте ещё раз.',
    draftOpened: 'Черновик создан и открыт в редакторе.',
    // content-factory-next-fn33.69: отказ «нет ни одного канала» встаёт
    // рядом с нажатой кнопкой и говорит, куда идти за каналом. Каналы
    // подключают на «Календаре» — это /launches.
    draftNoChannelAction: 'Подключить канал на «Календаре»',
    // `content-factory-next-odb8.2`: the door the fact catalogue never had a
    // second copy of. «Откуда факты» only shows what memory already holds —
    // this is where a new entry is made, right where the question is asked.
    factsMemoryTitle: 'Или запомните новый факт',
    factsMemoryLead:
      'Сохранённый факт сам ляжет в бриф отдельной строкой ниже, готовым подтверждением. Он появится и на витрине «Откуда факты».',
    factsMemoryAdded: (statement: string) =>
      `Факт «${statement}» добавлен в бриф строкой ниже.`,
    // `content-factory-next-z0b0`, решено 03.09.2026 по поручению владельца
    // (карта раздела, §10): две планки остаются разными, и разницу объясняем
    // на экране. Ворота брифа пропускают утверждение с одной ссылкой;
    // единый контекст, из которого строится разбор поста, требует принятого
    // доказательства.
    bareLinkWarning:
      'Строка с одной ссылкой ворота брифа пройдёт, но проверяемой цитатой не станет: в разборе поста показать будет нечего, а страницу к тому времени могут поправить или снять. Чтобы цитата осталась — возьмите фрагмент поиском ниже или запомните факт, и у утверждения появится идентификатор.',
  },
  en: {
    formTitle: 'Answer five questions',
    formLead:
      'A draft is built from the brief, not from the topic. While the brief has no substance, the model writes something fluent about nothing.',
    factStatement: 'The claim',
    factSource: 'A source a reader can check',
    addFact: 'Add a fact',
    removeFact: 'Remove',
    check: 'Check the brief',
    checking: 'Checking…',
    readOnlyRole:
      'The brief is read-only for you. Checking a brief and adding a fact is for an editor or an administrator of the workspace.',
    optional: 'optional',
    picked: (title: string) => `Topic taken into the brief: “${title}”.`,
    radarFailure:
      'The radar did not build. The brief and its answers are kept; this does not affect them.',
    evaluateFailure:
      'The brief did not reach the server. Your answers are still here — try again.',
    draftFailure: 'The draft was not created. The brief is kept; try again.',
    draftOpened: 'The draft was created and opened in the editor.',
    draftNoChannelAction: 'Connect a channel on the Calendar',
    factsMemoryTitle: 'Or remember a new fact',
    factsMemoryLead:
      'A saved fact is added to the brief on its own, as a row below, already a confirmation. It also appears on the "Where facts come from" screen.',
    factsMemoryAdded: (statement: string) =>
      `The fact "${statement}" was added to the brief in the row below.`,
    bareLinkWarning:
      'A row with nothing but a link will pass the brief gate, but it will not become a checkable citation: there is nothing to show when the post is reviewed, and by then the page may have been edited or taken down. To keep the citation, take an excerpt through the search below or remember a fact, and the claim gets an id.',
  },
} as const;

export type BriefCopy = (typeof briefCopy)[VoiceLocale];
