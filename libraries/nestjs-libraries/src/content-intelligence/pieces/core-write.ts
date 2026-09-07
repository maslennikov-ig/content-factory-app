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

/** Шов проверки на штампы — тот же, что у входа одной мыслью. */
export type CoreSlopCheck = (
  text: string,
  platform: string,
  locale: 'ru' | 'en'
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
}): boolean => fact.verified || fact.origin === 'input' || fact.origin === 'person';

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
  HAS_DIGIT.test(personText) ||
  answers.some(
    (answer) => answer.origin !== 'model' && HAS_DIGIT.test(answer.text)
  );

/* -------------------------------------------------------------------------
 * Промпт
 * ---------------------------------------------------------------------- */

const RU_SYSTEM = (rule: string): string =>
  [
    'Ты пишешь СУТЬ: нейтральный текст о том, что человек хочет рассказать, без площадки и без манеры. Это не пост и не пересказ брифа — это опора, из которой потом сделают тексты под разные площадки.',
    'Правила, все обязательные:',
    '1) фразы, числа, имена и примеры из слов человека переносятся ДОСЛОВНО, как написаны, с их опечатками и шероховатостями; не переформулируй и не улучшай их; достраивай только связки между ними;',
    '2) ничего не добавляй сверх брифа и фактов с пометкой «подтверждено»: число, которого нет во входе, не пиши; пример, которого не было, не выдумывай;',
    '3) запрещены сглаживание, вводные обороты, обобщения вместо частностей, выводы «в итоге» и «таким образом», призывы и вопросы читателю;',
    '4) если слов человека мало — суть короткая; короткая правда лучше длинного пересказа; три предложения — нормальная суть;',
    '5) начинай с той фразы человека, которая ближе всего к тезису, — дословно;',
    '6) без разметки, эмодзи, заголовков и списков; абзацы через пустую строку; язык — язык ввода;',
    `7) ${rule}`,
  ].join('\n');

const EN_SYSTEM = (rule: string): string =>
  [
    'You are writing the CORE: a neutral text about what this person wants to tell, with no platform and no manner. It is not a post and not a retelling of the brief — it is the ground that texts for different platforms will later be made from.',
    'Rules, all of them binding:',
    "1) phrases, numbers, names and examples from the person's words are carried over VERBATIM, as written, with their typos and rough edges; do not rephrase them and do not improve them; build only the joins between them;",
    '2) add nothing beyond the brief and the facts marked «confirmed»: a number that is not in the input is not written; an example that was not there is not invented;',
    '3) smoothing over, introductory turns of phrase, generalities in place of particulars, «in the end» and «thus» conclusions, calls to action and questions to the reader are forbidden;',
    '4) if the person gave few words, the core is short; a short truth beats a long retelling; three sentences is a normal core;',
    "5) begin with the person's own phrase that stands closest to the claim — verbatim;",
    '6) no markup, no emoji, no headings, no lists; paragraphs separated by a blank line; the language is the language of the input;',
    `7) ${rule}`,
  ].join('\n');

const BLOCK_TITLES = {
  ru: {
    person: 'СЛОВА ЧЕЛОВЕКА (дословно)',
    answers: 'ОТВЕТЫ НА ВОПРОСЫ (дословно)',
    brief: 'БРИФ (что модель поняла)',
    thesis: 'тезис',
    position: 'позиция',
    disagreement: 'возражение',
    audience: 'адресат',
    confirmed: 'факты подтверждённые',
    topic: 'тема чужого поста',
    angle: 'угол чужого поста',
    structure: 'строение чужого поста',
    claims: 'что чужой пост утверждает (пересказ, не его слова)',
  },
  en: {
    person: 'THE PERSON’S WORDS (verbatim)',
    answers: 'ANSWERS TO QUESTIONS (verbatim)',
    brief: 'BRIEF (what the model understood)',
    thesis: 'claim',
    position: 'position',
    disagreement: 'objection',
    audience: 'written for',
    confirmed: 'confirmed facts',
    topic: 'topic of the pasted post',
    angle: 'angle of the pasted post',
    structure: 'structure of the pasted post',
    claims: 'what the pasted post claims (a retelling, not its words)',
  },
} as const;

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
  const words = BLOCK_TITLES[input.language];
  const brief = input.brief;
  const said = input.answers.filter((answer) => answer.origin !== 'model');

  const briefLines = [
    brief.thesis ? `${words.thesis}: ${brief.thesis}` : '',
    brief.position ? `${words.position}: ${brief.position}` : '',
    brief.disagreement ? `${words.disagreement}: ${brief.disagreement}` : '',
    brief.audience ? `${words.audience}: ${brief.audience}` : '',
    /**
     * Что считается подтверждённым для сути: сверенное поиском или памятью и
     * слово самого человека (§9.5 карты раздела: своё утверждение подтверждено
     * в момент, когда он его написал). Остальное — чужие числа без опоры — в
     * промпт не кладётся вовсе, а не помечается: модели нечего унести из того,
     * чего она не видела. Квитанция показывает их строкой `ungrounded`.
     */
    ...brief.facts
      .filter((fact) => isOwnOrConfirmed(fact))
      .map((fact) => `${words.confirmed}: ${fact.statement}`),
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
    input.language === 'ru'
      ? RU_SYSTEM(forbiddenPhrasesRule('ru'))
      : EN_SYSTEM(forbiddenPhrasesRule('en')),
    '',
    fenced(words.person, input.personText ? [input.personText] : []),
    fenced(
      words.answers,
      said.map(
        (answer) =>
          `${input.questionTextByKey[answer.key] || answer.key} → ${answer.text}`
      )
    ),
    fenced(words.brief, [...briefLines, ...borrowedLines]),
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
    trimmed(brief.thesis) ||
      trimmed(said.find((answer) => answer.key === 'key_idea')?.text) ||
      trimmed(personText),
    ...brief.facts.filter(isOwnOrConfirmed).map((fact) => fact.statement),
    ...said
      .filter((answer) => answer.key === 'personal_detail')
      .map((answer) => answer.text),
    trimmed(brief.position),
  ]
    .map((part) => trimmed(part))
    .filter(Boolean);
  return [...new Set(parts)].join('\n\n');
};

/* -------------------------------------------------------------------------
 * Ход
 * ---------------------------------------------------------------------- */

const REPAIR = {
  ru: 'Эти отрезки перенесены из чужого текста дословно и в сути стоять не могут. Перепишите их своими словами, ничего не добавляя: ',
  en: 'These runs were carried over from somebody else’s text verbatim and cannot stand in the core. Rewrite them in your own words, adding nothing: ',
} as const;

/**
 * Суть заготовки: один вызов, проверка на штампы и честная пометка автора.
 */
export async function writeCore(
  input: CoreWriteInputV1,
  deps: CoreWriteDepsV1
): Promise<ZagotovkaCoreV1> {
  const slop = (text: string): SlopReportV1 | null =>
    text && deps.slopCheck
      ? deps.slopCheck(text, CORE_SLOP_PLATFORM, input.language)
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
            `${prompt}\n\n${REPAIR[input.language]}${quoted}`
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
    fallbackCore(input.brief, input.answers, input.personText),
    'fallback'
  );
}
