import { contentFromIntent } from '../intake/intake-content';
import {
  CORE_WRITE_BLOCK_TITLES_V6,
  CORE_WRITE_ENRICH_LEAD_V6,
  CORE_WRITE_PROMPT_VERSION,
  CORE_WRITE_REPAIR_V6,
  coreWriteSystemV6,
} from './core-write-prompt.v6';
export { CORE_WRITE_PROMPT_VERSION } from './core-write-prompt.v6';
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
  /** Слова человека: мысль или ссылка с комментарием. Для чужого поста — пусто. */
  personText: string;
  /** Existing core to enrich; never attributed as fresh author input. */
  existingCore?: string;
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

export const coreSchema = z.object({
  text: z
    .string()
    .describe(
      'The neutral core: plain text, paragraphs separated by a blank line'
    ),
});

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

export const corePrompt = (input: CoreWriteInputV1): string => {
  const words = CORE_WRITE_BLOCK_TITLES_V6[input.language];
  /*
    Дополнение или первая суть — это один вопрос и один ответ на него
    (`content-factory-next-97dq.2`): существующая суть есть ровно тогда, когда
    человек нажал «Дополнить ресерчем». От него зависят и правила системы, и
    блоки ниже, поэтому спрашивается он один раз.
  */
  const enrichment = Boolean(trimmed(input.existingCore));
  const brief = input.brief;
  const said = input.answers.filter((answer) => answer.origin !== 'model');

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
  const confirmedFacts = brief.facts.filter(
    (fact) =>
      isOwnOrConfirmed(fact) &&
      !(fact.origin === 'person' && !fact.sourceUrl) &&
      !(
        fact.selected === true &&
        !fact.verified &&
        fact.origin !== 'input' &&
        fact.origin !== 'person'
      )
  );
  const selectedResearchFacts = brief.facts.filter(
    (fact) =>
      fact.selected === true &&
      (fact.kind === 'found' || fact.origin === 'search') &&
      !fact.verified &&
      fact.origin !== 'input' &&
      fact.origin !== 'person'
  );
  const borrowedFacts = brief.facts.filter(
    (fact) =>
      fact.kind === 'external' &&
      Boolean(fact.sourceUrl) &&
      !fact.verified
  );
  const briefLines = [
    editorialAnswerText(brief.thesis)
      ? `${words.thesis}: ${editorialAnswerText(brief.thesis)}`
      : '',
    editorialAnswerText(brief.position)
      ? `${words.position}: ${editorialAnswerText(brief.position)}`
      : '',
    editorialAnswerText(brief.disagreement)
      ? `${words.disagreement}: ${editorialAnswerText(brief.disagreement)}`
      : '',
    editorialAnswerText(brief.audience)
      ? `${words.audience}: ${editorialAnswerText(brief.audience)}`
      : '',
    /**
     * Что считается подтверждённым для сути: сверенное поиском или памятью и
     * слово самого человека (§9.5 карты раздела: своё утверждение подтверждено
     * в момент, когда он его написал). Остальное — чужие числа без опоры — в
     * промпт не кладётся вовсе, а не помечается: модели нечего унести из того,
     * чего она не видела. Квитанция показывает их строкой `ungrounded`.
     */
    ...confirmedFacts.map((fact) => `${words.confirmed}: ${fact.statement}`),
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

  return [
    coreWriteSystemV6(
      input.language,
      forbiddenPhrasesRule(input.language),
      { enrichment }
    ),
    '',
    `PROMPT VERSION: ${CORE_WRITE_PROMPT_VERSION}`,
    fenced(
      words.person,
      editorialAnswerText(input.personText)
        ? [editorialAnswerText(input.personText)]
        : []
    ),
    fenced(
      words.answers,
      said.map(
        (answer) =>
          `${input.questionTextByKey[answer.key] || answer.key} → ${editorialAnswerText(answer.text)}`
      )
      .filter((line) => !line.endsWith('→ '))
    ),
    fenced(words.brief, [...briefLines, ...borrowedLines]),
    enrichment ? CORE_WRITE_ENRICH_LEAD_V6[input.language] : '',
    enrichment
      ? fenced(
          input.language === 'ru' ? 'Существующая суть' : 'Existing core',
          [input.existingCore as string]
        )
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
    ...brief.facts.filter(isOwnOrConfirmed).map((fact) => fact.statement),
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
  const grounded = coreGrounded(input);
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
    authorNumbers: authorNumbersIn(input.personText, input.answers),
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
        const first = trimmed(((await model.invoke(prompt)) as any)?.text);
        if (!input.foreignShingles.length || !first) return first;
        // Антикопия ровно та же, что у графа: восемь слов подряд и один
        // повторный заход. Дальше находка остаётся находкой — переписывать
        // текст за человека здесь нечем и незачем.
        const report = antiCopyReport(first, input.foreignShingles, {
          minWords: ANTI_COPY_MIN_WORDS,
        });
        if (report.clean) return first;
        const quoted = report.runs.map((run) => `«${run.text}»`).join(', ');
        const second = trimmed(
          ((await model.invoke(
            `${prompt}\n\n${CORE_WRITE_REPAIR_V6[input.language]}${quoted}`
          )) as any)?.text
        );
        return second || first;
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

  if (text) return shaped(text, 'model');
  return shaped(
    contentFromIntent(fallbackCore(input.brief, input.answers, input.personText)),
    'fallback'
  );
}
