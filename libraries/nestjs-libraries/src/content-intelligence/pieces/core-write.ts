import { contentFromIntent } from '../intake/intake-content';
/*
  «Решите за меня» — решение, а не пустое место (`97dq.56`, `core-write/v11`):
  отданные вопросы решаются тем же вызовом, что пишет суть, и возвращаются
  рядом с ней в `decisions`. Модули v3–v10 остаются импортируемыми и
  нетронутыми для квитанций.
*/
/*
  «Пересобрать суть» (`97dq.85`, `core-write/v12`): пересборка видит
  предыдущую суть и дописанный материал своими блоками. Модули v3–v11
  остаются импортируемыми и нетронутыми для квитанций.
*/
/*
  Суть — готовый текст от первого лица автора (`97dq.90`, `core-write/v13`):
  решения модели применяются молча, ответ человека сильнее материала, речи о
  тексте нет, и проверка `metaSpeechIn` просит одну перепись, если она всё же
  есть. Модули v3–v12 остаются импортируемыми и нетронутыми для квитанций.
*/
/*
  English instructions for every content language (`97dq.97`,
  `core-write/v14`): the system, block titles and repair lines are English,
  and one line names the output language. Modules v3–v13 stay importable and
  untouched for receipts.
*/
/*
  «Решите за меня» answered from the model's knowledge (`97dq.99`,
  `core-write/v15`): a handed question gets content, under the policy of the
  avatar (`voice.delegatedPolicy`: knowledge by default, invented examples
  opt-in). Modules v3–v14 stay importable and untouched for receipts.
*/
import {
  CORE_WRITE_BLOCK_TITLES_V15,
  CORE_WRITE_ENRICH_LEAD_V15,
  CORE_WRITE_META_REPAIR_V15,
  CORE_WRITE_PROMPT_VERSION,
  CORE_WRITE_REPAIR_V15,
  coreWriteSystemV15,
} from './core-write-prompt.v15';
import type { DelegatedPolicyV1 } from '../brand-profile/delegated-policy';
import { personTextWithoutAdded } from './core-edit';
import { metaSpeechIn } from '../text-quality/meta-speech';
export { CORE_WRITE_PROMPT_VERSION } from './core-write-prompt.v15';
/**
 * Суть заготовки: один вызов роли `draft`, и ни одного повода звать модель ещё раз.
 *
 * `content-factory-next-tu3k.9.3`, решения владельца 06.09.2026 (§11 карты
 * раздела). Суть — нейтральный текст о том, что человек хочет рассказать: без
 * площадки и без манеры. Из неё потом делают адаптации, поэтому аватар в неё
 * не идёт — иначе манера применилась бы дважды, к сути и к адаптации.
 *
 * Три вещи этот файл держит и не отдаёт:
 *
 *  - **слова человека переносятся дословно**. Это единственное правило волны,
 *    которое владелец назвал «усилить до предела, если через заготовку выйдет
 *    ровнее»: суть начинается с той фразы автора, которая ближе всего к
 *    тезису, и его числа, имена и примеры не переформулируются;
 *  - **чужой текст сюда не попадает ни одним полем**. Ни целиком, ни отрезком:
 *    в промпт едут тема, угол, строение и утверждения, которые разбор уже
 *    пересказал своими словами. Отрезки исходника нужны только антикопии,
 *    которая сравнивает уже написанное, а в промпте они были бы тем самым
 *    чужим текстом, ради отсутствия которого всё и делается;
 *  - **отказ модели не валит вход**. Суть тогда собирается детерминированно
 *    из брифа и помечается `writtenBy: 'fallback'`: черновики человек всё
 *    равно получит, а квитанция честно скажет, кто писал.
 *
 * Цена: один `getChatModel(…, 'draft')` под операцией `intake`. Второй заход
 * бывает ровно в одном случае — если суть по чужому посту унесла восемь слов
 * подряд из исходника; он идёт внутри той же операции, тем же ходом, каким это
 * делает граф генератора (`repairForeignCopy`), и без чужого поста не бывает
 * никогда.
 */

import { z } from 'zod';
import { getChatModel } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import type { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import type {
  BriefFilledV1,
  PieceAnswerV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PIECE_CORE_VERSION } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { forbiddenPhrasesRule } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/forbidden-phrases';
import {
  ANTI_COPY_MIN_WORDS,
  antiCopyReport,
} from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/anti-copy';
import { oneLine } from '../intake/intake.prompts';
import { ownRefutedBySearch } from './piece-facts.v2';
import { stripCitationLabels } from '../text-quality/citation-labels';

/** По какой площадке считаются пороги штампов у нейтральной сути. */
export const CORE_SLOP_PLATFORM = 'core';

/**
 * Шов проверки на штампы — тот же, что у входа одной мыслью.
 *
 * Последний довод необязателен (`content-factory-next-97dq.10`): опоры — это
 * материал, из которого суть и написана, а порт из набора о них знать не обязан.
 */
export type CoreSlopCheck = (
  text: string,
  platform: string,
  locale: 'ru' | 'en',
  grounded?: readonly string[]
) => SlopReportV1 | null;

/** Взятое из чужого текста. Сам текст сюда не кладётся никогда. */
export type CoreBorrowedV1 = {
  topic: string;
  angle: string;
  structure: string[];
  /** Утверждения, уже пересказанные разбором своими словами. */
  claims: string[];
};

export type CoreWriteInputV1 = {
  organizationId: string;
  language: 'ru' | 'en';
  brief: BriefFilledV1;
  /** Ответы интервью, дословно, с вопросами, на которые они отвечают. */
  answers: PieceAnswerV1[];
  questionTextByKey: Partial<Record<string, string>>;
  /** Слова человека: мысль или ссылка с комментарием. Для чужого поста и задания — пусто. */
  personText: string;
  /**
   * Задание (`97dq.29`): описание поста, который человек хочет, и ссылки из
   * него, которые велено сохранить. Едет своими блоками, а не как «слова
   * человека»: фразы задания в текст не переносятся, ссылки — дословно.
   */
  instruction?: { text: string; links: readonly string[] } | null;
  /** Existing core to enrich; never attributed as fresh author input. */
  existingCore?: string;
  /**
   * «Пересобрать суть» (`97dq.85`): the core on the page now. Written from
   * the same input, so the rebuild keeps what it carried from it; `byPerson`
   * — the author edited it by hand and its words are theirs. Replaces
   * `existingCore` when both are given.
   */
  rebuildFrom?: { text: string; byPerson: boolean } | null;
  /**
   * What the author added after the first core (`97dq.75`), oldest first. The
   * same words are the tail of `personText`; in the prompt they get their own
   * block so a rebuild can weave them in.
   */
  addedMaterial?: readonly string[];
  /**
   * Вопросы, которые человек отдал модели и по которым решения ещё нет
   * (`97dq.56`). Модель решает их тем же вызовом и возвращает в `decisions`.
   * `authorMaterial` — вопрос о том, что знает только автор (его случай, что он
   * сделал, его числа): решение по нему — рамка, а не выдуманный случай.
   */
  delegated?: readonly CoreDelegatedV1[];
  /**
   * What a handed question may be answered with (`97dq.99`): the policy of
   * the avatar the piece speaks as (`voice.delegatedPolicy`). Absent is
   * `knowledge` — explanations and advice, never an invented experience.
   */
  delegatedPolicy?: DelegatedPolicyV1;
  borrowed: CoreBorrowedV1 | null;
  /** Отпечатки чужого текста по восемь слов; только для сверки после ответа. */
  foreignShingles: readonly string[];
};

export type CoreWriteDepsV1 = {
  aiUsage: Pick<AiUsageService, 'executeAiOperation'>;
  slopCheck: CoreSlopCheck | null;
  /** Куда писать про отказ модели. Необязательно: без него молча fallback. */
  warn?: (message: string) => void;
};

export type CoreDelegatedV1 = {
  /** Ключ вопроса о материале (`ask-<n>`) или поле брифа. */
  key: string;
  question: string;
  authorMaterial: boolean;
};

/** Решение модели по отданному вопросу, уже проверенное здесь. */
export type CoreDecisionV1 = { key: string; text: string };

export const coreSchema = z.object({
  text: z
    .string()
    .describe(
      'The neutral core: plain text, paragraphs separated by a blank line'
    ),
  decisions: z
    .array(
      z.object({
        key: z.string().describe('The key of a question handed to the model'),
        text: z
          .string()
          .describe(
            'What was decided and what the core now says in answer; never a number, quote or named source that is not in the input'
          ),
      })
    )
    .nullable()
    .optional()
    .describe('One decision per question handed to the model; empty when none was handed over'),
});

/** Сколько знаков решения храним: это одно-три предложения, а не текст. */
export const CORE_DECISION_MAX_CHARS = 600;

const DIGIT_RUN = /\p{Nd}+/gu;

/**
 * Решения модели, которые можно хранить (`97dq.56`).
 *
 * Только по отданным ключам, по одному на ключ, одной строкой. Решение с
 * числом, которого нет во входе, выбрасывается целиком: число за человека —
 * ровно та выдумка, которую решение нести не может, а честное «модель не
 * решила» лучше подделанного факта в «Что мы поняли».
 */
export const coreDecisionsOf = (
  value: unknown,
  delegated: readonly CoreDelegatedV1[],
  grounded: readonly string[]
): CoreDecisionV1[] => {
  const keys = new Set(delegated.map((item) => item.key));
  const material = grounded.join('\n');
  const known = new Set(material.match(DIGIT_RUN) ?? []);
  const byKey = new Map<string, string>();
  for (const raw of Array.isArray(value) ? value : []) {
    const key = trimmed((raw as any)?.key);
    if (!keys.has(key) || byKey.has(key)) continue;
    const text = stripCitationLabels(oneLine(trimmed((raw as any)?.text)))
      .trim()
      .slice(0, CORE_DECISION_MAX_CHARS)
      .trim();
    if (!text) continue;
    if ((text.match(DIGIT_RUN) ?? []).some((run) => !known.has(run))) continue;
    byKey.set(key, text);
  }
  return [...byKey].map(([key, text]) => ({ key, text }));
};

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const HAS_DIGIT = /\p{Nd}/u;

/** Подтверждено поиском или памятью, либо написано самим человеком. */
export const isOwnOrConfirmed = (fact: {
  verified: boolean;
  origin: BriefFilledV1['facts'][number]['origin'];
  kind?: BriefFilledV1['facts'][number]['kind'];
  selected?: boolean;
}): boolean =>
  fact.verified ||
  fact.origin === 'person' ||
  (fact.origin === 'input' && fact.kind !== 'external') ||
  (fact.selected === true && fact.kind !== 'external');

const URL = /https?:\/\/[^\s<>()]+/giu;
const SERVICE_LEAD =
  /^(?:вот\s+ссылка(?:\s+на[^:,.!?]*)?|см\.?|смотрите|источник|source|here(?:'s|\s+is)\s+the\s+link|see)\s*[:—-]?\s*/iu;
const INTENT_LEAD =
  /^(?:я\s+бы\s+хотел(?:а)?\s+(?:на)?писать\s+о|i(?:'d|\s+would)\s+like\s+to\s+write\s+about)\s+/iu;

/** Адрес и фраза-передатчик не являются словами для будущей статьи. */
export const editorialAnswerText = (value: unknown): string => {
  const raw = typeof value === 'string' ? value : '';
  const withoutUrl = raw.replace(URL, ' ').replace(/\s+/gu, ' ').trim();
  if (!withoutUrl) return '';
  const withoutIntent = withoutUrl.replace(INTENT_LEAD, '').trim();
  return SERVICE_LEAD.test(withoutIntent)
    ? withoutIntent.replace(SERVICE_LEAD, '').trim()
    : withoutIntent;
};

/**
 * Принёс ли автор хотя бы одно своё число.
 *
 * Считается по словам человека и его ответам, а не по сути: число, которое
 * приписала модель, авторским не становится оттого, что оказалось в тексте.
 */
export const authorNumbersIn = (
  personText: string,
  answers: readonly PieceAnswerV1[]
): boolean =>
  HAS_DIGIT.test(editorialAnswerText(personText)) ||
  answers.some(
    (answer) =>
      answer.origin !== 'model' && HAS_DIGIT.test(editorialAnswerText(answer.text))
  );

/* -------------------------------------------------------------------------
 * Промпт
 * ---------------------------------------------------------------------- */

const START = '--- BLOCK START ---';
const END = '--- BLOCK END ---';

/**
 * Огороженный блок, по образцу `untrustedBlock` из разбора чужого текста.
 *
 * Каждая строка внутри сведена к одной: блок размечен переводами строк, и
 * вставленный текст со своей строкой «--- BLOCK END ---» подделал бы границу.
 */
const fenced = (title: string, lines: string[]): string =>
  lines.length
    ? [title, START, ...lines.map((line) => oneLine(line)).filter(Boolean), END].join('\n')
    : '';

/**
 * Своё слово, по которому поиск вынес вердикт, и вердикт не «подтверждено».
 *
 * Единственный источник правды здесь — сама строка, а не список
 * `brief.ungrounded`: `ungrounded` из этих же строк и считается
 * (`ungroundedStatements`), и сверяться с производным списком значило бы
 * завести второй счёт того же самого — ровно тот способ, которым «25 тысяч»
 * однажды уже уехали в суть подтверждёнными.
 *
 * «Поиск ходил» читается по его следам на строке (`searchRuledOn`), а не по
 * `status` (`content-factory-next-97dq.32`, P1). До этой правки здесь стояло
 * «любой статус, кроме confirmed, — вердикт поиска», а вход ставит своим
 * строкам «не проверено» сразу, без всякого поиска: мысль про Исландию без
 * ресерча отправила все три своих числа в блок «не подтвердилось поиском»,
 * правило системы запретило их печатать, и суть сжалась до одной фразы без
 * единой цифры. Мысль, к которой ничего не искали, от ресерча не меняется
 * вовсе: своё слово человека стоит под «факты подтверждённые» (§9.5).
 */
const searchRefuted = ownRefutedBySearch;

export const corePrompt = (input: CoreWriteInputV1): string => {
  const words = CORE_WRITE_BLOCK_TITLES_V15;
  /*
    Дополнение или первая суть — это один вопрос и один ответ на него
    (`content-factory-next-97dq.2`): существующая суть есть ровно тогда, когда
    человек нажал «Дополнить ресерчем». От него зависят и правила системы, и
    блоки ниже, поэтому спрашивается он один раз.
  */
  const rebuild = trimmed(input.rebuildFrom?.text) ? input.rebuildFrom! : null;
  const enrichment = !rebuild && Boolean(trimmed(input.existingCore));
  const added = (input.addedMaterial ?? [])
    .map((text) => editorialAnswerText(text))
    .filter(Boolean);
  // Дописанное едет своим блоком; в «словах человека» остаётся то, с чего
  // заготовка началась, чтобы одно и то же не стояло дважды.
  const personWords = editorialAnswerText(
    added.length
      ? personTextWithoutAdded(input.personText, input.addedMaterial ?? [])
      : input.personText
  );
  const brief = input.brief;
  const said = input.answers.filter((answer) => answer.origin !== 'model');
  /*
    Решения модели по отданным вопросам (`97dq.56`): своим блоком и с
    подписью, а не среди ответов — это выбор редактора, а не слово человека.
  */
  const decisions = input.answers.filter(
    (answer) => answer.origin === 'model' && editorialAnswerText(answer.text)
  );
  const delegated = input.delegated ?? [];
  const proposal = (field: 'thesis' | 'position' | 'audience') =>
    brief.origins?.[field] === 'model' ? ` (${words.modelProposal})` : '';

  /*
    Отмеченное человеком — ещё не подтверждённое (`content-factory-next-97dq.14`,
    P3, версия промпта `core-write/v6`).

    Галочка говорит «возьми это в текст», и только. Подтверждает строку либо
    источник (`verified`), либо сам человек, написавший её своими словами
    (`origin` `input`/`person` — §9.5 карты раздела). Строка-поправка, которую
    источник подтвердил не целиком, приходит сюда `selected: true`,
    `verified: false`, `origin: 'search'` — и до v6 печаталась под «факты
    подтверждённые», хотя квитанция в тот же миг называла её в `ungrounded`.
    Теперь она стоит один раз и там, где ей место: в блоке взятого из ресерча.
  */
  /*
    Чужое утверждение со ссылкой и без подтверждения — «заимствованное», чья
    бы рука его ни принесла (`97dq.19`): человек, давший чужое число со
    ссылкой, печатался и под «подтверждёнными», и под «заимствованными».
  */
  const borrowedFacts = brief.facts.filter(
    (fact) =>
      fact.kind === 'external' &&
      Boolean(fact.sourceUrl) &&
      !fact.verified
  );
  const ownOrConfirmed = brief.facts.filter(
    (fact) =>
      !borrowedFacts.includes(fact) &&
      isOwnOrConfirmed(fact) &&
      !(fact.origin === 'person' && !fact.sourceUrl) &&
      !(
        fact.selected === true &&
        !fact.verified &&
        fact.origin !== 'input' &&
        fact.origin !== 'person'
      )
  );
  /*
    Своё число, которое поиск опроверг или не нашёл
    (`content-factory-next-97dq.22`, P1, версия промпта `core-write/v7`).

    §9.5 карты раздела остаётся: своё утверждение подтверждено в момент, когда
    человек его написал, — до тех пор, пока по нему не сходили в источник.
    Сходили и не подтвердили — строка уходит из блока подтверждённого в свой
    блок вместе с заметкой источника, и правило системы запрещает выдавать её
    число за факт. Раньше обе строки исландской мысли («25 тысяч», «40%»)
    стояли под «факты подтверждённые», хотя квитанция называла их в
    `ungrounded`.
  */
  const confirmedFacts = ownOrConfirmed.filter((fact) => !searchRefuted(fact));
  const unconfirmedOwnFacts = ownOrConfirmed.filter(searchRefuted);
  /*
    Отмеченное, но не подтверждённое — дополнение к двум блокам выше, а не
    второй положительный признак (`content-factory-next-97dq.19`, рецензия
    второго выпуска, P2-3). Прежний фильтр требовал `kind: 'found'` или
    `origin: 'search'`, и отмеченная строка с `origin` `memory`, `avatar` или
    `model` без подтверждения не попадала ни в один блок — пропадала из
    промпта молча. Сегодня такой строки не пишет ни один производитель, но
    бриф хранится без миграции. Теперь у «отмечено, не подтверждено» всегда
    есть место, и ни одна строка не стоит в двух блоках.
  */
  const selectedResearchFacts = brief.facts.filter(
    (fact) =>
      fact.selected === true &&
      !fact.verified &&
      fact.origin !== 'input' &&
      fact.origin !== 'person' &&
      !ownOrConfirmed.includes(fact) &&
      !borrowedFacts.includes(fact)
  );
  const briefLines = [
    editorialAnswerText(brief.thesis)
      ? `${words.thesis}${proposal('thesis')}: ${editorialAnswerText(brief.thesis)}`
      : '',
    editorialAnswerText(brief.position)
      ? `${words.position}${proposal('position')}: ${editorialAnswerText(brief.position)}`
      : '',
    editorialAnswerText(brief.disagreement)
      ? `${words.disagreement}: ${editorialAnswerText(brief.disagreement)}`
      : '',
    editorialAnswerText(brief.audience)
      ? `${words.audience}${proposal('audience')}: ${editorialAnswerText(brief.audience)}`
      : '',
    /**
     * Что считается подтверждённым для сути: сверенное поиском или памятью и
     * слово самого человека, по которому поиск не выносил вердикта (§9.5 карты
     * раздела: своё утверждение подтверждено в момент, когда он его написал).
     * Своё, которое поиск опроверг или не нашёл, стоит ниже своим блоком.
     * Остальное — чужие числа без опоры — в промпт не кладётся вовсе, а не
     * помечается: модели нечего унести из того, чего она не видела. Квитанция
     * показывает их строкой `ungrounded`.
     */
    ...confirmedFacts.map((fact) => `${words.confirmed}: ${fact.statement}`),
    /**
     * Заметка источника едет рядом со строкой: в ней написано, что источник
     * сказал вместо этого числа, и только по ней модель может взять
     * исправленное значение, не выдумывая его.
     */
    ...unconfirmedOwnFacts.map(
      (fact) =>
        `${words.unconfirmed}: ${fact.statement}${
          trimmed(fact.note) ? ` — ${trimmed(fact.note)}` : ''
        }`
    ),
    ...selectedResearchFacts.map(
      (fact) => `${words.research}: ${fact.statement}`
    ),
    ...borrowedFacts.map(
      (fact) => `${words.borrowed}: ${fact.statement}`
    ),
  ].filter(Boolean);

  const borrowedLines = input.borrowed
    ? [
        input.borrowed.topic ? `${words.topic}: ${input.borrowed.topic}` : '',
        input.borrowed.angle ? `${words.angle}: ${input.borrowed.angle}` : '',
        ...input.borrowed.structure
          .slice(0, 8)
          .map((step) => `${words.structure}: ${step}`),
        ...input.borrowed.claims
          .slice(0, 12)
          .map((claim) => `${words.claims}: ${claim}`),
      ].filter(Boolean)
    : [];

  /*
    Есть ли у этой сути ресерч (`content-factory-next-97dq.22`).

    Считается по строкам брифа, а не по кнопке: находки приезжают и на входе,
    до всякого «Дополнить ресерчем», и тогда суть пишется первый раз, а
    материал для неё уже принесён и отмечен руками. Отмеченная находка и
    подтверждённая поиском строка — это и есть ресерч; неподтверждённое своё
    сюда не входит, опорой оно не работает.
  */
  const researchPresent =
    selectedResearchFacts.length > 0 ||
    confirmedFacts.some((fact) => fact.origin === 'search');

  const instruction = trimmed(input.instruction?.text) ? input.instruction! : null;

  return [
    coreWriteSystemV15(input.language, forbiddenPhrasesRule(input.language), {
      rebuild: Boolean(rebuild),
      delegated: delegated.length > 0,
      // Decisions from an earlier round are handed questions too: a rebuild
      // or an enrichment keeps the policy the first core was written under.
      handed: delegated.length > 0 || decisions.length > 0,
      ...(input.delegatedPolicy ? { policy: input.delegatedPolicy } : {}),
      instruction: Boolean(instruction),
      enrichment,
      firstWithResearch: !enrichment && researchPresent,
      unconfirmed: unconfirmedOwnFacts.length > 0,
      // Тема и угол есть у любого разбора; правило об исходном материале
      // нужно тогда, когда из него есть что взять — утверждения или строение.
      foreign: Boolean(
        input.borrowed &&
          (input.borrowed.claims.length || input.borrowed.structure.length)
      ),
    }),
    '',
    `PROMPT VERSION: ${CORE_WRITE_PROMPT_VERSION}`,
    instruction ? fenced(words.instruction, [trimmed(instruction.text)]) : '',
    instruction && instruction.links.length
      ? fenced(words.links, [...instruction.links])
      : '',
    fenced(words.person, personWords ? [personWords] : []),
    fenced(words.added, added),
    fenced(
      words.answers,
      said.map(
        (answer) =>
          // Вопрос модели едет с ответом (`97dq.44`): у него нет шаблона.
          `${input.questionTextByKey[answer.key] || answer.question || answer.key} → ${editorialAnswerText(answer.text)}`
      )
      .filter((line) => !line.endsWith('→ '))
    ),
    fenced(
      words.decisions,
      decisions.map(
        (answer) =>
          `${input.questionTextByKey[answer.key] || answer.question || answer.key} → ${editorialAnswerText(answer.text)}`
      )
    ),
    fenced(
      words.delegated,
      delegated.map(
        (item) =>
          `[${item.key}] ${item.question}${
            item.authorMaterial ? ` (${words.authorMaterial})` : ''
          }`
      )
    ),
    fenced(words.brief, [...briefLines, ...borrowedLines]),
    rebuild
      ? fenced(
          rebuild.byPerson ? words.previousByPerson : words.previous,
          // По абзацу на строку: блок сводит каждую строку к одной.
          rebuild.text.split(/\n\s*\n/u)
        )
      : '',
    enrichment ? CORE_WRITE_ENRICH_LEAD_V15 : '',
    enrichment
      ? fenced(words.existing, [input.existingCore as string])
      : '',

  ]
    .filter(Boolean)
    .join('\n\n');
};

/* -------------------------------------------------------------------------
 * Детерминированная суть
 * ---------------------------------------------------------------------- */

/**
 * Суть без модели: тезис, подтверждённые факты и позиция, и ничего больше.
 *
 * Собрана только из того, что уже написано словами человека или подтверждено.
 * Ни одной связки от себя: связки — это и есть работа модели, и подделывать её
 * детерминированно значило бы писать за автора.
 */
export const fallbackCore = (
  brief: BriefFilledV1,
  answers: readonly PieceAnswerV1[],
  personText: string
): string => {
  const said = answers.filter((answer) => answer.origin !== 'model');
  const parts = [
    editorialAnswerText(brief.thesis) ||
      editorialAnswerText(
        said.find((answer) => answer.key === 'key_idea')?.text ?? ''
      ) ||
      editorialAnswerText(personText),
    /*
      Своё, которое поиск опроверг или не нашёл, в запасную суть не входит
      (`content-factory-next-97dq.32`): у промпта для него свой блок с
      запретом, а здесь блоков нет, и строка напечаталась бы как факт —
      «выросла на 40%», которого ресерч не нашёл. Поправка источника
      (`origin: 'search'`) — не слово человека и входит, как и прежде.
    */
    ...brief.facts
      .filter((fact) => isOwnOrConfirmed(fact) && !ownRefutedBySearch(fact))
      .map((fact) => fact.statement),
    ...said
      .filter((answer) => answer.key === 'personal_detail')
      .map((answer) => editorialAnswerText(answer.text)),
    editorialAnswerText(brief.position),
  ]
    .map((part) => trimmed(part))
    .filter(Boolean);
  return [...new Set(parts)].join('\n\n');
};

/* -------------------------------------------------------------------------
 * Ход
 * ---------------------------------------------------------------------- */

/**
 * На чём стоит суть: слова человека, его ответы и опоры брифа.
 *
 * `content-factory-next-97dq.10`, решение владельца 18.09.2026. Ровно тот
 * материал, который уехал в промпт: число из него — это факт автора, а не
 * размытое количество, и правило `vague-quantity` о нём молчит. Чужое
 * утверждение без подтверждения сюда не попадает — в промпт оно тоже едет
 * помеченным, и обосновывать им число значило бы называть проверенным
 * непроверенное.
 */
export const coreGrounded = (input: CoreWriteInputV1): string[] =>
  [
    input.personText,
    /*
      The author's hand-edited core is their words too (review of 97dq.81-85,
      P3-1): the rebuild is told to keep the numbers of that edit, and the
      check on the rebuilt core must not call those same numbers vague or
      ungrounded. A model-written previous core grounds nothing.
    */
    input.rebuildFrom?.byPerson ? input.rebuildFrom.text : '',
    // Задание и его ссылки — тоже опора (`97dq.29`): число из задания и адрес,
    // который велено сохранить, стоят в сути по слову человека.
    input.instruction?.text ?? '',
    ...(input.instruction?.links ?? []),
    ...input.answers
      .filter((answer) => answer.origin !== 'model')
      .map((answer) => answer.text),
    ...input.brief.facts
      .filter((fact) => isOwnOrConfirmed(fact) || fact.selected === true)
      .map((fact) => fact.statement),
  ]
    .map((line) => trimmed(line))
    .filter(Boolean);

/**
 * Суть заготовки: один вызов, проверка на штампы и честная пометка автора.
 */
export async function writeCore(
  input: CoreWriteInputV1,
  deps: CoreWriteDepsV1
): Promise<ZagotovkaCoreV1> {
  return (await writeCoreWithDecisions(input, deps)).core;
}

/**
 * Суть и решения по отданным вопросам — одним вызовом (`97dq.56`).
 *
 * Решения приходят тем же ответом модели, что и суть: второго похода к
 * модели ради «Решите за меня» нет. Без модели решений нет вовсе — запасная
 * суть собирается из слов человека, и решать за него ей нечем.
 */
export async function writeCoreWithDecisions(
  input: CoreWriteInputV1,
  deps: CoreWriteDepsV1
): Promise<{ core: ZagotovkaCoreV1; decisions: CoreDecisionV1[] }> {
  const grounded = coreGrounded(input);
  const delegated = input.delegated ?? [];
  let decided: unknown = null;
  const slop = (text: string): SlopReportV1 | null =>
    text && deps.slopCheck
      ? deps.slopCheck(text, CORE_SLOP_PLATFORM, input.language, grounded)
      : null;

  const shaped = (text: string, writtenBy: 'model' | 'fallback'): ZagotovkaCoreV1 => ({
    version: PIECE_CORE_VERSION,
    text,
    brief: input.brief,
    answers: input.answers,
    slop: slop(text),
    writtenBy,
    authorNumbers:
      authorNumbersIn(input.personText, input.answers) ||
      Boolean(
        input.rebuildFrom?.byPerson &&
          authorNumbersIn(input.rebuildFrom.text, [])
      ),
  });

  let text = '';
  try {
    text = await deps.aiUsage.executeAiOperation(
      input.organizationId,
      'intake',
      async () => {
        const model = (
          await getChatModel(input.organizationId, 0, 2_048, 'draft')
        ).withStructuredOutput(coreSchema);
        const prompt = corePrompt(input);
        const answer = (await model.invoke(prompt)) as any;
        decided = answer?.decisions ?? null;
        const first = trimmed(answer?.text);
        /*
          Один повторный заход с подсказкой; берётся второй текст, если он
          есть, и решения вместе с ним. Дальше находка остаётся находкой —
          переписывать текст за человека здесь нечем и незачем.
        */
        const rewrite = async (hint: string, current: string) => {
          const repaired = (await model.invoke(`${prompt}\n\n${hint}`)) as any;
          const next = trimmed(repaired?.text);
          if (next && Array.isArray(repaired?.decisions)) {
            decided = repaired.decisions;
          }
          return next || current;
        };
        let result = first;
        /** Отрезки чужого поста в тексте; пусто, когда сверять не с чем. */
        const copiedRuns = (text: string) =>
          input.foreignShingles.length && text
            ? antiCopyReport(text, input.foreignShingles, {
                minWords: ANTI_COPY_MIN_WORDS,
              }).runs
            : [];
        // Антикопия ровно та же, что у графа: восемь слов подряд и один
        // повторный заход.
        let antiCopyHint = '';
        const copied = copiedRuns(result);
        if (copied.length) {
          const quoted = copied.map((run) => `«${run.text}»`).join(', ');
          antiCopyHint = `${CORE_WRITE_REPAIR_V15}${quoted}`;
          result = await rewrite(antiCopyHint, result);
        }
        // Речь о тексте вместо текста (`97dq.90`): одна перепись.
        const meta = result ? metaSpeechIn(stripCitationLabels(result)) : [];
        if (meta.length) {
          deps.warn?.(`The core talked about its input; rewriting once: ${meta.join(' | ')}`);
          /*
            Ревью W1 пятнадцатого захода, F7: перепись начинается с того же
            промпта, поэтому подсказка антикопии идёт в неё вместе со своей —
            иначе снятый повтор чужого поста возвращался. И проверка
            антикопии после неё повторяется: текст, в котором чужих слов
            больше, чем было до переписи, не берётся.
          */
          const before = result;
          const decidedBefore = decided;
          const beforeRuns = copiedRuns(before).length;
          const metaHint = `${CORE_WRITE_META_REPAIR_V15}${meta.map((hit) => `«${hit}»`).join(', ')}`;
          const next = await rewrite(
            antiCopyHint ? `${antiCopyHint}\n\n${metaHint}` : metaHint,
            before
          );
          if (next !== before && copiedRuns(next).length > beforeRuns) {
            deps.warn?.(
              'The meta-speech rewrite of the core repeated the source post; keeping the text before it'
            );
            decided = decidedBefore;
          } else {
            result = next;
          }
        }
        return result;
      },
      'draft'
    );
  } catch (error) {
    deps.warn?.(
      `The core of a piece was assembled without the model: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    text = '';
  }

  // Промпт сути меток не выдаёт, но опоры, из которых она пишется, приходят
  // из ответов модели брифа и разбора ресерча, где метки есть
  // (`content-factory-next-97dq.40`). Суть человек читает и правит — меток
  // источника в ней не бывает ни при каком ответе.
  text = trimmed(stripCitationLabels(text));
  if (text) {
    return {
      core: shaped(text, 'model'),
      decisions: coreDecisionsOf(decided, delegated, grounded),
    };
  }
  // Без модели ссылки из задания всё равно не теряются: последним абзацем.
  const keptLinks = input.instruction?.links ?? [];
  return {
    core: shaped(
      [
        contentFromIntent(fallbackCore(input.brief, input.answers, input.personText)),
        keptLinks.join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n'),
      'fallback'
    ),
    decisions: [],
  };
}
