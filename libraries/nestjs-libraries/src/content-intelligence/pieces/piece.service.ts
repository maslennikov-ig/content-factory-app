import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  channelLengthTarget,
  stripLeftoverAuthorLinkDeep,
} from '@contentfactory/nestjs-libraries/agent/channel-directives';
import { INTAKE_SNAPSHOT_STORE, INTAKE_SNAPSHOT_TTL_SECONDS, type IntakeSnapshotStore } from '../intake/intake-snapshot.store';
import {
  PIECE_RESEARCH_VERSION,
  PIECE_RESEARCH_VERSIONS,
  type PieceResearchLevel,
  type PieceResearchPreview,
  type PieceResearchSelection,
} from './piece-research.contract';
import type { IntakeRunState } from '../intake/intake.service';
import { reviewOnceV3, signReview, readReview } from './review.v3';
import { REVIEW_VERSION, applyReviewChanges, syncEmbeddedTitle, type ReviewProposalV3, type ReviewSnapshotV2 } from './review.v3.contract';
import { webReviewSources } from './adaptation-web-review';
import {
  REVIEW_CLAIM_QUERIES_MAX,
  REVIEW_CLAIM_TEXT_CHARS,
  checkableClaims,
  claimQueries,
} from './review-claims';
import { catalogFindingsOf, reviewSupportedOf } from './review-prompt.v5';
import { emojiCeilingOf, type EmojiCeiling } from '../channels/emoji-ceiling';
import { reviewTextOf } from './review-input';
import {
  factKind,
  factStatus,
  selectedFactsBrief,
  ungroundedStatements,
  type PieceFactV2,
} from './piece-facts.v2';
import { briefForGate } from './core-questions';
import { briefTitle } from '../brief/content-brief.compose';
import { textOrNull } from '../intake/intake-content';
import type { PieceAnswerEventV3 } from './piece-answer.v3.contract';
import type { BriefFilledV2 } from '../brand-voice/intake-v2.contract';
/**
 * Заготовки и адаптации: список, страница, адаптация под канал.
 *
 * `content-factory-next-tu3k.9.3`, решения владельца 06.09.2026 (§11 карты
 * раздела). Человек сначала делает нейтральную заготовку — суть без площадки,
 * — а потом сам решает, во что её превратить. Этот файл отвечает на вторую
 * половину: показать, что уже есть, и написать версию под конкретный канал.
 *
 * Что он решает, а что нет:
 *
 *  - он **не пишет суть**. Суть пишет вход одной мыслью, один раз до цикла по
 *    каналам (`core-write.ts`). Здесь её только читают;
 *  - он **не пишет текст сам**. Пишет `AgentGraphService`, тот же, что и
 *    кнопка «Generate Posts» и вход: вторая генерация была бы вторым местом,
 *    где живут голос, контекст и метки цитат. Аватар применяется здесь и
 *    только здесь — суть нейтральна и по площадке, и по манере;
 *  - он **не хранит состояние публикации**. Оно читается из поста
 *    (`adaptationState`), потому что колонка `ContentDerivation.state` три
 *    месяца была зеркалом, которое никто не обновлял;
 *  - он **не заводит второго способа создать пост**: черновик идёт через
 *    `createDraft`, то есть через `PostsRepository`, в состоянии `DRAFT`.
 *
 * Цена одной адаптации названа числом: одна генерация. Вопросов под канал
 * модель не сочиняет — они собраны из карточки канала и самой заготовки
 * (`channels/channel-questions.ts`), и платного вызова у них нет.
 *
 * Порядок параметров конструктора — часть договора: наборы собирают сервис
 * руками и передают сотрудников по местам. Новый параметр добавляется только
 * в конец и только необязательным.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentGraphService } from '@contentfactory/nestjs-libraries/agent/agent.graph.service';
import type {
  GeneratorRunInput,
  IntakeGenerationHintsV1,
  IntakeMaterialHintV1,
  IntakePostOverridesV1,
} from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import {
  INTAKE_HINTS_VERSION,
  INTAKE_MATERIAL_MAX_CHARS,
  INTAKE_MATERIAL_MAX_ITEMS,
} from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { slopCheck as runSlopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
import type {
  AdaptationKindV1,
  AdaptationV1,
  BriefFilledFactV1,
  BriefFilledV1,
  PieceAdaptEventV1,
  PieceAdaptRequestV1,
  PieceAnswerEventV1,
  PieceAnswerRequestV1,
  PieceAnswerV1,
  PieceCellV1,
  PieceChannelTabV1,
  PieceDetailV1,
  PiecePostSettingsRequestV1,
  PiecePostLinkRequestV1,
  PiecePostLinkV1,
  PieceCoreEditRequestV1,
  PieceCoreRestoreRequestV1,
  PieceMaterialAppendRequestV1,
  PieceAddedMaterialV1,
  PiecePostSettingsResponseV1,
  ChannelPlanImpactV1,
  ChannelPlanApplyResponseV1,
  PieceFieldAnswerV1,
  InterviewAskKeyV1,
  PieceLeadSourceV1,
  PieceOpenQuestionV1,
  PieceOriginV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
  PieceQuestionsV1,
  PieceRowV1,
  PieceTargetV1,
  PiecesQueryV1,
  PiecesResponseV1,
  AdaptationChecksV1,
  AdaptationPlanV1,
  RelatedOwnPostV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  ADAPTATION_KINDS_LATER,
  INTERVIEW_QUESTION_MAX_CHARS,
  isInterviewAskKey,
  PIECE_CORE_VERSION,
  PIECE_EXCERPT_LINES,
  PIECE_MAX_INTERVIEW_ROUNDS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { BriefField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
/*
  Значением, а не типом: `@Optional()` без метаданных типа отдал бы `undefined`
  вместо сотрудника, и дверь ответов молча перестала бы сохранять. Один и тот
  же учёт расхода, что у входа одной мыслью.
*/
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  adaptationState,
  bestCell,
  withChannelName,
  columnsOf,
  promoteNoChannel,
  kindsOfProvider,
  materialCode,
  materialDate,
  materialFormat,
  providerOfPlatform,
  voiceVersionLabel,
} from '../materials/material-presentation';
import type { AdaptationRow } from '../materials/content-material.repository';
import { relatedOwnPostsOf } from '../search/text-search.index';
import { matchedFormsOf, matchedSnippetOf } from '../search/text-search.index';
import { TextSearchService } from '../search/text-search.service';
import {
  channelFormatHint,
  parseLengthPolicy,
  parseWritingProfile,
  type ChannelWritingProfileV1,
} from '../channels/channel-writing-profile';
/*
  Вердикт голоса — портом, а не голосовым сервисом: имя, а не класс. То же
  устройство, что у мерки отбора черновика в графе.
*/
import {
  VOICE_CHECK_PORT,
  type VoiceCheckPort,
} from '../brand-voice/voice-check.port';
import { adaptationChecksMany, adaptationChecksOf } from './adaptation-checks';
import { TAKEAWAY_QUESTION_KEY } from '../channels/channel-question.v3';
/*
  Интервью адаптации без шаблона и без счёта (`97dq.44`): v4 решает, нужно ли
  спросить хоть что-то, и чаще всего не спрашивает. v3 с вопросом «что
  унести» остаётся для квитанций; ответ `takeaway` старого клиента доходит.
*/
import {
  adaptationInterviewLines,
  askAdaptationQuestionsV4,
} from '../channels/channel-question.v4';
import { stripBoldMarkers } from '@contentfactory/helpers/utils/bold-markers';
import { editorHtml } from '../brief/editor-html';
import { stripCitationLabels } from '../text-quality/citation-labels';
import { ContentBriefRepository } from '../brief/content-brief.repository';
import { linksOf } from '../intake/intake-kind';
import { oneLine } from '../intake/intake.prompts';
import {
  IntakeService,
  type AcceptedEvidence,
} from '../intake/intake.service';
import {
  CORE_QUESTION_FIELDS,
  coreQuestionText,
} from './core-questions';
import {
  writeCore,
  writeCoreWithDecisions,
  type CoreDecisionV1,
  type CoreDelegatedV1,
} from './core-write';
import {
  DEFAULT_DELEGATED_POLICY,
  type DelegatedPolicyV1,
} from '../brand-profile/delegated-policy';
import {
  PieceRepository,
  type PieceIntegrationRow,
  type PieceRow,
  type PlanDb,
  type PlanVariantRow,
  type ReadyAdaptationRow,
} from './piece.repository';
import {
  QUEUE_REPLACE_MARGIN_MS,
  canReplaceQueued,
  holderIds,
  isPlanMode,
  queueGate,
  type QueueBlockV1,
  nextFreeSlot,
  planModeOf,
  postingMinutesOf,
  type PlanModeV1,
} from './adaptation-plan';
import {
  mergePostSettings,
  planWouldChange,
  postPlanModeOf,
  postSettingsOf,
  postEmojiLevelOf,
  effectiveEmojiLevel,
  withPostSettings,
  type PiecePostSettingsV1,
  type PostSettingsPatchV1,
} from './post-settings';
import { PIECE_ERROR_MESSAGES, PieceError, pieceError } from './errors';
import { askMaterialQuestionsV1 } from '../channels/material-questions.v1';
import {
  coreDigest,
  materialAskRecordOf,
  materialShortfall,
  mayAskMaterial,
  openMaterialAskOf,
  withMaterialAsk,
  type MaterialAskRecordV1,
} from './material-asks';
import type {
  PieceMaterialQuestionsRequestV1,
  PieceMaterialQuestionsResponseV1,
} from './adaptation-workspace.contract';
import {
  effectivePostLink,
  linkQuestionOpen,
  normalizePostLink,
  postLinkAnswer,
  readPostLink,
} from './post-link';
import {
  PIECE_ADDED_MATERIAL_MAX,
  PIECE_PERSON_TEXT_MAX,
  appendedPersonText,
  coreAuthorOf,
  editStartsRevision,
  editedCoreText,
  readAddedMaterial,
  readCoreRevisions,
  restoredMaterialPending,
  withRevision,
} from './core-edit';

import { htmlToPlainText } from '../brand-voice/html-text';
import {
  RESEARCH_LEVEL_PRESETS,
  WebResearchService,
  type ResearchLevel,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { AdaptationReviewError, reviewConflict,
  type AdaptationReviewAction } from './adaptation-review.contract';
import {
  READY_ADAPTATIONS_VERSION,
  type ReadyAdaptationSlotV1,
  type ReadyAdaptationsResponseV1,
} from './ready-adaptations.contract';
import {
  ADAPTATION_WORKSPACE_ERROR_CODES,
  ADAPTATION_WORKSPACE_MESSAGES,
  QUEUED_EDIT_MARGIN_MS,
  scheduleRefusalText,
  QUEUED_EDIT_REFUSAL_TAIL,
  type AdaptationWorkspaceErrorCodeV1,
  type PieceAdaptationEditRequestV1,
  type PieceAdaptationEditResponseV1,
  type PieceAdaptationScheduleRequestV1,
  type PieceAdaptationScheduleResponseV1,
  type PieceAdaptationPlaceRequestV1,
  type PieceAdaptationPlaceResponseV1,
} from './adaptation-workspace.contract';
import { PIECE_POSTS_PORT, type PiecePostsPort } from './piece-posts.port';
import type { BrandProfileSelectionV1 } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';

/** Шов проверки на ИИ-штампы: в наборах подменяется, в продукте настоящий. */
export type PieceSlopCheckPort = (
  text: string,
  platform: string,
  locale: 'ru' | 'en',
  /** Опоры заготовки: точное число из них размытым количеством не считается. */
  grounded?: readonly string[],
  /** Утверждения отмеченных фактов: их пересказ не штамп (`97dq.33`). */
  supported?: readonly string[],
  /** Выбранный потолок эмодзи (`97dq.83`); нет — порог площадки. */
  emojiCeiling?: EmojiCeiling | null
) => SlopReportV1 | null;

const defaultSlopCheck: PieceSlopCheckPort = (
  text,
  platform,
  locale,
  grounded,
  supported,
  emojiCeiling
) =>
  runSlopCheck(text, {
    platform,
    locale,
    html: false,
    grounded,
    supported,
    ...(emojiCeiling !== undefined ? { emojiCeiling } : {}),
  });

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Пост из принятого текста — с одной проверкой, которой не было.
 *
 * `editorHtml` может честно вернуть пустую строку из непустого текста: `****`,
 * одинокая пара звёздочек или строка из одних маркеров разметки превращаются в
 * ничто, потому что непарные `**` снимаются, а пустой абзац отбрасывается.
 * Приёмка писала это «ничто» в пост, и черновик, который человек видел на
 * экране, молча становился пустым — при непустом теле адаптации
 * (`content-factory-next-97dq.3`, P2-19). Проверяется именно результат сборки:
 * проверять исходный текст здесь бесполезно, он-то как раз непустой.
 */
const renderedPost = (
  text: string,
  editor: 'none' | 'normal' | 'markdown' | 'html'
): string => {
  const content = editorHtml(text, editor);
  if (text.trim() && !content.trim())
    throw new AdaptationReviewError(
      'ADAPTATION_REVIEW_EMPTY',
      400,
      'После правки в тексте не осталось ничего, кроме разметки. Черновик не изменён.'
    );
  return content;
};

/** «1 утверждение», «2 утверждения», «5 утверждений» — для одной строки ниже. */
const claimWord = (count: number): string => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'утверждений';
  if (ones === 1) return 'утверждение';
  if (ones >= 2 && ones <= 4) return 'утверждения';
  return 'утверждений';
};

/**
 * Источник повода из сохранённого JSON (`content-factory-next-75xn.8`).
 *
 * Без адреса строки нет: она существует, чтобы человек мог открыть исходное, и
 * запись без `url` открыть нечем.
 */
const leadSourceOf = (value: unknown): PieceLeadSourceV1 | null => {
  const stored = (value || null) as Record<string, unknown> | null;
  if (!stored || typeof stored !== 'object') return null;
  const url = trimmed(stored.url);
  if (!url) return null;
  const title = trimmed(stored.title);
  return {
    leadId: trimmed(stored.leadId),
    url,
    ...(title ? { title } : {}),
  };
};

/**
 * Сколько строк страницы получают квитанцию проверок.
 *
 * `content-factory-next-97dq.2`, разбор корректности P1-2. Каждая пересчитанная
 * строка — это арифметика по всему телу; двадцать свежих адаптаций одной
 * заготовки покрывают любую живую работу, а всё, что старше, человек читает
 * как историю, и строка качества там ничего не решает.
 */
const PIECE_CHECKED_ADAPTATIONS = 20;

/** Одна опора в промпте длиннее абзаца не бывает: это опора, а не текст. */
const MATERIAL_STATEMENT_MAX_CHARS = 400;
/** Адрес длиннее этого — уже не адрес, а хвост разметки поисковика. */
const MATERIAL_URL_MAX_CHARS = 300;

/** Адрес источника, пригодный для печати: одна строка, http(s) и предел. */
const materialUrl = (value: unknown): string => {
  const url = oneLine(trimmed(value)).slice(0, MATERIAL_URL_MAX_CHARS);
  return /^https?:\/\//iu.test(url) ? url : '';
};

/**
 * Отмеченные опоры — строками для промпта, с адресом и под пределом.
 *
 * `content-factory-next-97dq.2`. Каждая строка сводится к одной (`oneLine`) по
 * той же причине, по которой это делает промпт сути: утверждение писала
 * модель по чужому тексту, и перевод строки внутри него открыл бы в блоке
 * собственную строку. То же правило теперь и у адреса: он приходит от
 * поисковика строкой и через `new URL` не проходил ни разу, так что перевод
 * строки внутри него рисовал бы в блоке лишние пункты прямо над правилом «не
 * выдумывай» (разбор корректности, P2-10).
 *
 * Три правила отбора, и каждое стоило находки разбора:
 *
 *  - **длинная строка не занимает бюджет целиком**: один ответ человека на
 *    две тысячи знаков (столько разрешает `IntakeAnswerDto`) выносил из
 *    промпта ВСЕ находки ресерча, потому что счётчик знаков обрывал цикл
 *    (P1-1). Теперь строка режется по `MATERIAL_STATEMENT_MAX_CHARS`, а
 *    не помещающаяся пропускается — цикл идёт дальше;
 *  - **сверенное идёт первым**: порядок в брифе — это порядок появления, и
 *    свой длинный ответ стоит в нём раньше находок. Проверенное вперёд —
 *    единственный способ не дать ему вытеснить то, ради чего ресерч и звали;
 *  - **непроверенное не называется проверенным** (P2-12): чужое утверждение
 *    без подтверждения не едет вовсе, своё — едет отдельной пометкой, и
 *    промпт печатает его под своим заголовком.
 */
const materialHints = (
  facts: readonly PieceFactV2[],
  inputKind?: string
): IntakeMaterialHintV1[] => {
  const checked = (fact: PieceFactV2) =>
    fact?.verified === true || factStatus(fact) === 'confirmed';
  const own = (fact: PieceFactV2) => factKind(fact, inputKind) === 'own';
  const ordered = [
    ...facts.filter((fact) => checked(fact)),
    // Слово человека без сверки: материал автора, но не подтверждение.
    ...facts.filter((fact) => !checked(fact) && own(fact)),
  ];
  const seen = new Set<string>();
  const lines: IntakeMaterialHintV1[] = [];
  let chars = 0;
  for (const fact of ordered) {
    if (lines.length >= INTAKE_MATERIAL_MAX_ITEMS) break;
    const statement = oneLine(trimmed(fact?.statement)).slice(
      0,
      MATERIAL_STATEMENT_MAX_CHARS
    );
    if (!statement || seen.has(statement)) continue;
    const sourceUrl = materialUrl(fact?.sourceUrl);
    if (chars + statement.length + sourceUrl.length > INTAKE_MATERIAL_MAX_CHARS)
      continue;
    seen.add(statement);
    chars += statement.length + sourceUrl.length;
    lines.push({
      statement,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(checked(fact) ? { checked: true } : {}),
    });
  }
  return lines;
};

const isoOf = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

/**
 * План адаптации: всё, что решено до первого байта.
 *
 * Канал, вид и заготовка уже проверены, поэтому `adapt` не отказывает по этим
 * причинам вовсе — а значит, экран получает их обычным HTTP, а не последней
 * строкой стрима.
 */
export type PieceAdaptPlanV1 = {
  pieceId: string;
  integrationId: string;
  kind: AdaptationKindV1;
  language: 'ru' | 'en';
  request: PieceAdaptRequestV1;
  /**
   * Кто говорит (`97dq.38`): аватар поста → явный выбор запроса → аватар
   * канала → как было (граф берёт аватар области по умолчанию).
   */
  brandProfileSelection?: BrandProfileSelectionV1 | null;
  channel: {
    id: string;
    name: string;
    providerIdentifier: string;
    contentLanguage: string | null;
    profile: ChannelWritingProfileV1;
    maxLength: number;
    maxCaptionLength: number | null;
    editor: 'none' | 'normal' | 'markdown' | 'html';
    /** Режим плана канала (`97dq.57`); нет — «Бронь». */
    planMode?: PlanModeV1;
    /** `Integration.postingTimes`: свои времена канала для брони. */
    postingTimes?: string | null;
  };
  /** `null` — материал до волны: сути нет, есть только тело канала. */
  core: ZagotovkaCoreV1 | null;
  /** Отпечатки чужого исходника, сохранённые рядом с брифом заготовки. */
  foreignShingles: string[];
  legacyBody: string | null;
  title: string;
  /**
   * На этом канале у заготовки ещё нет ни одной адаптации
   * (`content-factory-next-97dq.31`). Только тогда адаптация спрашивает, что
   * читатели канала должны унести из поста; «Ещё вариант» — это уже вторая
   * строка канала, и человек через вопрос уже прошёл. Отсутствие поля — «не
   * первая»: план, собранный не `prepareAdapt`, вопроса не задаёт.
   */
  firstOnChannel?: boolean;
  /**
   * The post's own emoji level (review P3-6 of `97dq.83`): the request's
   * override, else the stored «Для этого поста»; absent — the channel card.
   * Resolved once in `prepareAdapt` by `postEmojiLevelOf`, the same function
   * the detail/edit/review checks read, so the directive, the write-time
   * checks and the later checks share one ceiling.
   */
  postEmojiLevel?: string;
};

/**
 * План уточнения: заготовка прочитана, суть у неё есть, архив проверен.
 *
 * `core` здесь не может быть `null` — это и есть разница с планом адаптации:
 * адаптировать материал до волны можно (у него есть тело), а отвечать на
 * вопросы о несуществующей сути нельзя.
 */
export type PieceAnswerPlanV1 = {
  borrowed?: import('./core-write').CoreBorrowedV1 | null;
  titleEdited?: boolean;
  pieceId: string;
  language: 'ru' | 'en';
  request: PieceAnswerRequestV1;
  core: ZagotovkaCoreV1;
  foreignShingles: string[];
  title: string;
};

/**
 * Задание, с которого началась заготовка, — для переписи сути после ответа и
 * для дополнения ресерчем (`97dq.29`): без него второй вызов писал бы по
 * одному брифу и терял бы ссылки, которые велено сохранить.
 */
const instructionOf = (core: ZagotovkaCoreV1) =>
  core.instructionText?.trim()
    ? { text: core.instructionText, links: core.keepLinks ?? [] }
    : null;

/** Те же два поля обратно в запись сути, когда они есть. */
const keptInstruction = (core: ZagotovkaCoreV1) =>
  core.instructionText?.trim()
    ? { instructionText: core.instructionText, keepLinks: core.keepLinks ?? [] }
    : {};

/**
 * Присланное дословно (`97dq.41`) переживает любую перепись сути: оно
 * записано входом один раз и больше не меняется.
 */
const keptInput = (core: ZagotovkaCoreV1) =>
  core.inputText?.trim() ? { inputText: core.inputText } : {};

/** Refusals of the piece's own edits (`97dq.75`), in both languages. */
const CORE_EDIT_WORDS = {
  changed: {
    ru: 'Заготовка изменилась в другом окне. Обновите страницу — ваш текст не сохранён.',
    en: 'The piece changed in another window. Reload the page — your text was not saved.',
  },
  empty: {
    ru: 'Суть не может быть пустой. Верните текст или отмените правку.',
    en: 'The core cannot be empty. Put the text back or undo the edit.',
  },
  materialEmpty: {
    ru: 'Напишите, что добавить к материалу.',
    en: 'Write what to add to the material.',
  },
  linkInvalid: {
    ru: 'Это не похоже на адрес http или https. Проверьте его.',
    en: 'This does not look like an http or https address. Check it.',
  },
  rebuildFailed: {
    ru: 'Не удалось пересобрать суть. Прежний текст на месте — попробуйте ещё раз.',
    en: 'The core could not be rebuilt. The previous text is still there — try again.',
  },
  rebuildRunning: {
    ru: 'Суть уже пересобирается. Дождитесь, пока закончится.',
    en: 'The core is already being rebuilt. Wait until it finishes.',
  },
  revisionMissing: {
    ru: 'Этой версии больше нет в истории. Обновите страницу.',
    en: 'This version is no longer in the history. Reload the page.',
  },
  materialFull: {
    ru: 'Материала уже слишком много, чтобы дописывать ещё. Пересоберите суть или начните новую заготовку.',
    en: 'There is already too much material to add more. Rebuild the core or start a new piece.',
  },
} as const;

/**
 * What the author gave the piece after it was written (`97dq.75`): the link
 * for the post, the added material and the replaced core texts. A core
 * rewrite keeps them — they are the author's, not the model's.
 */
const keptAuthor = (core: ZagotovkaCoreV1) => ({
  ...(core.postLink ? { postLink: core.postLink } : {}),
  ...(core.addedMaterial?.length ? { addedMaterial: core.addedMaterial } : {}),
  ...(core.revisions?.length ? { revisions: core.revisions } : {}),
});

/**
 * «Что вы прислали» (`97dq.41`): сохранённый ввод, а у заготовок до него —
 * то, что от ввода осталось, в порядке близости к присланному. Ничего не
 * выдумывается: нет ни одного — `null`.
 */
export const sentTextOf = (core: ZagotovkaCoreV1 | null): string | null =>
  [core?.inputText, core?.sourceText, core?.instructionText, core?.personText]
    .map((value) => (typeof value === 'string' ? value : ''))
    .find((value) => value.trim()) ?? null;

/** Отказ экрана адаптации: код, статус из контракта, слова на языке экрана. */
const workspaceError = (
  code: Exclude<AdaptationWorkspaceErrorCodeV1, 'ADAPTATION_SCHEDULE_INVALID'>,
  language: 'ru' | 'en'
) =>
  new AdaptationReviewError(
    code,
    ADAPTATION_WORKSPACE_ERROR_CODES[code].status,
    ADAPTATION_WORKSPACE_MESSAGES[code][language]
  );

/** `Post.image` и `Post.settings` — строки JSON; мусор читается как пусто. */
const jsonOf = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/* ---- План канала (`content-factory-next-97dq.57`) ------------------------ */

/** Версия, снятая с очереди под замком, — как её оставили (для возврата). */
type ReleasedVariant = {
  adaptationId: string;
  postId: string;
  planBefore: string | null;
  planAfter: string | null;
  /** `Post.updatedAt` сразу после снятия: возврат только если пост не трогали (N1). */
  updatedAt: Date | null;
};

/**
 * Что сделать в Temporal после фиксации замка (N2): остановить процессы
 * снятых постов и (пере)запустить процесс поставленного.
 */
type QueueEffects = {
  stop: string[];
  start: { adaptationId: string; postId: string } | null;
  released: ReleasedVariant[];
};

const NO_EFFECTS: QueueEffects = { stop: [], start: null, released: [] };

/** Пост, как его проверяет площадка перед очередью. */
type QueuePostLike = {
  id: string;
  content: string;
  image: string | null;
  settings: string | null;
  integration: { id: string; name: string; providerIdentifier: string };
};

const PLAN_NOTES = {
  noTimes: {
    ru: 'У канала не задано время публикации, поэтому автопилот не поставил версию в очередь.',
    en: 'The channel has no posting times, so the autopilot did not queue this version.',
  },
  tooLate: {
    ru: 'Прежняя версия уже выходит, поэтому новая осталась в плане.',
    en: 'The previous version is already going out, so the new one stays planned.',
  },
  keptQueued: {
    ru: 'Прежняя версия уже стоит в очереди, поэтому новая осталась в плане.',
    en: 'The previous version is already queued, so the new one stays planned.',
  },
  startFailed: {
    ru: 'Календарь не принял публикацию в очередь, поэтому версия осталась в плане. Нажмите «Запланировать» ещё раз.',
    en: 'The calendar did not accept the post into the queue, so the version stays planned. Press “Schedule” again.',
  },
  settleFailed: {
    ru: 'Версия сохранена, но встать в план не смогла. Выберите время и нажмите «Запланировать».',
    en: 'The version is saved but could not be planned. Pick a time and press “Schedule”.',
  },
  published: {
    ru: 'Эта заготовка уже вышла в канале, поэтому автопилот не ставит новую версию в очередь — она осталась в плане.',
    en: 'This piece already went out in the channel, so the autopilot does not queue the new version; it stays planned.',
  },
} as const;

const upperState = (value: unknown) => String(value || '').toUpperCase();

/** The post was set to QUEUE, but its publishing workflow did not start (F7). */
class QueueStartFailed extends Error {
  constructor(readonly postId: string) {
    super(`Publishing workflow did not start for post ${postId}`);
  }
}

/**
 * A variant whose DRAFT post the confirm-time cleanup removed (`2q28.39`):
 * its own post is soft-deleted and still `DRAFT`, and another variant of the
 * same piece in the same channel went on (a live queued, published or failed
 * post). Without that sibling the draft was removed by someone else — the
 * calendar, the editor — and it is not brought back.
 */
const droppedByConfirm = (variants: readonly PlanVariantRow[], adaptationId: string): boolean => {
  const mine = variants.find((one) => one.id === adaptationId);
  const post = mine?.post;
  if (!post || !post.deletedAt || upperState(post.state) !== 'DRAFT') return false;
  return variants.some(
    (one) =>
      one.id !== adaptationId &&
      !!one.post &&
      one.post.id !== post.id &&
      !one.post.deletedAt &&
      one.post.integrationId === post.integrationId &&
      ['QUEUE', 'PUBLISHED', 'ERROR'].includes(upperState(one.post.state))
  );
};

const planVariantOf = (row: PlanVariantRow) => ({
  id: row.id,
  pieceId: row.contentPieceId,
  integrationId: row.post?.integrationId ?? row.integrationId,
  plannedAt: row.plannedAt,
  createdAt: row.createdAt,
  postId: row.postId,
  postState: row.post?.state ?? null,
  postDeleted: !row.post || !!row.post.deletedAt,
});

/**
 * Место версии в календаре, как его видит экран. Опубликованная, ошибочная и
 * удалённая версии плана не имеют.
 */
/**
 * Держатели слота среди строк страницы заготовки (`97dq.57`).
 *
 * Режим решает так же, как в календаре (`supersededPostIdsOf`, ревью F6
 * четырнадцатого захода): под «Без плана» у пары (заготовка, канал) нет слота,
 * и каждая её версия — текущая, со своей датой. Иначе страница прятала бы дату
 * у черновика, который календарь показывает.
 */
const holdersOfRows = (
  rows: readonly AdaptationRow[],
  tags?: unknown,
  integrations: readonly PieceIntegrationRow[] = []
): Set<string> => {
  const free = (row: AdaptationRow) => {
    const channel = row.post?.integration?.id ?? row.integrationId;
    if (!channel) return false;
    const mode =
      postPlanModeOf(tags, channel) ??
      planModeOf(integrations.find((one) => one.id === channel)?.planMode);
    return mode === 'draft';
  };
  const holders = holderIds(
    rows.filter((row) => !free(row)).map((row) => ({
      id: row.id,
      pieceId: row.contentPieceId,
      integrationId: row.post?.integration?.id ?? row.integrationId,
      plannedAt: row.plannedAt ?? null,
      createdAt: row.createdAt,
      postId: row.postId,
      postState: row.post?.state ?? null,
      postDeleted: !row.post || !!row.post.deletedAt,
    }))
  );
  for (const row of rows) if (free(row)) holders.add(row.id);
  return holders;
};

/**
 * Где готовая адаптация стоит в календаре — для «Что публикуем» (`97dq.57`).
 * В выборке только держатели слота, поэтому черновик с планом — бронь.
 */
const readySlotOf = (row: ReadyAdaptationRow): ReadyAdaptationSlotV1 => {
  const state = upperState(row.post.state);
  const date = isoOf(row.post.publishDate ?? null);
  if (state === 'QUEUE')
    return { status: 'queued', date, autopilot: row.plan === 'autopilot' };
  if (row.plan === 'reserve' || row.plan === 'autopilot')
    return { status: 'reserved', date, autopilot: false };
  return { status: 'free', date: null, autopilot: false };
};

const adaptationPlanOf = (
  row: {
    plan?: string | null;
    planNote?: string | null;
    post: { state: string; publishDate?: Date | string | null; deletedAt: Date | null } | null;
  },
  current: boolean
): AdaptationPlanV1 | undefined => {
  const post = row.post;
  if (!post || post.deletedAt) return undefined;
  const state = upperState(post.state);
  const date = isoOf(post.publishDate ?? null);
  const note = trimmed(row.planNote) || null;
  if (state === 'QUEUE' || state === 'QUEUED')
    return {
      status: 'queued',
      date,
      autopilot: row.plan === 'autopilot',
      current,
      ...(note ? { note } : {}),
    };
  if (state !== 'DRAFT') return undefined;
  const reserved = current && (row.plan === 'reserve' || row.plan === 'autopilot');
  return {
    status: reserved ? 'reserved' : 'draft',
    date: reserved ? date : null,
    autopilot: false,
    current,
    ...(reserved && note ? { note } : {}),
  };
};

/**
 * Разовые настройки поста — подсказкой генератору (`97dq.38`).
 *
 * «Как в канале» ничего не меняет и не едет; аватар решён отдельно, в
 * `brandProfileSelection`. Пустое — отсутствие, а не пустая строка в промпте.
 * Обращение, если его прислал старый клиент, не едет (`97dq.45`).
 */
const postOverridesOf = (
  request: PieceAdaptRequestV1 | undefined,
  /** The post's own emoji level resolved once (`postEmojiLevelOf`, P3-6). */
  postEmojiLevel?: string
): IntakePostOverridesV1 | null => {
  const overrides = {
    ...(request?.overrides ?? {}),
    ...(postEmojiLevel ? { emojiLevel: postEmojiLevel } : {}),
  } as NonNullable<PieceAdaptRequestV1['overrides']>;
  if (!request?.overrides && !postEmojiLevel) return null;
  const wish = trimmed(overrides.wish);
  const takeaway = trimmed(overrides.takeaway);
  const lengthPolicy = postLengthOf(overrides);
  const post: IntakePostOverridesV1 = {
    // Длина карточкой главнее «Короче / Длиннее» старого клиента.
    ...(lengthPolicy
      ? { lengthPolicy }
      : overrides.length === 'shorter' || overrides.length === 'longer'
      ? { length: overrides.length }
      : {}),
    ...(overrides.emojiLevel ? { emojiLevel: overrides.emojiLevel } : {}),
    ...(overrides.linkPolicy ? { linkPolicy: overrides.linkPolicy } : {}),
    ...(overrides.hashtagPolicy
      ? { hashtagPolicy: overrides.hashtagPolicy }
      : {}),
    ...(overrides.ctaKind ? { ctaKind: overrides.ctaKind } : {}),
    ...(wish ? { wish } : {}),
    ...(takeaway ? { takeaway } : {}),
  };
  return Object.keys(post).length ? post : null;
};

/**
 * Разовая длина (`97dq.48`) тем же разбором, что длина карточки канала.
 *
 * Диапазон, который карточка бы не приняла (перевёрнутый, без границы),
 * не едет вовсе — пост пишется «как в канале», а не по починенному числу.
 */
const postLengthOf = (
  overrides: NonNullable<PieceAdaptRequestV1['overrides']>
): IntakePostOverridesV1['lengthPolicy'] | null => {
  if (overrides.lengthPolicy === 'auto') return 'auto';
  if (overrides.lengthPolicy !== 'range') return null;
  const range = parseLengthPolicy(overrides.lengthRange, 'provider_max');
  return typeof range === 'object' ? range : null;
};

/**
 * Поля брифа, которые «Решите за меня» решает текстом (`97dq.56`). Опоры —
 * не поле для решения: вопрос о них — вопрос о материале автора.
 */
const DECIDABLE_BRIEF_FIELDS: ReadonlySet<BriefField> = new Set<BriefField>([
  'thesis',
  'position',
  'audience',
  'disagreement',
]);

/** Вопрос о поле, когда его текста у заготовки нет. */
const DECIDABLE_FIELD_QUESTION: Record<'ru' | 'en', Partial<Record<BriefField, string>>> = {
  ru: {
    thesis: 'Какая главная мысль этого текста?',
    position: 'Какую позицию занимает текст?',
    audience: 'Для кого этот текст?',
    disagreement: 'Кто с этим не согласится и почему?',
  },
  en: {
    thesis: 'What is the main claim of this text?',
    position: 'What position does the text take?',
    audience: 'Who is this text for?',
    disagreement: 'Who would disagree with it, and why?',
  },
};

@Injectable()
export class PieceService {
  private readonly logger = new Logger(PieceService.name);
  private readonly now: () => Date;
  private readonly slopCheck: PieceSlopCheckPort | null;
  /** Pieces whose core is being rebuilt now (`97dq.75` review P2-7). */
  private readonly rebuilding = new Set<string>();

  constructor(
    private readonly pieces: PieceRepository,
    private readonly generator: AgentGraphService,
    @Inject(IntegrationManager)
    private readonly integrationManager: IntegrationManager,
    @Optional() now: () => Date = () => new Date(),
    @Optional() slopCheck: PieceSlopCheckPort | null = null,
    /**
     * Учёт расхода и запись сути. Оба нужны одной двери — ответам на открытые
     * вопросы (`answer`), которая переписывает суть и сохраняет её той же
     * строкой. Оба необязательны и стоят в конце: порядок параметров — часть
     * договора с наборами, которые собирают сервис руками.
     */
    @Optional() private readonly aiUsage?: AiUsageService,
    @Optional() private readonly briefs?: ContentBriefRepository,
    /**
     * Внутренний поиск области (`content-factory-next-m2eg.19`).
     *
     * Необязательный и последний — порядок параметров здесь часть договора.
     * Без него список ищет по словам, как искал, а «свои тексты по теме» при
     * адаптации не собираются вовсе: список, которого не из чего собрать, не
     * подменяется пустым обещанием.
     *
     * `@Inject` стоит рядом с `@Optional()` не для красоты: тип параметра —
     * объединение с `null`, а `emitDecoratorMetadata` пишет для объединения
     * `Object`. Nest искал бы провайдера `Object`, не нашёл, и `@Optional()`
     * молча подставил бы `undefined` — поиск был бы выключен на боевом при
     * зелёных наборах.
     */
    @Optional()
    @Inject(TextSearchService)
    private readonly search: TextSearchService | null = null,
    /**
     * Вердикт голоса для квитанции адаптации (`content-factory-next-k879.1`).
     *
     * Тоже последним и необязательным — порядок параметров здесь часть
     * договора с наборами. Без него квитанция говорит `UNKNOWN` с причиной, а
     * не молчит и не выдумывает `CLOSE`.
     *
     * `@Inject` рядом с `@Optional()` по той же причине, что и у поиска выше:
     * тип параметра — объединение с `null`, метаданные для объединения пишут
     * `Object`, и Nest молча подставил бы `undefined` при зелёных наборах.
     */
    @Optional()
    @Inject(VOICE_CHECK_PORT)
    private readonly voiceCheck: VoiceCheckPort | null = null,
    @Optional()
    @Inject(WebResearchService)
    private readonly webReview: WebResearchService | null = null,
    /**
     * The same safe link reader used by intake. It is optional and last because
     * tests and older consumers construct this service positionally.
     */
    @Optional()
    @Inject(IntakeService)
    private readonly intake: IntakeService | null = null,
    @Optional()
    @Inject(INTAKE_SNAPSHOT_STORE)
    private readonly snapshots: IntakeSnapshotStore | null = null,
    /**
     * Календарь для «Запланировать» и «Опубликовать сейчас» на экране
     * адаптации (`97dq.37`). Последним и необязательным — порядок параметров
     * здесь договор; без него дверь честно отвечает
     * `ADAPTATION_SCHEDULE_UNAVAILABLE`.
     */
    @Optional()
    @Inject(PIECE_POSTS_PORT)
    private readonly posts: PiecePostsPort | null = null
  ) {
    this.now = now || (() => new Date());
    this.slopCheck = slopCheck || defaultSlopCheck;
  }

  /* -----------------------------------------------------------------------
   * Чтение
   * -------------------------------------------------------------------- */

  async readyAdaptations(
    organizationId: string,
    limit: number,
    integrationIds?: string[]
  ): Promise<ReadyAdaptationsResponseV1> {
    const [pieceOrder, rows] = await Promise.all([
      this.pieces.listPieceIds(organizationId),
      this.pieces.listReadyAdaptations(organizationId, limit, integrationIds),
    ]);
    const pieceIndexes = new Map(
      pieceOrder.map((piece, index) => [piece.id, index])
    );

    return {
      version: READY_ADAPTATIONS_VERSION,
      items: rows.flatMap((row) => {
        const pieceIndex = pieceIndexes.get(row.piece.id);
        if (pieceIndex === undefined) return [];
        /*
          Разметка тела в список не едет (`content-factory-next-97dq.2`,
          разбор корректности P2-22): тело хранится с `**жирным**`, и строка
          «`**Заголовок**`» показывала звёздочки ровно там, где страница
          заготовки уже показывает жирное. Список — это одна строка текста, а
          не предпросмотр поста: выделять в ней нечем, поэтому маркеры
          снимаются, а звёздочки прозы остаются собой.
        */
        const text = stripBoldMarkers(
          htmlToPlainText(row.body || row.post.content || '')
        );
        const firstLine =
          text
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .find(Boolean) ?? '';
        return [
          {
            adaptationId: row.id,
            pieceId: row.piece.id,
            pieceCode: materialCode(pieceIndex),
            title: trimmed(row.piece.title) || trimmed(row.title),
            firstLine,
            integrationId: row.post.integrationId,
            postId: row.post.id,
            readyAt: row.updatedAt.toISOString(),
            ...(row.post.state !== undefined
              ? { slot: readySlotOf(row) }
              : {}),
          },
        ];
      }),
    };
  }

  /**
   * Список заготовок таблицей: колонка на площадку, в клетке состояние.
   *
   * Порядок именно такой: сначала строки со своими кодами, потом клетки, и
   * только потом фильтры. Фильтр «Ещё нет в Telegram» — это вопрос о клетках,
   * и ответить на него до того, как клетки посчитаны, нельзя; а код обязан
   * остаться прежним, что бы человек ни отфильтровал.
   */
  async list(
    organizationId: string,
    query: PiecesQueryV1,
    language: 'ru' | 'en'
  ): Promise<PiecesResponseV1> {
    const [all, integrations] = await Promise.all([
      this.pieces.listPieces(organizationId, query),
      this.pieces.listIntegrations(organizationId),
    ]);
    const adaptations = await this.pieces.adaptationsByPiece(
      organizationId,
      all.map((piece) => piece.id)
    );
    const byPiece = this.group(adaptations);
    const columns = columnsOf(integrations, adaptations);
    const channelNames = new Map(integrations.map((one) => [one.id, one.name]));
    /*
      Сначала внутренний индекс, потом поиск по словам через базу
      (`content-factory-next-m2eg.19`). Индекс знает стемминг — «сроки»
      находят «срок», — а отбор остаётся тем же: встретиться должно каждое
      слово. Пустой индекс отвечает `null`, и тогда список ищет ровно так, как
      искал с 05.09.2026.

      Архивные строки индекс держит всегда, как и `listPieces`: прячет их
      экран, а не поиск, — иначе «в архиве» и «найдено» никогда не
      пересекаются (`content-factory-next-tu3k.11`).
    */
    const matched =
      (await this.search?.matchingIds(organizationId, query.q ?? '', 'PIECE')) ??
      (await this.pieces.searchPieceIds(
        organizationId,
        query.q,
        Boolean(query.includeArchived)
      ));

    const rows: PieceRowV1[] = [];
    for (let index = 0; index < all.length; index += 1) {
      const piece = all[index];
      const mine = byPiece.get(piece.id) ?? [];
      /*
        Клетка сама не знает про каналы, а список знает: `promoteNoChannel`
        поднимает «ещё нет» до «нет канала» ровно там, где площадка колонкой
        стала, а подключённого канала под ней нет. Без этого шага состояние
        `no_channel` жило только в контракте и в словах экрана, а в ответе не
        появлялось ни разу.
      */
      const cells = columns.map((column) =>
        withChannelName(
          promoteNoChannel(bestCell(column.platform, mine), column),
          channelNames
        )
      );
      if (piece.archivedAt && !query.includeArchived) continue;
      if (matched && !matched.has(piece.id)) continue;
      if (query.missingOn && this.writesTo(mine, query.missingOn)) continue;
      if (query.state && !cells.some((cell) => cell.state === query.state)) {
        continue;
      }
      const row = this.row(piece, index, language, cells);
      const matchedForms = query.q?.trim()
        ? matchedFormsOf(query.q, `${piece.title} ${piece.body}`)
        : undefined;
      rows.push(
        Object.assign(
          row,
          matchedForms
            ? {
                matchedForms,
                searchSnippet: matchedSnippetOf(piece.body, matchedForms),
              }
            : {}
        )
      );
    }

    return {
      state: all.length ? 'default' : 'empty',
      columns,
      pieces: rows,
    };
  }

  /** Страница одной заготовки: суть, адаптации и куда её ещё можно понести. */
  async detail(
    organizationId: string,
    pieceId: string,
    language: 'ru' | 'en'
  ): Promise<PieceDetailV1> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);

    const [order, integrations, adaptations] = await Promise.all([
      this.pieces.listPieceIds(organizationId),
      this.pieces.listIntegrations(organizationId),
      this.pieces.adaptationsByPiece(organizationId, [pieceId]),
    ]);
    const index = order.findIndex((row) => row.id === pieceId);
    const columns = columnsOf(integrations, adaptations);
    const channelNames = new Map(integrations.map((one) => [one.id, one.name]));
    const cells = columns.map((column) =>
      withChannelName(
        promoteNoChannel(bestCell(column.platform, adaptations), column),
        channelNames
      )
    );
    const core = this.coreOf(piece);

    /*
      Квитанции — одним заходом на страницу (`content-factory-next-97dq.2`,
      разбор корректности P1-2).

      Считались они построчно, и каждый вердикт голоса заново читал разбор
      области и её мерку: четыре запроса и своя арифметика на КАЖДУЮ строку.
      `Promise.all` этого не спасал — дорогая половина синхронная, так что
      параллельность только веером расходилась по базе.

      Теперь разбор читается один раз (`adaptationChecksMany`), и считаются
      только последние `PIECE_CHECKED_ADAPTATIONS` строк: строка качества
      относится к тексту, который человек сейчас правит, а двадцатая сверху
      адаптация — это история, и её квитанция стоила бы столько же, сколько
      живая. У строк постарше квитанции просто нет, и экран уже умеет её не
      показывать.
    */
    const checkable = adaptations.slice(-PIECE_CHECKED_ADAPTATIONS);
    const scored = checkable.filter((row) => trimmed(row.body));
    const checks = await adaptationChecksMany(
      {
        organizationId,
        language,
        foreignShingles: this.foreignShinglesOf(piece),
        grounded: this.groundedOf(core),
        supported: this.supportedOf(core),
      },
      scored.map((row) => ({
        text: row.body as string,
        platform: providerOfPlatform(row.platform),
        emojiCeiling: this.emojiCeilingFor(
          piece.tags,
          integrations.find((integration) => integration.id === row.integrationId)
        ),
      })),
      { slopCheck: this.slopCheck, voiceCheck: this.voiceCheck }
    );
    const holders = holdersOfRows(adaptations, piece.tags, integrations);
    const checksById = new Map(
      scored.map((row, index) => [row.id, checks[index]])
    );

    return {
      state: 'default',
      piece: this.row(piece, index < 0 ? order.length : index, language, cells),
      sentText: sentTextOf(core),
      channels: this.channelTabsOf(integrations, adaptations, piece.tags),
      linkQuestion: this.linkQuestionOf(core, integrations, adaptations, piece.tags),
      core,
      legacyBody: core ? null : piece.body,
      adaptations: adaptations.map((row) =>
        this.adaptationOf(
          row,
          pieceId,
          integrations,
          checksById.get(row.id),
          holders
        )
      ),
      targets: this.targetsOf(integrations, adaptations),
      later: ADAPTATION_KINDS_LATER,
    };
  }

  /* -----------------------------------------------------------------------
   * Отказы до первого байта
   * -------------------------------------------------------------------- */

  /**
   * Всё, что можно отклонить обычным HTTP, отклоняется здесь.
   *
   * Та же граница, что у входа одной мыслью: после первого байта код ответа не
   * изменить, и отказ становится строкой стрима, которую экран обязан уметь
   * прочитать. Поэтому сюда собрано всё решаемое заранее — заготовка, архив,
   * канал, его провайдер и вид адаптации.
   */
  async prepareAdapt(
    organizationId: string,
    pieceId: string,
    request: PieceAdaptRequestV1,
    language: 'ru' | 'en'
  ): Promise<PieceAdaptPlanV1> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', language, pieceId);

    const integrationId = trimmed(request?.integrationId);
    if (!integrationId) throw pieceError('PIECE_CHANNEL_REQUIRED', language);

    const integrations = await this.pieces.listIntegrations(organizationId);
    const integration = integrations.find((one) => one.id === integrationId);
    if (!integration) {
      throw pieceError('PIECE_CHANNEL_UNKNOWN', language, integrationId);
    }

    const provider = this.integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider) {
      throw pieceError(
        'PIECE_CHANNEL_UNSUPPORTED',
        language,
        integration.providerIdentifier
      );
    }

    const kinds = kindsOfProvider(integration.providerIdentifier);
    if (!kinds.length) {
      throw pieceError(
        'PIECE_CHANNEL_UNSUPPORTED',
        language,
        integration.providerIdentifier
      );
    }
    const wanted = trimmed(request?.kind) as AdaptationKindV1;
    // Видео и аудио — «позже»: они значатся в контракте как виды, но ни одна
    // площадка их не умеет, и отказ здесь честнее пустого черновика после.
    if (wanted && !kinds.includes(wanted)) {
      throw pieceError('ADAPTATION_KIND_UNSUPPORTED', language, wanted);
    }

    const core = this.coreOf(piece);
    if (core && !core.text.trim()) throw pieceError('PIECE_CORE_MISSING', language, pieceId);
    const earlier = await this.pieces.adaptationsByPiece(organizationId, [pieceId]);
    const profile = parseWritingProfile(
      integration.writingProfile,
      integration.providerIdentifier,
      integration.contentLanguage
    );
    const brandProfileSelection = await this.speakerOf(
      organizationId,
      request,
      profile,
      language
    );
    const postEmojiLevel = postEmojiLevelOf(
      request?.overrides?.emojiLevel,
      piece.tags,
      integration.id
    );
    return {
      pieceId,
      integrationId,
      firstOnChannel: !earlier.some((row) => row.integrationId === integration.id),
      ...(postEmojiLevel ? { postEmojiLevel } : {}),
      kind: wanted || kinds[0],
      language,
      request,
      ...(brandProfileSelection ? { brandProfileSelection } : {}),
      channel: {
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        contentLanguage: integration.contentLanguage ?? null,
        profile,
        maxLength: this.providerMaxLength(provider, integration),
        maxCaptionLength: provider.maxCaptionLength?.() ?? null,
        editor: provider.editor,
        planMode: planModeOf(integration.planMode),
        postingTimes: integration.postingTimes ?? null,
      },
      core,
      foreignShingles: this.foreignShinglesOf(piece),
      legacyBody: core ? null : piece.body,
      title: piece.title,
    };
  }

  /**
   * Политика «Решите за меня» для сути (`content-factory-next-97dq.99`).
   *
   * Суть пишется одна на заготовку и до каналов, поэтому говорит аватар по
   * умолчанию — тот же, что вход берёт выбором `{ mode: 'active' }`; выбор
   * «Кто говорит» у поста касается адаптации, а она несёт суть дословно.
   * Прочитать не удалось — политика по умолчанию: сбой чтения не должен
   * разрешать модели больше, чем разрешил человек.
   */
  private async coreDelegatedPolicy(
    organizationId: string
  ): Promise<DelegatedPolicyV1> {
    try {
      return typeof this.pieces.coreDelegatedPolicy === 'function'
        ? await this.pieces.coreDelegatedPolicy(organizationId)
        : DEFAULT_DELEGATED_POLICY;
    } catch (error) {
      this.logger.warn(
        `The avatar policy for «You decide» could not be read; using the default: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return DEFAULT_DELEGATED_POLICY;
    }
  }

  /**
   * Кто говорит в этой адаптации (`content-factory-next-97dq.38`).
   *
   * Порядок — от частного к общему: аватар, выбранный для этого поста;
   * явный `brandProfileSelection` запроса (старые клиенты); аватар карточки
   * канала; иначе ничего — граф возьмёт аватар области по умолчанию, как до
   * волны. Аватар называется версией его голоса, потому что граф и строитель
   * контекста понимают выбор версией (`{ mode: 'version' }`).
   *
   * Выбор человека на этот пост строг: чужой или удалённый аватар — отказ, и
   * аватар без голоса — тоже отказ, а не тихая подмена другим. Карточка канала
   * мягче: её аватар могли удалить после записи, и тогда адаптация пишется
   * как до волны, а в журнал уходит строка.
   */
  private async speakerOf(
    organizationId: string,
    request: PieceAdaptRequestV1,
    profile: ChannelWritingProfileV1,
    language: 'ru' | 'en'
  ): Promise<BrandProfileSelectionV1 | null> {
    const chosen = trimmed(request?.overrides?.brandProfileId);
    if (chosen) {
      const avatar = await this.pieces.findAvatar(organizationId, chosen);
      if (!avatar) throw pieceError('PIECE_AVATAR_UNKNOWN', language, chosen);
      if (!avatar.activeVersionId)
        throw pieceError('PIECE_AVATAR_NOT_READY', language, chosen);
      return { mode: 'version', versionId: avatar.activeVersionId };
    }
    if (request?.brandProfileSelection) {
      return request.brandProfileSelection as BrandProfileSelectionV1;
    }
    const channelAvatar = trimmed(profile.brandProfileId);
    if (channelAvatar) {
      const avatar = await this.pieces.findAvatar(organizationId, channelAvatar);
      if (avatar?.activeVersionId)
        return { mode: 'version', versionId: avatar.activeVersionId };
      this.logger.warn(
        `The channel avatar ${channelAvatar} is gone or has no voice; the adaptation uses the default avatar.`
      );
    }
    return null;
  }

  /** Предел знаков берётся у провайдера, третьей таблицы у продукта нет. */
  private providerMaxLength(provider: any, integration: any): number {
    let additionalSettings: unknown[] = [];
    try {
      additionalSettings = JSON.parse(integration?.additionalSettings || '[]');
    } catch {
      additionalSettings = [];
    }
    try {
      return provider.maxLength(additionalSettings);
    } catch {
      return provider.maxLength();
    }
  }

  /* -----------------------------------------------------------------------
   * Адаптация
   * -------------------------------------------------------------------- */

  /**
   * Одна адаптация: вопросы под канал, генерация, черновик и строка о нём.
   *
   * Вопросы терминальны на первом круге — это решение владельца «продукт
   * предлагает, а не спрашивает вместо текста»: клиент повторяет запрос с
   * ответами, с «Реши сама» или с «пропустить», и второй круг вопросов не
   * задаёт вовсе.
   */
  async *adapt(
    organizationId: string,
    plan: PieceAdaptPlanV1,
    /**
     * Кто нажал. Строку адаптации автор не подписывает — её подписывает
     * заготовка, которая уже несёт `createdByUserId`, — но подпись остаётся в
     * сигнатуре: дверь Z3 передаёт её, как и на входе одной мыслью, и менять
     * форму вызова ради одного неиспользуемого поля дороже, чем принять его.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    actorUserId?: string
  ): AsyncGenerator<PieceAdaptEventV1> {
    const language = plan.language;
    yield {
      name: 'adapt-started',
      pieceId: plan.pieceId,
      kind: plan.kind,
      channel: {
        id: plan.channel.id,
        name: plan.channel.name,
        providerIdentifier: plan.channel.providerIdentifier,
      },
    };

    const answers = this.channelAnswers(plan);
    // Материал считается до подсказок: он едет и словами (в промпт), и
    // идентификаторами (в строитель контекста), и считать его дважды значило
    // бы завести два ответа на вопрос «на чём стоит эта заготовка».
    const brief = this.briefMaterial(plan);
    /*
      Первая адаптация заготовки на этом канале даёт модели решить, нужно ли
      о чём-то спросить (`content-factory-next-97dq.44`, до неё — один
      шаблонный вопрос «что унести», `97dq.31`). Вопросы есть — круг
      терминален, клиент повторяет запрос с ответами, с «Решите за меня»
      (`decideKeys`) или с «Решите всё за меня» (`skipInterview`). Вопросов
      нет — а это обычный исход — текст пишется в этом же запросе.
    */
    let interviewed = false;
    if (this.asksBeforeAdapting(plan, answers)) {
      const questions = await askAdaptationQuestionsV4(
        {
          organizationId,
          language,
          channelName: plan.channel.name,
          providerIdentifier: plan.channel.providerIdentifier,
          maxLength: plan.channel.maxLength,
          core: plan.core?.text ?? '',
          brief: plan.core?.brief ?? null,
        },
        { aiUsage: this.aiUsage, warn: (message) => this.logger.warn(message) }
      );
      if (questions.length) {
        yield { name: 'questions', questions, round: 1 };
        return;
      }
      interviewed = true;
    }
    const hints = this.hintsOf(plan, answers, brief.material);
    // Модель только что решила, что спрашивать не о чем: второй вопрос изнутри
    // генерации (`channel-question/v2`) это решение не отменяет.
    hints.allowQuestion = !interviewed && !answers.length && !plan.request?.skipInterview && !(plan.request?.decideKeys?.length);
    /*
      Свои прежние тексты по теме — до генерации и одним списком для экрана и
      для модели (`content-factory-next-m2eg.19`). Событие идёт только когда
      что-то нашлось: «ничего не нашлось» не новость для человека, который
      просил написать пост.
    */
    const related = await this.relatedPosts(organizationId, plan);
    if (related.length) yield { name: 'related', related };
    const request: GeneratorRunInput = {
      // Предмет генерации — тезис заготовки, а сама суть едет подсказкой: она
      // не запрос человека, а материал, слова которого переносятся дословно.
      research:
        trimmed(plan.core?.brief?.thesis) ||
        trimmed(plan.core?.text) ||
        plan.title,
      isPicture: plan.request?.options?.isPicture === true,
      format: 'one_long',
      language,
      ...(plan.brandProfileSelection
        ? { brandProfileSelection: plan.brandProfileSelection as any }
        : {}),
      intake: hints,
      /*
        Адаптация в интернет не ходит (`content-factory-next-m2eg.16`,
        решение владельца 07.09.2026: «Выключить совсем»). Материал у неё уже
        на руках — суть заготовки, бриф и ответы человека под канал, — а поиск
        добавлял к нему находки на КАЖДОЙ площадке: одна заготовка, четыре
        канала, четыре платных обхода веба и четыре набора чужих цитат в
        тексте, которых человек не просил.
      */
      materialPolicy: 'PIECE_ONLY',
      /*
        Факты брифа, у которых уже есть запись в памяти области, называются
        строителю контекста явно. Без них он собрал бы контекст из того, что
        сам сочтёт подходящим; с ними адаптация стоит ровно на том, на чём
        стоит заготовка. Список пустой у заготовки, чей бриф собран из слов
        человека и ничем не подтверждён, — и тогда контекст просто пуст, что
        честно печатает `research()`.
      */
      ...(brief.factIds.length ? { factIds: brief.factIds } : {}),
      ...(brief.evidenceIds.length
        ? { userMaterialEvidenceIds: brief.evidenceIds }
        : {}),
      ...(related.length ? { relatedOwnPosts: related } : {}),
    } as GeneratorRunInput;

    let output: any = null;
    let adaptationQuestion: PieceQuestionV1 | null = null;
    let failed = false;
    try {
      for await (const event of this.generator.start(
        organizationId,
        request as any
      )) {
        const raw = event as any;
        if (raw?.error) {
          yield {
            name: 'error',
            error: true,
            code: trimmed(raw.code) || 'GENERATION_FAILED',
            message: trimmed(raw.message) || 'The adaptation could not be written.',
          };
          failed = true;
          break;
        }
        if (raw?.name === 'content-context') {
          yield { name: 'content-context', data: raw.data };
          continue;
        }
        const candidate = raw?.data?.output;
        if (hints.allowQuestion && candidate?.adaptationQuestion) adaptationQuestion = candidate.adaptationQuestion;
        if (candidate && Array.isArray(candidate.content)) output = candidate;
        yield { name: 'generator', event: raw };
      }
    } catch (error) {
      yield {
        name: 'error',
        error: true,
        code: (error as any)?.code || 'GENERATION_FAILED',
        message: describeError(error),
      };
      failed = true;
    }
    if (failed) return;
    if (adaptationQuestion) { yield { name: 'questions', questions: [adaptationQuestion], round: 1 }; return; }
    if (!output) {
      yield {
        name: 'error',
        error: true,
        code: 'GENERATION_FAILED',
        message: 'The generator finished without an adaptation.',
      };
      return;
    }

    // The last look for the author-link token before the text is saved
    // (review F3 of the fifteenth walk): a form the restore did not know
    // must not reach the published post or the autopilot queue.
    const leftover = stripLeftoverAuthorLinkDeep(output);
    if (leftover.found) {
      this.logger.warn(
        `Adaptation for channel ${plan.channel.id}: ${leftover.found} leftover author-link token(s) stripped before saving`
      );
      output = leftover.value;
    }

    const saved = await this.persist(organizationId, plan, output, answers);
    if (!saved) {
      yield {
        name: 'error',
        error: true,
        code: 'ADAPTATION_DRAFT_FAILED',
        message: 'The adaptation was written but could not be saved.',
      };
      return;
    }
    yield saved.event;
    // Optional questions when the material is short (`97dq.98`): after the
    // post is on the page, never instead of it, and never a failure.
    await this.askForMaterial(organizationId, plan, saved.adaptation);
    yield {
      name: 'done',
      adaptationId: saved.adaptation.id,
      postId: saved.adaptation.postId ?? null,
    };
  }

  /**
   * Черновик, строка происхождения и событие о них.
   *
   * Повторная адаптация того же канала пишет НОВУЮ строку и новый пост:
   * старая версия не затирается — она уже могла выйти, и переписывать след
   * вышедшего текста продукт не станет (допущение исполнителя, §11).
   */
  private async persist(
    organizationId: string,
    plan: PieceAdaptPlanV1,
    output: any,
    answers: PieceAnswerV1[]
  ) {
    /*
      Метки строк блока материала («[E2]», «[F1]») — адрес для
      `usedCitationIds`, а не слово текста (`content-factory-next-97dq.40`).
      Промпт это запрещает, а здесь снимается то, что модель всё-таки
      написала: до тела, до поста и до события, чтобы все три видели один
      текст. Идентификаторы источников остаются в `usedCitationIds`.
    */
    const content = (output.content as any[])
      .map((item) => ({
        content: trimmed(stripCitationLabels(trimmed(item?.content))),
        usedCitationIds: Array.isArray(item?.usedCitationIds)
          ? item.usedCitationIds.filter((id: unknown) => trimmed(id))
          : [],
      }))
      .filter((item) => item.content);
    if (!content.length) return null;

    const plain = content.map((item) => item.content).join('\n\n');
    const html = editorHtml(plain, plan.channel.editor);
    const snapshotId = trimmed(output.contentContextSnapshotId) || null;
    const versionId = trimmed(output.brandProfileVersionId) || null;

    /*
      Черновик и строка версии пишутся как до волны — на свободное время
      области. Место в плане канала (`97dq.57`) решается следом, под коротким
      замком канала и только записями в базу; Temporal — после фиксации (N2).
    */
    const draftDate = trimmed(output.date) || this.now().toISOString();
    const postId = await this.pieces.createDraft(organizationId, {
      channelId: plan.channel.id,
      providerIdentifier: plan.channel.providerIdentifier,
      content: html,
      date: draftDate,
      contentContextSnapshotId: snapshotId,
      brandProfileVersionId: versionId,
      usedCitationIds: [
        ...new Set(content.flatMap((item) => item.usedCitationIds)),
      ],
    });
    if (!postId) return null;

    const row = await this.pieces.createAdaptation(organizationId, {
      pieceId: plan.pieceId,
      postId,
      integrationId: plan.channel.id,
      platform: plan.channel.providerIdentifier,
      kind: plan.kind,
      title: plan.kind === 'article' ? plan.title : null,
      // Текст адаптации хранится простым текстом, а разметку несёт пост:
      // страница заготовки показывает текст, а не чужой редактор.
      body: plain,
      format: materialFormat(plain, null, plan.language),
      brandProfileVersionId: versionId,
    });
    if (!row) return null;
    const planned = this.planStore()
      ? await this.planNewVariantSafely(organizationId, plan, row.id, postId, html, draftDate)
      : null;
    // Новая адаптация должна находиться сразу: следующий канал этой же
    // заготовки уже вправе на неё сослаться (`content-factory-next-m2eg.19`).
    this.search?.invalidate(organizationId);

    /**
     * Квитанция проверок: считается сама, на каждой адаптации.
     *
     * До 07.09.2026 штампы считались только при `options.slopCheck === true`,
     * которого не присылал ни один клиент, — то есть не считались никогда.
     * Решение владельца (`fn33.28.4`): проверки живут там, где текст
     * окончателен, и просить о них не надо. Обе бесплатны: каталог штампов —
     * арифметика, вердикт голоса — та же мерка разбора, что и кнопка в ленте.
     *
     * Считает их `adaptationChecksOf` — то же место, что и чтение страницы
     * (`content-factory-next-97dq.2`). Отчёт антикопии отдаётся как есть: про
     * второй заход генерации знает только генерация.
     */
    const checks: AdaptationChecksV1 = await adaptationChecksOf(
      {
        organizationId,
        text: plain,
        platform: plan.channel.providerIdentifier,
        language: plan.language,
        antiCopy: output.antiCopy ?? null,
        // Тот же материал, из которого адаптация и написана: число из него
        // размытым количеством не считается (`97dq.10`).
        grounded: this.groundedOf(plan.core ?? null),
        supported: this.supportedOf(plan.core ?? null),
        // «До N» этого поста или канала (`97dq.83`).
        emojiCeiling: emojiCeilingOf(
          effectiveEmojiLevel(
            plan.postEmojiLevel || plan.request?.overrides?.emojiLevel,
            null,
            plan.channel.id,
            plan.channel.profile.emojiLevel
          )
        ),
      },
      { slopCheck: this.slopCheck, voiceCheck: this.voiceCheck }
    );
    const adaptation: AdaptationV1 = {
      id: row.id,
      pieceId: plan.pieceId,
      kind: plan.kind,
      platform: plan.channel.providerIdentifier,
      integrationId: plan.channel.id,
      integrationName: plan.channel.name,
      title: plan.kind === 'article' ? plan.title : null,
      body: plain,
      postId,
      mediaId: null,
      state: planned?.status === 'queued' ? 'queued' : 'draft',
      date: planned?.status === 'queued' ? planned.date : null,
      url: null,
      createdAt: isoOf(row.createdAt) || this.now().toISOString(),
      ...(answers.length ? { answers } : {}),
      checks,
      ...(planned ? { plan: planned } : {}),
    };

    const event: PieceAdaptEventV1 = {
      name: 'adaptation',
      adaptation,
      content,
      provenance: {
        contentContextSnapshotId: snapshotId,
        brandProfileVersionId: versionId,
        brandProfileSelection: output.brandProfileSelection ?? null,
        contentContextStatus: output.contentContextStatus ?? null,
        generationPolicy: output.generationPolicy ?? null,
        selectionHash: output.selectionHash ?? null,
      },
      draftGaps: Array.isArray(output.draftGaps) ? output.draftGaps : [],
      checks,
    };
    return { adaptation, event };
  }

  /* -----------------------------------------------------------------------
   * План канала (`content-factory-next-97dq.57`)
   *
   * Каждая постановка — два шага (review N2). Сначала под коротким замком
   * канала (`withChannelLock`, 10 с) — только решение и записи в базу через
   * транзакцию замка: правило одной очереди (`queueGate`), состояние и время
   * постов, колонки плана. Потом, после фиксации, — Temporal: остановить
   * процессы снятых постов и запустить процесс поставленного. Не
   * запустился — пост возвращается в черновик с причиной, а снятые версии
   * — в очередь, если их никто не тронул (`convergeFailedStart`).
   * -------------------------------------------------------------------- */

  /**
   * Хранилище плана. Наборы, собранные без него, живут как до волны: каждая
   * версия — черновик на свободном времени области.
   */
  private planStore(): Pick<
    PieceRepository,
    'channelVariants' | 'busySlots' | 'setPlan' | 'withChannelLock' | 'channelPlanMode'
  > | null {
    const repo = this.pieces as Partial<PieceRepository>;
    return typeof repo.channelVariants === 'function' &&
      typeof repo.busySlots === 'function' &&
      typeof repo.setPlan === 'function' &&
      typeof repo.withChannelLock === 'function' &&
      typeof repo.channelPlanMode === 'function'
      ? (this.pieces as PieceRepository)
      : null;
  }

  private lockChannel<T>(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    work: (db: PlanDb) => Promise<T>
  ): Promise<T> {
    return this.planStore()!.withChannelLock(organizationId, pieceId, integrationId, work);
  }

  /**
   * Режим, который решает за этот пост (`97dq.70`): свой режим поста, если
   * человек его выбрал, иначе режим канала. Читается тем же `db`, что и всё
   * остальное под замком (F8): режим мог смениться, пока шла генерация.
   */
  private async planModeFor(
    db: Pick<PlanDb, 'channelPlanMode' | 'pieceTags'>,
    organizationId: string,
    pieceId: string,
    integrationId: string
  ): Promise<PlanModeV1> {
    const own = db.pieceTags
      ? postPlanModeOf(await db.pieceTags(organizationId, pieceId), integrationId)
      : null;
    return own ?? planModeOf(await db.channelPlanMode(organizationId, integrationId));
  }

  /** Держатель слота заготовки в канале, кроме `exclude`: правило `adaptation-plan.ts`. */
  private holderOf(variants: PlanVariantRow[], exclude?: string): PlanVariantRow | null {
    const others = variants.filter((one) => one.id !== exclude);
    const holders = holderIds(others.map(planVariantOf));
    return others.find((one) => holders.has(one.id)) ?? null;
  }

  /**
   * Ближайшее свободное время САМОГО канала по его `postingTimes`. Занято то,
   * что держит живой пост этого канала, кроме черновиков вытесненных версий и
   * `exclude`. `null` — у канала нет своих времён.
   */
  private async freeSlotIn(
    db: PlanDb,
    organizationId: string,
    integrationId: string,
    postingTimes: string | null | undefined,
    exclude: readonly string[] = []
  ): Promise<Date | null> {
    const times = postingMinutesOf(postingTimes);
    if (!times.length) return null;
    const now = this.now();
    const busy = await db.busySlots(
      organizationId,
      integrationId,
      now,
      new Date(now.getTime() + 367 * 86_400_000),
      exclude
    );
    return nextFreeSlot(
      times,
      new Set(busy.map((at) => new Date(at).getTime())),
      now
    );
  }

  /** Снять версии с очереди — только в базе, под замком (N2). */
  private async releaseInDb(
    db: PlanDb,
    organizationId: string,
    variants: readonly PlanVariantRow[]
  ): Promise<ReleasedVariant[]> {
    const released: ReleasedVariant[] = [];
    for (const variant of variants) {
      if (!variant.post) continue;
      const saved = await db.setPostState(organizationId, variant.post.id, {
        state: 'DRAFT',
      });
      if (variant.plan === 'autopilot')
        await db.setPlan(organizationId, variant.id, { plan: 'reserve' }, 'autopilot');
      released.push({
        adaptationId: variant.id,
        postId: variant.post.id,
        planBefore: variant.plan,
        planAfter: variant.plan === 'autopilot' ? 'reserve' : variant.plan,
        updatedAt: saved?.updatedAt ?? null,
      });
    }
    return released;
  }

  /**
   * «Удалять при подтверждении» (`2q28.39`, решение владельца 26.09.2026).
   *
   * Человек подтвердил одну версию — черновики других версий этой заготовки
   * в этом канале уходят из календаря мягким удалением (`deletedAt`), а не
   * лежат там невидимыми дублями (живой заход 25.09, P3-5). Текст версии
   * (`ContentDerivation.body`) остаётся: «Вариант 1» по-прежнему читается на
   * заготовке, и его «Запланировать» возвращает тот же пост
   * (`restoreDraftPost`). Трогаются только живые `DRAFT`: очередь, вышедшее и
   * ошибка — никогда. Под «Без плана» слота нет и черновики видны, поэтому
   * они остаются, как до волны. Идёт после того, как очередь встала: отказ
   * или несостоявшийся старт ничего не удаляют. Сбой уборки подтверждение не
   * отменяет — черновик просто остаётся вытесненным, как раньше.
   */
  private async dropOtherDrafts(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    adaptationId: string
  ): Promise<void> {
    try {
      await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        if (!db.dropDraftPosts) return;
        if ((await this.planModeFor(db, organizationId, pieceId, integrationId)) === 'draft')
          return;
        const variants = await db.channelVariants(organizationId, pieceId, integrationId);
        const mine = variants.find((one) => one.id === adaptationId);
        if (!mine?.post || mine.post.deletedAt || upperState(mine.post.state) !== 'QUEUE') return;
        const others = variants
          .filter(
            (one) =>
              one.id !== adaptationId &&
              one.post &&
              one.post.id !== mine.post!.id &&
              !one.post.deletedAt &&
              one.post.integrationId === integrationId &&
              upperState(one.post.state) === 'DRAFT'
          )
          .map((one) => one.post!.id);
        if (others.length) await db.dropDraftPosts(organizationId, integrationId, others);
      });
    } catch (error) {
      this.logger.warn(
        `Piece ${pieceId}: other variants' drafts in channel ${integrationId} were not removed: ${describeError(error)}`
      );
    }
  }

  /** Temporal по состоянию поста в базе. Без календаря — «не запустилось». */
  private async syncWorkflow(
    organizationId: string,
    postId: string
  ): Promise<'started' | 'stopped' | 'failed'> {
    if (!this.posts?.syncPostWorkflow) {
      this.logger.error(`Post ${postId}: calendar port cannot sync workflows`);
      return 'failed';
    }
    try {
      return await this.posts.syncPostWorkflow(organizationId, postId);
    } catch (error) {
      this.logger.error(`Post ${postId} workflow sync failed: ${describeError(error)}`);
      return 'failed';
    }
  }

  /**
   * После фиксации: остановить снятые, запустить поставленный. `false` —
   * запуск не удался, и состояние уже сведено (`convergeFailedStart`).
   */
  private async applyQueueEffects(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    effects: QueueEffects,
    language: 'ru' | 'en'
  ): Promise<boolean> {
    for (const postId of effects.stop) await this.syncWorkflow(organizationId, postId);
    if (!effects.start) return true;
    const result = await this.syncWorkflow(organizationId, effects.start.postId);
    if (result !== 'failed') return true;
    await this.convergeFailedStart(organizationId, pieceId, integrationId, effects, language);
    return false;
  }

  /**
   * Процесс публикации не запустился (F7, F13, N1, N3, N4). Под коротким
   * замком: пост — в черновик с причиной; снятые версии — обратно в очередь,
   * только если они ровно такие, какими их оставили (черновик, та же метка,
   * тот же `updatedAt`, живые, выходят позже чем через две минуты). Если
   * вернуть пост в черновик не удалось — прежняя очередь НЕ возвращается
   * (иначе две очереди), и это громко пишется в журнал (N4).
   */
  private async convergeFailedStart(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    effects: QueueEffects,
    language: 'ru' | 'en'
  ) {
    const start = effects.start!;
    const note = PLAN_NOTES.startFailed[language];
    let restored: ReleasedVariant[] = [];
    try {
      restored = await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        const reverted = await db.setPostState(organizationId, start.postId, { state: 'DRAFT' });
        if (!reverted) throw new Error(`post ${start.postId} was not returned to drafts`);
        await db.setPlan(organizationId, start.adaptationId, { planNote: note });
        await db.setPlan(organizationId, start.adaptationId, { plan: 'reserve' }, 'autopilot');
        if (!effects.released.length) return [];
        const fresh = await db.channelVariants(organizationId, pieceId, integrationId);
        const now = this.now();
        const back: ReleasedVariant[] = [];
        for (const released of effects.released) {
          const variant = fresh.find((one) => one.id === released.adaptationId);
          const post = variant?.post;
          const untouched =
            !!post &&
            post.id === released.postId &&
            !post.deletedAt &&
            upperState(post.state) === 'DRAFT' &&
            variant!.plan === released.planAfter &&
            !!released.updatedAt &&
            !!post.updatedAt &&
            new Date(post.updatedAt).getTime() === released.updatedAt.getTime() &&
            new Date(post.publishDate).getTime() > now.getTime() + QUEUE_REPLACE_MARGIN_MS;
          if (!untouched) continue;
          // Одна очередь (I1): пока шёл старт, другую версию могли поставить
          // (параллельная постановка) или заготовка могла выйти. Тогда не
          // возвращается ничего — вторая очередь выпустила бы её дважды.
          const gate = queueGate(fresh, released.adaptationId, now, {
            releaseHuman: false,
            blockPublished: true,
          });
          if (gate.block || gate.release.length || back.length) continue;
          await db.setPostState(organizationId, released.postId, { state: 'QUEUE' });
          if (released.planBefore !== released.planAfter)
            await db.setPlan(organizationId, released.adaptationId, { plan: released.planBefore });
          back.push(released);
        }
        return back;
      });
    } catch (error) {
      this.logger.error(
        `ALERT 97dq.57: post ${start.postId} is queued in the database but its publishing workflow did not start, and returning it to drafts failed (${describeError(error)}). The previous queue was NOT restored; check this post by hand.`
      );
      return;
    }
    await this.syncWorkflow(organizationId, start.postId);
    for (const released of restored) {
      if ((await this.syncWorkflow(organizationId, released.postId)) === 'failed')
        await this.markStartFailed(organizationId, pieceId, integrationId, released.adaptationId, released.postId, language);
    }
  }

  /**
   * Возвращённая очередь тоже не запустилась (N3): пост — в черновик с
   * причиной, без повторных попыток и без долгого замка.
   */
  private async markStartFailed(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    adaptationId: string,
    postId: string,
    language: 'ru' | 'en'
  ) {
    try {
      await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        await db.setPostState(organizationId, postId, { state: 'DRAFT' });
        await db.setPlan(organizationId, adaptationId, { planNote: PLAN_NOTES.startFailed[language] });
        await db.setPlan(organizationId, adaptationId, { plan: 'reserve' }, 'autopilot');
      });
    } catch (error) {
      this.logger.error(
        `ALERT 97dq.57: post ${postId} is queued in the database without a publishing workflow and could not be returned to drafts (${describeError(error)}).`
      );
      return;
    }
    await this.syncWorkflow(organizationId, postId);
  }

  /**
   * Версия и её черновой пост уже записаны, поэтому постановка не бросает
   * (review F13): любой сбой оставляет новую версию бронью с причиной.
   * Замок откатывает всё, что под ним было записано, — снятые очереди
   * остаются на месте.
   */
  private async planNewVariantSafely(
    organizationId: string,
    plan: PieceAdaptPlanV1,
    adaptationId: string,
    postId: string,
    html: string,
    draftDate: string
  ): Promise<AdaptationPlanV1> {
    try {
      return await this.planNewVariant(organizationId, plan, adaptationId, postId, html, draftDate);
    } catch (error) {
      this.logger.error(
        `Adaptation ${adaptationId} was saved but not placed: ${describeError(error)}`
      );
      const note = PLAN_NOTES.settleFailed[plan.language];
      try {
        await this.planStore()?.setPlan(organizationId, adaptationId, {
          plan: 'reserve',
          planNote: note,
        });
      } catch (writeError) {
        this.logger.error(
          `Adaptation ${adaptationId} plan note not written: ${describeError(writeError)}`
        );
      }
      return {
        status: 'reserved',
        date: isoOf(draftDate),
        autopilot: false,
        current: true,
        note,
      };
    }
  }

  /**
   * Новая версия записана — теперь её место (I1). Бронь прежней версии
   * переходит к новой вместе со временем; очередь автопилота — тоже, по
   * правилу одной очереди (`queueGate`: F1, F3, I4). Иначе — ближайшее
   * свободное время канала. Режим читается заново под замком (F8); площадка
   * проверяет пост до замка (I3), чтобы замок не ждал её.
   */
  private async planNewVariant(
    organizationId: string,
    plan: PieceAdaptPlanV1,
    adaptationId: string,
    postId: string,
    html: string,
    draftDate: string
  ): Promise<AdaptationPlanV1> {
    const store = this.planStore()!;
    const language = plan.language;
    const before = await this.planModeFor(store, organizationId, plan.pieceId, plan.channel.id);
    let validated = false;
    let refusal: string | null = null;
    if (before === 'autopilot' && this.posts) {
      refusal =
        (
          await this.queueRefusal(
            organizationId,
            {
              id: postId,
              content: html,
              image: '[]',
              settings: JSON.stringify({ __type: plan.channel.providerIdentifier }),
              integration: {
                id: plan.channel.id,
                name: plan.channel.name,
                providerIdentifier: plan.channel.providerIdentifier,
              },
            },
            language
          )
        )?.text ?? null;
      validated = true;
    }

    const decided = await this.lockChannel(
      organizationId,
      plan.pieceId,
      plan.channel.id,
      async (db): Promise<{ plan: AdaptationPlanV1; effects: QueueEffects }> => {
        const mode = await this.planModeFor(db, organizationId, plan.pieceId, plan.channel.id);
        if (mode === 'draft') {
          await db.setPlan(organizationId, adaptationId, { plan: 'draft' });
          return {
            plan: { status: 'draft', date: null, autopilot: false, current: true },
            effects: NO_EFFECTS,
          };
        }
        const now = this.now();
        const variants = await db.channelVariants(organizationId, plan.pieceId, plan.channel.id);
        const holder = this.holderOf(variants, adaptationId);
        const holderPost = holder?.post && !holder.post.deletedAt ? holder.post : null;
        const holderState = upperState(holderPost?.state);
        const holderAt = holderPost ? new Date(holderPost.publishDate).getTime() : NaN;
        const free = await this.freeSlotIn(
          db,
          organizationId,
          plan.channel.id,
          plan.channel.postingTimes,
          [postId, ...(holderPost && holderState === 'DRAFT' ? [holderPost.id] : [])]
        );
        let date: string | null = free ? free.toISOString() : null;
        let fromQueue = false;
        if (
          holderPost &&
          holderState === 'DRAFT' &&
          (holder!.plan === 'reserve' || holder!.plan === 'autopilot') &&
          holderAt > now.getTime() + QUEUE_REPLACE_MARGIN_MS
        ) {
          date = new Date(holderAt).toISOString();
        } else if (
          holderPost &&
          mode === 'autopilot' &&
          holder!.plan === 'autopilot' &&
          canReplaceQueued(holderPost, now)
        ) {
          date = new Date(holderAt).toISOString();
          fromQueue = true;
        }

        let note: string | null = null;
        let effects = NO_EFFECTS;
        if (mode === 'autopilot' && validated) {
          note = !this.posts
            ? ADAPTATION_WORKSPACE_MESSAGES.ADAPTATION_SCHEDULE_UNAVAILABLE[language]
            : !date
            ? PLAN_NOTES.noTimes[language]
            : null;
          if (!note) {
            const gate = queueGate(variants, adaptationId, now, {
              releaseHuman: false,
              blockPublished: true,
            });
            if (gate.block) note = PLAN_NOTES[gate.block][language];
            else if (refusal) note = refusal;
            else {
              const released = await this.releaseInDb(
                db,
                organizationId,
                variants.filter((one) => gate.release.includes(one.id))
              );
              effects = {
                stop: released.map((one) => one.postId),
                start: { adaptationId, postId },
                released,
              };
            }
          }
        }
        const queued = !!effects.start;
        // Не встала в очередь, а время было прежней очереди, — на своё
        // свободное время, чтобы две версии не стояли на одной минуте.
        if (!queued && fromQueue) date = free ? free.toISOString() : null;
        await db.setPostState(organizationId, postId, {
          ...(queued ? { state: 'QUEUE' as const } : {}),
          ...(date ? { publishDate: new Date(date) } : {}),
        });
        await db.setPlan(organizationId, adaptationId, {
          plan: queued ? 'autopilot' : 'reserve',
          planNote: note,
        });
        return {
          plan: {
            status: queued ? 'queued' : 'reserved',
            date: date ?? isoOf(draftDate),
            autopilot: queued,
            current: true,
            ...(note ? { note } : {}),
          },
          effects,
        };
      }
    );

    if (
      !(await this.applyQueueEffects(
        organizationId,
        plan.pieceId,
        plan.channel.id,
        decided.effects,
        language
      ))
    ) {
      return {
        status: 'reserved',
        date: decided.plan.date,
        autopilot: false,
        current: true,
        note: PLAN_NOTES.startFailed[language],
      };
    }
    return decided.plan;
  }

  /**
   * Дата без смены состояния, затем очередь — те же два шага, что у окна.
   * Путь наборов без плана канала. Если процесс публикации не запустился,
   * пост возвращается в черновик и звавший получает `QueueStartFailed` (F7).
   */
  private async queuePost(organizationId: string, postId: string, iso: string) {
    await this.posts!.changeDate(organizationId, postId, iso, 'update');
    const result = (await this.posts!.changePostStatus(
      organizationId,
      postId,
      'schedule'
    )) as { workflow?: string } | undefined;
    if (result?.workflow === 'failed') {
      try {
        await this.posts!.changePostStatus(organizationId, postId, 'draft');
      } catch (error) {
        this.logger.error(
          `ALERT 97dq.57: post ${postId} is queued without a publishing workflow and was not returned to drafts: ${describeError(error)}`
        );
      }
      throw new QueueStartFailed(postId);
    }
  }

  /* -----------------------------------------------------------------------
   * Уточнения заготовки
   * -------------------------------------------------------------------- */

  /**
   * Всё, что можно отклонить обычным HTTP, отклоняется здесь.
   *
   * Та же граница, что у адаптации и у входа. Отвечать нечему у материала до
   * волны заготовок: сути у него нет, есть тело одного канала, и переписывать
   * его по ответам значило бы выдать чужую разметку за нейтральную суть.
   */
  async selectFact(organizationId: string, pieceId: string, key: string, selected: boolean) {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    const core = this.coreOf(piece);
    if (!core || !this.briefs) throw pieceError('PIECE_CORE_MISSING', 'ru', pieceId);
    const matches = (fact: PieceFactV2) => fact.factKey === key || fact.statement === key;
    const found = core.brief.facts.find(matches);
    if (!found)
      throw new AdaptationReviewError(
        'PIECE_FACT_NOT_FOUND',
        409,
        'Такой опоры в актуальной заготовке уже нет. Обновите страницу.'
      );
    const facts = core.brief.facts.map((fact: PieceFactV2) => matches(fact) ? { ...fact, selected } : fact);
    await this.briefs.updateCoreMetadata(organizationId, pieceId, { expectedBody: piece.body, expectedBrief: piece.brief, brief: { ...(piece.brief as object), brief: { ...core.brief, facts } } });
    return { factKey: found.factKey ?? found.statement, selected };
  }

  async updateTitle(organizationId: string, pieceId: string, title: string) {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    if (!this.briefs) throw new Error('Piece repository unavailable');
    await this.briefs.updateCoreMetadata(organizationId, pieceId, {
      title: title.trim(), expectedBody: piece.body || '', expectedBrief: piece.brief,
      brief: { ...((piece.brief && typeof piece.brief === 'object') ? piece.brief as object : {}), titleEdited: true },
    });
    return { title: title.trim() };
  }

  /* -----------------------------------------------------------------------
   * Ссылка для поста и правка заготовки (`content-factory-next-97dq.75`)
   *
   * Всё пишется в `ContentPiece.brief` рядом с сутью, с той же проверкой
   * «строка не изменилась», что у выбора опоры и названия: две вкладки не
   * затирают друг друга молча. Ничего здесь не зовёт модель, кроме явного
   * «Пересобрать суть».
   * -------------------------------------------------------------------- */

  /** The piece and its core for a write, or the refusal the page shows. */
  private async editablePiece(
    organizationId: string,
    pieceId: string,
    language: 'ru' | 'en'
  ): Promise<{ piece: PieceRow; core: ZagotovkaCoreV1 }> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', language, pieceId);
    const core = this.coreOf(piece);
    if (!core) throw pieceError('PIECE_CORE_MISSING', language, pieceId);
    if (!this.briefs) throw new Error('Piece repository unavailable');
    return { piece, core };
  }

  /** The row moved under the write: the page reloads rather than guesses. */
  private coreChanged(language: 'ru' | 'en'): AdaptationReviewError {
    return new AdaptationReviewError(
      'PIECE_CORE_CHANGED',
      409,
      CORE_EDIT_WORDS.changed[language]
    );
  }

  /**
   * «Какую ссылку поставить в пост?» (`97dq.75`): the answer, as the author
   * gave it — an http(s) address or `null` for «Без ссылки». Written with
   * origin `author`; answering again replaces it («там же он может и
   * передумать»). No model call.
   */
  async savePostLink(
    organizationId: string,
    pieceId: string,
    input: PiecePostLinkRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<{ postLink: PiecePostLinkV1 }> {
    const { piece } = await this.editablePiece(organizationId, pieceId, language);
    const url = input?.url === null ? null : normalizePostLink(input?.url);
    if (input?.url !== null && !url)
      throw new AdaptationReviewError(
        'PIECE_POST_LINK_INVALID',
        400,
        CORE_EDIT_WORDS.linkInvalid[language]
      );
    const postLink = postLinkAnswer(url, this.now().toISOString(), input?.text);
    try {
      await this.briefs!.updateCoreMetadata(organizationId, pieceId, {
        expectedBody: piece.body || '',
        expectedBrief: piece.brief,
        brief: { ...((piece.brief as Record<string, unknown>) ?? {}), postLink },
      });
    } catch {
      throw this.coreChanged(language);
    }
    return { postLink };
  }

  /**
   * The core edited by hand (`97dq.75`): saved as the new core, the replaced
   * text kept in `revisions`. `expected` is the text the author started
   * from; if the core moved meanwhile, nothing is written. No model call —
   * only the local check on stock phrases is recounted for the quality line.
   */
  async editCore(
    organizationId: string,
    pieceId: string,
    input: PieceCoreEditRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<{ text: string; savedAt: string; revisions: number }> {
    const { piece, core } = await this.editablePiece(organizationId, pieceId, language);
    if (editedCoreText(input?.expected ?? '') !== editedCoreText(core.text))
      throw this.coreChanged(language);
    const text = editedCoreText(input?.text ?? '');
    if (!text)
      throw new AdaptationReviewError(
        'PIECE_CORE_EMPTY',
        400,
        CORE_EDIT_WORDS.empty[language]
      );
    const savedAt = this.now().toISOString();
    if (text === core.text)
      return { text, savedAt, revisions: core.revisions?.length ?? 0 };
    // Autosaves of one session are one revision (`97dq.75` review P2-4).
    const revisions = editStartsRevision(core, this.now())
      ? withRevision(
          core.revisions,
          {
            text: core.text,
            writtenBy: coreAuthorOf(core),
            materialPending: core.materialPending === true,
          },
          savedAt
        )
      : core.revisions ?? [];
    try {
      await this.pieces.acceptCoreReview(
        organizationId,
        pieceId,
        { body: piece.body, title: piece.title, brief: piece.brief },
        text,
        piece.title,
        {
          ...((piece.brief as Record<string, unknown>) ?? {}),
          slop: runSlopCheck(text, { platform: 'core', locale: language }),
          editedBy: 'person',
          editedAt: savedAt,
          revisions,
        }
      );
    } catch {
      throw this.coreChanged(language);
    }
    return { text, savedAt, revisions: revisions.length };
  }

  /* -----------------------------------------------------------------------
   * «Материала мало» (`content-factory-next-97dq.98`)
   *
   * The owner, 25.09.2026: «Мы разрешим ИИ задавать просто дополнительные
   * вопросы и объяснять, почему он их задает. Но они являются
   * необязательными.» The rule and its storage: `material-asks.ts`; the
   * prompt: `channels/material-questions.v1.ts`.
   * -------------------------------------------------------------------- */

  /**
   * After a post is written: clearly short of the length it was written to
   * — ask for one to three questions and keep them beside the post settings.
   * Questions still open for the same core move to the new post without a
   * model call; «Не нужно» for the same core and an answered round are not
   * asked again. Never throws.
   */
  private async askForMaterial(
    organizationId: string,
    plan: PieceAdaptPlanV1,
    adaptation: AdaptationV1
  ): Promise<void> {
    const core = plan.core?.text ?? '';
    if (!core.trim() || !this.aiUsage || !this.planStore()) return;
    try {
      const target = channelLengthTarget(
        plan.channel.profile,
        {
          identifier: plan.channel.providerIdentifier,
          name: plan.channel.name,
          contentLanguage: plan.channel.contentLanguage,
          maxLength: plan.channel.maxLength,
          maxCaptionLength: plan.channel.maxCaptionLength,
          editor: plan.channel.editor,
        },
        {
          withPicture: plan.request?.options?.isPicture === true,
          post: postOverridesOf(plan.request, plan.postEmojiLevel),
        }
      );
      const short = materialShortfall(adaptation.body ?? '', target);
      if (!short) return;
      const digest = coreDigest(core);
      const piece = await this.pieces.getPiece(organizationId, plan.pieceId);
      const before = materialAskRecordOf(piece?.tags ?? null, plan.channel.id);
      if (!mayAskMaterial(before, core)) return;
      const carried =
        before?.state === 'open' && before.core === digest && before.questions.length
          ? before.questions
          : null;
      const questions =
        carried ??
        (await askMaterialQuestionsV1(
          {
            organizationId,
            language: plan.language,
            channelName: plan.channel.name,
            providerIdentifier: plan.channel.providerIdentifier,
            length: short.length,
            min: short.min,
            core,
            post: adaptation.body ?? '',
            brief: plan.core?.brief ?? null,
          },
          { aiUsage: this.aiUsage, warn: (message) => this.logger.warn(message) }
        ));
      if (!questions.length) return;
      const record: MaterialAskRecordV1 = {
        adaptationId: adaptation.id,
        length: short.length,
        min: short.min,
        questions,
        state: 'open',
        core: digest,
        askedAt: this.now().toISOString(),
        closedAt: null,
      };
      await this.writeMaterialAsk(organizationId, plan.pieceId, plan.channel.id, (current) =>
        mayAskMaterial(current, core) ? record : undefined
      );
    } catch (error) {
      this.logger.warn(
        `Material questions for channel ${plan.channel.id} were not kept: ${describeError(error)}`
      );
    }
  }

  /**
   * One channel's record under the piece row lock, like the post settings.
   * `next` returns the record to write, `null` to remove, `undefined` to
   * leave the tags as they are. Returns what was written.
   */
  private async writeMaterialAsk(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    next: (current: MaterialAskRecordV1 | null) => MaterialAskRecordV1 | null | undefined
  ): Promise<{ before: MaterialAskRecordV1 | null; written: boolean }> {
    return this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
      const locked = db.lockPieceTags
        ? await db.lockPieceTags(organizationId, pieceId)
        : { tags: db.pieceTags ? await db.pieceTags(organizationId, pieceId) : null };
      if (!locked) return { before: null, written: false };
      const before = materialAskRecordOf(locked.tags, integrationId);
      const record = next(before);
      if (record === undefined || !db.writePieceTags) return { before, written: false };
      await db.writePieceTags(
        organizationId,
        pieceId,
        withMaterialAsk(locked.tags, integrationId, record)
      );
      return { before, written: true };
    });
  }

  /**
   * The person's reply to the optional questions (`97dq.98`). «Не нужно»
   * closes them for good. Answers join the piece's material exactly as
   * «Дописать материал» does — «question → answer», the question going
   * along so the core writer knows what each answer is about — and the
   * page then rebuilds the core and rewrites this channel's post through
   * the existing doors. The round is claimed under the lock first, so a
   * second press does not add the same words twice.
   */
  async materialQuestions(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    input: PieceMaterialQuestionsRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PieceMaterialQuestionsResponseV1> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', language, pieceId);
    if (!this.planStore())
      throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);
    const adaptationId = trimmed(input?.adaptationId);
    const stored = materialAskRecordOf(piece.tags, integrationId);
    if (!stored || !adaptationId || stored.adaptationId !== adaptationId)
      throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId || integrationId);
    const closed = (
      record: MaterialAskRecordV1,
      state: 'dismissed' | 'answered'
    ): MaterialAskRecordV1 => ({ ...record, state, closedAt: this.now().toISOString() });
    const stillOpen = (current: MaterialAskRecordV1 | null) =>
      current?.state === 'open' && current.adaptationId === adaptationId;

    if (input?.dismiss === true) {
      const outcome = await this.writeMaterialAsk(organizationId, pieceId, integrationId, (current) =>
        stillOpen(current) ? closed(current!, 'dismissed') : undefined
      );
      const state = outcome.before?.state;
      return { state: outcome.written || state !== 'answered' ? 'dismissed' : 'answered' };
    }

    const byKey = new Map(stored.questions.map((question) => [question.key, question]));
    const answers = (Array.isArray(input?.answers) ? input.answers : []).flatMap((answer) => {
      const question = byKey.get(answer?.key as PieceQuestionV1['key']);
      const text = typeof answer?.text === 'string' ? answer.text.trim() : '';
      return question && text
        ? [{ key: question.key, question: question.question, text }]
        : [];
    });
    if (!answers.length)
      throw new AdaptationReviewError(
        'PIECE_MATERIAL_EMPTY',
        400,
        CORE_EDIT_WORDS.materialEmpty[language]
      );
    const claim = await this.writeMaterialAsk(organizationId, pieceId, integrationId, (current) =>
      stillOpen(current) ? closed(current!, 'answered') : undefined
    );
    if (!claim.written) {
      const state = claim.before?.state;
      return { state: state === 'dismissed' ? 'dismissed' : 'answered' };
    }
    try {
      const added = await this.appendMaterial(
        organizationId,
        pieceId,
        { text: adaptationInterviewLines(answers).join('\n') },
        language
      );
      return { state: 'answered', materialPending: added.materialPending };
    } catch (error) {
      // The words did not land: the questions open again, answers and all.
      await this.writeMaterialAsk(organizationId, pieceId, integrationId, (current) =>
        current?.state === 'answered' && current.adaptationId === adaptationId
          ? { ...current, state: 'open', closedAt: null }
          : undefined
      ).catch(() => undefined);
      throw error;
    }
  }

  /**
   * «Дописать материал» (`97dq.75`): the words join the author's material —
   * appended to `personText`, which every core rewrite reads, and recorded in
   * `addedMaterial`. The core itself does not change: the piece says
   * «суть ещё не учитывает дописанное» until the author asks for a rebuild.
   */
  async appendMaterial(
    organizationId: string,
    pieceId: string,
    input: PieceMaterialAppendRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<{ addedMaterial: PieceAddedMaterialV1[]; materialPending: true }> {
    const { piece, core } = await this.editablePiece(organizationId, pieceId, language);
    const text = (input?.text ?? '').replace(/\r\n?/gu, '\n').trim();
    if (!text)
      throw new AdaptationReviewError(
        'PIECE_MATERIAL_EMPTY',
        400,
        CORE_EDIT_WORDS.materialEmpty[language]
      );
    const personText = appendedPersonText(core.personText, text);
    if (
      (core.addedMaterial?.length ?? 0) >= PIECE_ADDED_MATERIAL_MAX ||
      personText.length > PIECE_PERSON_TEXT_MAX
    )
      throw new AdaptationReviewError(
        'PIECE_MATERIAL_FULL',
        400,
        CORE_EDIT_WORDS.materialFull[language]
      );
    const addedMaterial = [
      ...(core.addedMaterial ?? []),
      { text, addedAt: this.now().toISOString() },
    ];
    try {
      await this.briefs!.updateCoreMetadata(organizationId, pieceId, {
        expectedBody: piece.body || '',
        expectedBrief: piece.brief,
        brief: {
          ...((piece.brief as Record<string, unknown>) ?? {}),
          personText,
          addedMaterial,
          materialPending: true,
        },
      });
    } catch {
      throw this.coreChanged(language);
    }
    return { addedMaterial, materialPending: true };
  }

  /**
   * «Пересобрать суть» (`97dq.75`): the existing core-write path over the
   * enlarged material — the brief, the answers and the author's words with
   * what was added. A hand-edited core is handed over as the core to enrich,
   * so the author's edit is built on rather than thrown away. The replaced
   * text goes into `revisions`. If the model does not answer, nothing is
   * written: the fallback core would be worse than the one on the page.
   */
  async rebuildCore(
    organizationId: string,
    pieceId: string,
    language: 'ru' | 'en' = 'ru'
  ): Promise<{ text: string; revisions: number }> {
    // One rebuild per piece at a time (`97dq.75` review P2-7): a second press
    // would pay for a second call whose answer loses the race anyway.
    const key = `${organizationId}:${pieceId}`;
    if (this.rebuilding.has(key))
      throw new AdaptationReviewError(
        'PIECE_REBUILD_RUNNING',
        409,
        CORE_EDIT_WORDS.rebuildRunning[language]
      );
    this.rebuilding.add(key);
    try {
      return await this.rebuildCoreOnce(organizationId, pieceId, language);
    } finally {
      this.rebuilding.delete(key);
    }
  }

  private async rebuildCoreOnce(
    organizationId: string,
    pieceId: string,
    language: 'ru' | 'en'
  ): Promise<{ text: string; revisions: number }> {
    const { piece, core } = await this.editablePiece(organizationId, pieceId, language);
    if (!this.aiUsage)
      throw new AdaptationReviewError(
        'PIECE_REBUILD_FAILED',
        503,
        CORE_EDIT_WORDS.rebuildFailed[language]
      );
    const rewritten = await writeCore(
      {
        organizationId,
        language,
        delegatedPolicy: await this.coreDelegatedPolicy(organizationId),
        brief: selectedFactsBrief(core.brief),
        answers: core.answers,
        // Every answer goes with its question, the model's decisions included.
        questionTextByKey: Object.fromEntries(
          core.answers.map((answer) => [
            answer.key,
            answer.question || coreQuestionText(answer.key, language),
          ])
        ),
        personText: core.personText ?? '',
        instruction: instructionOf(core),
        // `97dq.85`: the core on the page always goes along — the rebuild
        // keeps what it carried from the decisions and the author's words,
        // and the added material gets its own block to be woven in.
        rebuildFrom: { text: core.text, byPerson: core.editedBy === 'person' },
        addedMaterial: (core.addedMaterial ?? []).map((entry) => entry.text),
        borrowed: (piece.brief as any)?.borrowed ?? null,
        foreignShingles: this.foreignShinglesOf(piece),
      },
      {
        aiUsage: this.aiUsage,
        slopCheck: this.slopCheck,
        warn: (message) => this.logger.warn(message),
      }
    );
    if (rewritten.writtenBy !== 'model' || !rewritten.text.trim())
      throw new AdaptationReviewError(
        'PIECE_REBUILD_FAILED',
        503,
        CORE_EDIT_WORDS.rebuildFailed[language]
      );
    const revisions = withRevision(
      core.revisions,
      {
        text: core.text,
        writtenBy: coreAuthorOf(core),
        materialPending: core.materialPending === true,
      },
      this.now().toISOString()
    );
    try {
      await this.pieces.acceptCoreReview(
        organizationId,
        pieceId,
        { body: piece.body, title: piece.title, brief: piece.brief },
        rewritten.text,
        piece.title,
        {
          ...((piece.brief as Record<string, unknown>) ?? {}),
          ...this.storedCore(rewritten),
          brief: core.brief,
          answers: core.answers,
          authorNumbers: rewritten.authorNumbers || core.authorNumbers,
          personText: core.personText ?? '',
          questions: core.questions,
          editedBy: undefined,
          editedAt: undefined,
          materialPending: undefined,
          revisions,
        }
      );
    } catch {
      throw this.coreChanged(language);
    }
    return { text: rewritten.text, revisions: revisions.length };
  }

  /**
   * «Вернуть эту версию» (`97dq.85`): a stored core text becomes the core
   * again, and the text it replaces joins `revisions` — restoring is itself a
   * new revision, so nothing is lost either way. The same guards as a hand
   * edit: `expected` must be the core on the page, the row must not move
   * under the write, and a running rebuild wins. No model call.
   *
   * What changes with the text (review of 97dq.81-85, P3-2): who wrote it,
   * the stock-phrase check, and whether added material is waiting
   * (`restoredMaterialPending`). What stays is the piece's material — the
   * brief, the answers and the model's decisions the receipt shows. They
   * describe what the piece knows, not one text: restoring an older text does
   * not un-answer a question or un-decide a field, exactly as a hand edit
   * does not, and the next rebuild reads them again. `authorNumbers` is read
   * from the author's words and answers, so it stays true for any text.
   */
  async restoreCore(
    organizationId: string,
    pieceId: string,
    input: PieceCoreRestoreRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<{ text: string; revisions: number }> {
    if (this.rebuilding.has(`${organizationId}:${pieceId}`))
      throw new AdaptationReviewError(
        'PIECE_REBUILD_RUNNING',
        409,
        CORE_EDIT_WORDS.rebuildRunning[language]
      );
    const { piece, core } = await this.editablePiece(organizationId, pieceId, language);
    if (editedCoreText(input?.expected ?? '') !== editedCoreText(core.text))
      throw this.coreChanged(language);
    const chosen = Number.isInteger(input?.index)
      ? core.revisions?.[input.index]
      : undefined;
    if (!chosen || chosen.replacedAt !== input?.replacedAt || !chosen.text.trim())
      throw new AdaptationReviewError(
        'PIECE_CORE_CHANGED',
        409,
        CORE_EDIT_WORDS.revisionMissing[language]
      );
    const at = this.now().toISOString();
    if (chosen.text === core.text)
      return { text: core.text, revisions: core.revisions?.length ?? 0 };
    const revisions = withRevision(
      core.revisions,
      {
        text: core.text,
        writtenBy: coreAuthorOf(core),
        materialPending: core.materialPending === true,
      },
      at
    );
    const byPerson = chosen.writtenBy === 'person';
    // The restored text did not read material added after it (P2-2).
    const materialPending = restoredMaterialPending(
      core.revisions ?? [],
      input.index,
      core.addedMaterial ?? []
    );
    try {
      await this.pieces.acceptCoreReview(
        organizationId,
        pieceId,
        { body: piece.body, title: piece.title, brief: piece.brief },
        chosen.text,
        piece.title,
        {
          ...((piece.brief as Record<string, unknown>) ?? {}),
          slop: runSlopCheck(chosen.text, { platform: 'core', locale: language }),
          ...(byPerson ? {} : { writtenBy: chosen.writtenBy }),
          editedBy: byPerson ? 'person' : undefined,
          // No edit session carries over: the next hand edit keeps this text.
          editedAt: undefined,
          materialPending: materialPending ? true : undefined,
          revisions,
        }
      );
    } catch {
      throw this.coreChanged(language);
    }
    return { text: chosen.text, revisions: revisions.length };
  }

  async prepareAnswer(
    organizationId: string,
    pieceId: string,
    request: PieceAnswerRequestV1,
    language: 'ru' | 'en'
  ): Promise<PieceAnswerPlanV1> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', language, pieceId);
    const core = this.coreOf(piece);
    if (!core) throw pieceError('PIECE_CORE_MISSING', language, pieceId);
    return {
      pieceId,
      language,
      request: request || {},
      core,
      foreignShingles: this.foreignShinglesOf(piece),
      borrowed: (piece.brief as any)?.borrowed ?? null,
      title: piece.title,
      titleEdited: (piece.brief as any)?.titleEdited === true,
    };
  }

  /**
   * Ответы на открытые вопросы заготовки: суть переписывается, вопросы тают.
   *
   * `content-factory-next-m2eg`, живой прогон 07.09.2026. Заготовка уже
   * существует — её записал вход, до всяких вопросов, — поэтому здесь нет и не
   * может быть тупика: ответ либо переписывает суть, либо ничего не меняет, но
   * заготовка остаётся на месте, и `piece` приходит всегда.
   *
   * Три правила, каждое куплено разом на прогоне:
   *
   *  - **ответ дословен**. Он ложится в бриф как слово человека (`person`) и
   *    едет в промпт сути парой «вопрос → ответ». Опечатка — это материал;
   *  - **об отвеченном не спрашивают**. Ни на этом круге, ни на следующем: и
   *    ответ, и «Реши сама» одинаково закрывают поле навсегда. Для `facts`
   *    «Реши сама» значит «суть стоит на словах человека», а не «опоры нет»;
   *  - **кругов не больше двух**. Исчерпав их, дверь просто перестаёт
   *    возвращать вопросы. Отказа нет: ответ человека принимается и на третьем
   *    круге, если клиент его прислал, — отказаться записать то, что человек
   *    уже написал, хуже, чем принять лишнее.
   *
   * Цена: не больше одной генерации роли `draft` под операцией `intake`, и
   * только когда ответ действительно что-то изменил.
   */
  async *answer(
    organizationId: string,
    plan: PieceAnswerPlanV1,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    actorUserId?: string
  ): AsyncGenerator<PieceAnswerEventV3> {
    const language = plan.language;
    const before: PieceQuestionsV1 = plan.core.questions ?? {
      round: 0,
      items: [],
      answered: [],
    };
    const round = (before.round ?? 0) + 1;
    yield { name: 'answer-started', pieceId: plan.pieceId, round };

    const answeredAt = this.now().toISOString();
    const given = this.fieldAnswers(plan.request, before.items);
    // Ответы на вопросы о материале (`97dq.44`): поля брифа не закрывают и
    // едут в суть парой «вопрос → ответ».
    const told = this.materialAnswers(plan.request, before.items);
    const acceptedEvidence: AcceptedEvidence[] = [];
    if (this.intake) {
      const urls = [
        ...new Set(
          [...given, ...told].flatMap((answer) => linksOf(answer.text))
        ),
      ];
      for (const url of urls) {
        try {
          const accepted = await this.intake.readLink(organizationId, url);
          acceptedEvidence.push(accepted);
          yield {
            name: 'link',
            url: accepted.url,
            title: accepted.title,
            evidenceId: accepted.evidenceId,
          };
        } catch (error) {
          // The person's words remain usable even when the linked page cannot
          // be read; link intake on this door is intentionally best-effort.
          this.logger.warn(
            `The answer link could not be read: ${describeError(error)}`
          );
        }
      }
    }
    const decided = [...new Set([...(plan.request.decide || []), ...before.items.map((question) => question.field)])].filter(
      (field) =>
        field !== 'facts' &&
        !given.some((answer) => answer.field === field)
    );
    /*
      «Решите за меня» — решение, а не пустое место (`97dq.56`, решение
      владельца 23.09.2026, `cnt-32`). Поле брифа, у которого предложение
      модели уже есть, решено этим предложением. Поле без предложения и вопрос
      о материале решаются тем же вызовом, что пишет суть: модель возвращает
      решение рядом с сутью. Вопрос о материале — это то, что знает только
      автор, и решение по нему — рамка, а не выдуманный случай.
    */
    const briefValue = (field: BriefField): string | null =>
      textOrNull((plan.core.brief as any)?.[field]);
    const decidedEarlier = (field: BriefField) =>
      before.answered.some((answer) => !answer.key && answer.field === field);
    const delegated: CoreDelegatedV1[] = [
      ...decided
        .filter(
          (field) =>
            DECIDABLE_BRIEF_FIELDS.has(field) &&
            !decidedEarlier(field) &&
            !briefValue(field)
        )
        .map((field) => ({
          key: field,
          question:
            before.items.find((question) => !question.key && question.field === field)
              ?.question || DECIDABLE_FIELD_QUESTION[language][field] || field,
          authorMaterial: false,
        })),
      ...before.items.flatMap((question) =>
        question.key && !told.some((answer) => answer.key === question.key)
          ? [{ key: question.key, question: question.question, authorMaterial: true }]
          : []
      ),
    ];

    const answeredBrief = given.length || acceptedEvidence.length
      ? this.briefWithAnswers(plan.core.brief, given, acceptedEvidence)
      : plan.core.brief;

    /*
      После уточнений пишем первую суть. Для уже написанной сути делегирование
      снимает вопрос без повторного платного вызова, если решать нечего: поле
      уже несёт предложение модели. Отданный вопрос без решения — это материал
      для сути, и он едет тем же одним вызовом.
    */
    let rewritten: ZagotovkaCoreV1 | null = null;
    let decisions: CoreDecisionV1[] = [];
    if ((given.length || told.length || delegated.length || !plan.core.text.trim()) && this.aiUsage) {
      const said = [
        ...this.promptAnswers(given, answeredAt),
        ...told.map((answer) => ({
          key: answer.key,
          text: answer.text,
          question: answer.question,
          origin: 'person' as const,
          step: 'core' as const,
          answeredAt,
        })),
      ];
      const written = await writeCoreWithDecisions(
        {
          organizationId,
          language,
          delegatedPolicy: await this.coreDelegatedPolicy(organizationId),
          brief: selectedFactsBrief(answeredBrief),
          answers: [...plan.core.answers, ...said],
          questionTextByKey: Object.fromEntries(
            said.map((answer) => [
              answer.key,
              answer.question || before.items.find((question) => !question.key && question.field === CORE_QUESTION_FIELDS[answer.key])?.question || coreQuestionText(answer.key, language),
            ])
          ),
          // Слова человека, с которых началась заготовка. Чужой текст
          // (`sourceText`) сюда не идёт ни одним полем: суть пишется по
          // пересказанным блокам разбора, и антикопия держится на этом.
          personText: plan.core.personText ?? '',
          instruction: instructionOf(plan.core),
          // A hand-edited core is built on, not replaced (`97dq.75` review P2-3).
          ...(plan.core.editedBy === 'person' && plan.core.text.trim()
            ? { existingCore: plan.core.text }
            : {}),
          borrowed: plan.borrowed ?? null,
          foreignShingles: plan.foreignShingles,
          ...(delegated.length ? { delegated } : {}),
        },
        {
          aiUsage: this.aiUsage,
          slopCheck: this.slopCheck,
          warn: (message) => this.logger.warn(message),
        }
      );
      rewritten = written.core;
      decisions = written.decisions;
    }
    const decisionOf = new Map(decisions.map((decision) => [decision.key, decision.text]));

    // Решённое поле брифа ложится в бриф с происхождением «модель».
    const brief: BriefFilledV1 = decisions.some((decision) =>
      DECIDABLE_BRIEF_FIELDS.has(decision.key as BriefField)
    )
      ? { ...answeredBrief, origins: { ...answeredBrief.origins } }
      : answeredBrief;
    for (const decision of decisions) {
      const field = decision.key as BriefField;
      if (!DECIDABLE_BRIEF_FIELDS.has(field)) continue;
      (brief as any)[field] = decision.text;
      (brief.origins as any)[field] = 'model';
    }

    const fresh: PieceFieldAnswerV1[] = [
      ...given.map((answer) => ({ ...answer, origin: 'person' as const, answeredAt })),
      ...decided.map((field) => ({
        field,
        text: decisionOf.get(field) ?? briefValue(field) ?? '',
        origin: 'model' as const,
        answeredAt,
      })),
      // Вопрос о материале без ответа отдан модели: так и записано, с её
      // решением-рамкой, если она его дала.
      ...before.items.flatMap((question) =>
        question.key
          ? [
              {
                field: question.field,
                key: question.key,
                question: question.question,
                text:
                  told.find((answer) => answer.key === question.key)?.text ??
                  decisionOf.get(question.key) ??
                  '',
                origin: told.some((answer) => answer.key === question.key)
                  ? ('person' as const)
                  : ('model' as const),
                answeredAt,
              },
            ]
          : []
      ),
    ];

    const answered = [...before.answered, ...fresh];
    const items: PieceOpenQuestionV1[] = [];
    const questions: PieceQuestionsV1 = { round, items, answered };

    // Решения по вопросам о материале едут со сутью: следующая перепись
    // (ресерч, дополнение) видит их своим блоком, а не теряет.
    const decisionAnswers: PieceAnswerV1[] = before.items.flatMap((question) =>
      question.key && decisionOf.has(question.key)
        ? [
            {
              key: question.key,
              question: question.question,
              text: decisionOf.get(question.key) as string,
              origin: 'model' as const,
              step: 'core' as const,
              answeredAt,
            },
          ]
        : []
    );

    let core: ZagotovkaCoreV1 = { ...plan.core, brief, questions };
    if (rewritten) {
      core = { ...rewritten, answers: [...rewritten.answers, ...decisionAnswers], brief, questions, ...(plan.borrowed ? { borrowed: plan.borrowed } : {}), personText: plan.core.personText ?? '', ...(plan.core.sourceText ? { sourceText: plan.core.sourceText } : {}), ...keptInstruction(plan.core), ...keptInput(plan.core), ...keptAuthor(plan.core) };
    }

    if (!core.text.trim()) {
      yield { name: 'error', error: true, code: 'PIECE_NOT_SAVED', message: PIECE_ERROR_MESSAGES.PIECE_NOT_SAVED[language] };
      return;
    }

    try {
      if (!this.briefs) {
        throw new Error('The piece service was built without its repository');
      }
      const title = !plan.titleEdited && (!plan.core.text || !textOrNull(plan.title) || plan.title === briefTitle(briefForGate(plan.core.brief), language) || ['Материал без названия', 'Untitled piece'].includes(plan.title)) ? { title: briefTitle({ thesis: textOrNull(brief.thesis) || core.text }, language) } : {};
      /*
        The model call takes seconds, and meanwhile the author may answer the
        link question, add material or edit the core (`97dq.75` review P1-2).
        The row is read again right before the write, the author's fields are
        taken from it, and the write only lands on that row; if it moved
        again, it is read and merged once more.
      */
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        const fresh = await this.pieces.getPiece(organizationId, plan.pieceId);
        const freshCore = fresh ? this.coreOf(fresh) : null;
        const merged = this.withAuthorFields(core, plan.core, freshCore, Boolean(rewritten));
        try {
          await this.briefs.updateCore(organizationId, plan.pieceId, {
            body: merged.text,
            ...title,
            brief: {
              ...this.storedCore(merged),
              ...(plan.titleEdited ? { titleEdited: true } : {}),
              ...(plan.foreignShingles.length
                ? { foreignShingles: plan.foreignShingles }
                : {}),
            },
            ...(fresh ? { expected: { body: fresh.body, brief: fresh.brief } } : {}),
          });
          core = merged;
          saved = true;
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
    } catch (error) {
      this.logger.error(
        `The answered core could not be saved: ${describeError(error)}`
      );
      yield {
        name: 'error',
        error: true,
        code: 'PIECE_NOT_SAVED',
        message: PIECE_ERROR_MESSAGES.PIECE_NOT_SAVED[language],
      };
      return;
    }

    /*
      Страница перечитывается целиком, а не собирается здесь второй раз: код
      заготовки — это её место в списке области, и считать его тут значило бы
      завести второе такое место.
    */
    const fresher = await this.detail(organizationId, plan.pieceId, language);
    yield {
      name: 'piece',
      pieceId: plan.pieceId,
      code: fresher.piece.code,
      core: fresher.core ?? core,
      previousBody: plan.core.text,
    };
    if (items.length) yield { name: 'questions', questions: items, round };
    yield { name: 'done', pieceId: plan.pieceId };
  }

  /**
   * Ответы на вопросы о материале (`content-factory-next-97dq.44`): только на
   * заданные в этом круге, дословно, пустые — не ответы. Текст вопроса берётся
   * из заданного, а не из запроса: клиент у двери может быть не только свой.
   */
  private materialAnswers(
    request: PieceAnswerRequestV1,
    asked: readonly PieceOpenQuestionV1[] = []
  ): Array<{ key: InterviewAskKeyV1; question: string; text: string }> {
    const byKey = new Map<string, { key: InterviewAskKeyV1; question: string; text: string }>();
    for (const answer of request.answers || []) {
      const key = answer?.key;
      if (!key || !trimmed(answer?.text)) continue;
      const question = asked.find((one) => one.key === key);
      if (!question?.key) continue;
      const text = answer.text.trim();
      if (question.ownOption && question.ownOption.toLowerCase() === text.toLowerCase()) continue;
      byKey.set(key, { key: question.key, question: question.question, text });
    }
    return [...byKey.values()];
  }

  /**
   * Ответы запроса: дословно, по одному на поле, пустые — не ответы.
   *
   * Подпись варианта, который просил слова человека (`ownOption`), ответом не
   * считается и здесь: `content-factory-next-97dq.23` — на бою «Я согласен
   * частично и хочу уточнить свою позицию» легло в бриф позицией человека, и
   * суть написалась с фразы кнопки. Экран этого больше не присылает, а дверь
   * не принимает — два замка на одну дверь, потому что клиент у двери может
   * быть не только свой.
   */
  private fieldAnswers(
    request: PieceAnswerRequestV1,
    asked: readonly PieceOpenQuestionV1[] = []
  ): Array<{ field: BriefField; text: string }> {
    const ownOptionOf = new Map<BriefField, string>();
    for (const question of asked) {
      const marker = trimmed(question?.ownOption);
      if (marker) ownOptionOf.set(question.field, marker.toLowerCase());
    }
    const byField = new Map<BriefField, string>();
    for (const answer of request.answers || []) {
      // Дословно: ни заглавной буквы, ни правки опечатки. Обрезаются только
      // пробелы по краям, потому что пустая строка — это не ответ.
      if (
        answer?.field &&
        !answer.key &&
        answer.field !== 'facts' &&
        trimmed(answer.text)
      ) {
        const text = answer.text.trim();
        if (ownOptionOf.get(answer.field) === text.toLowerCase()) continue;
        byField.set(answer.field, text);
      }
    }
    return [...byField].map(([field, text]) => ({ field, text }));
  }

  /**
   * Бриф с ответами человека, где слово человека сильнее ответа модели.
   *
   * A successfully read URL is stored separately as borrowed evidence. The
   * answer itself remains the person's wording and never becomes verified just
   * because it contained an address.
   */
  private briefWithAnswers(
    brief: BriefFilledV1,
    given: ReadonlyArray<{ field: BriefField; text: string }>,
    evidence: readonly AcceptedEvidence[] = []
  ): BriefFilledV1 {
    const next: BriefFilledV1 = {
      ...brief,
      origins: { ...brief.origins },
      facts: [...brief.facts],
    };
    for (const answer of given) {
      if (answer.field === 'facts') continue;
      next[answer.field] = answer.text;
      next.origins[answer.field] = 'person';
    }
    const knownEvidence = new Set(
      next.facts.map((fact) => fact.evidenceId).filter(Boolean)
    );
    for (const accepted of evidence) {
      if (knownEvidence.has(accepted.evidenceId)) continue;
      const fact: BriefFilledFactV1 = {
        statement: oneLine(accepted.excerpt).slice(0, 400),
        sourceUrl: accepted.url,
        factId: null,
        evidenceId: accepted.evidenceId,
        origin: 'input',
        verified: false,
        kind: 'external',
        status: 'unverified',
        selected: true,
      };
      next.facts.push(fact);
      knownEvidence.add(accepted.evidenceId);
    }
    const withSources = next as BriefFilledV2;
    const inputSources = [...(withSources.inputSources ?? [])];
    for (const accepted of evidence) {
      if (
        inputSources.some(
          (source) =>
            source.kind === 'link' &&
            (source.evidenceId === accepted.evidenceId || source.url === accepted.url)
        )
      ) {
        continue;
      }
      inputSources.push({
        kind: 'link',
        url: accepted.url,
        evidenceId: accepted.evidenceId,
      });
    }
    if (inputSources.length) withSources.inputSources = inputSources;
    // Одно правило квитанции на все дороги (`97dq.32`, `ungroundedStatements`).
    next.ungrounded = ungroundedStatements(next);
    return next;
  }

  /** Те же ответы для промпта сути: по ключу вопроса, дословно. */
  private promptAnswers(
    given: ReadonlyArray<{ field: BriefField; text: string }>,
    answeredAt: string
  ): PieceAnswerV1[] {
    const keyOf = new Map<BriefField, PieceQuestionKeyV1>(
      Object.entries(CORE_QUESTION_FIELDS).map(([key, field]) => [
        field as BriefField,
        key as PieceQuestionKeyV1,
      ])
    );
    return given.flatMap((answer) => {
      const key = keyOf.get(answer.field);
      return key
        ? [
            {
              key,
              text: answer.text,
              origin: 'person' as const,
              step: 'core' as const,
              answeredAt,
            },
          ]
        : [];
    });
  }

  /**
   * The answered core with what the author did while the model was writing
   * (`97dq.75` review P1-2, P2-3): the link and the added material from the
   * row as it is now; a hand edit made meanwhile is kept when nothing was
   * rewritten and recorded as a revision when it is replaced; a hand-edited
   * core the rewrite started from is recorded too.
   */
  private withAuthorFields(
    core: ZagotovkaCoreV1,
    before: ZagotovkaCoreV1,
    fresh: ZagotovkaCoreV1 | null,
    rewritten: boolean
  ): ZagotovkaCoreV1 {
    const now = this.now().toISOString();
    const current = fresh ?? before;
    const editedMeanwhile = editedCoreText(current.text) !== editedCoreText(before.text);
    const materialMeanwhile = (current.personText ?? '') !== (before.personText ?? '');
    let revisions = current.revisions;
    if (rewritten && before.editedBy === 'person')
      revisions = withRevision(revisions, { text: before.text, writtenBy: 'person', materialPending: before.materialPending === true }, now);
    if (rewritten && editedMeanwhile)
      revisions = withRevision(revisions, { text: current.text, writtenBy: coreAuthorOf(current), materialPending: current.materialPending === true }, now);
    const merged: ZagotovkaCoreV1 = {
      ...core,
      ...(rewritten
        ? {}
        : {
            text: current.text,
            slop: current.slop,
            writtenBy: current.writtenBy,
            ...(current.editedBy ? { editedBy: current.editedBy } : {}),
            ...(current.editedAt ? { editedAt: current.editedAt } : {}),
          }),
      ...(current.personText !== undefined ? { personText: current.personText } : {}),
    };
    delete merged.postLink;
    delete merged.addedMaterial;
    delete merged.revisions;
    delete merged.materialPending;
    if (rewritten) {
      delete merged.editedBy;
      delete merged.editedAt;
    }
    return {
      ...merged,
      ...(current.postLink ? { postLink: current.postLink } : {}),
      ...(current.addedMaterial?.length ? { addedMaterial: current.addedMaterial } : {}),
      ...(revisions?.length ? { revisions } : {}),
      // The rewrite read the material it had; words added since still wait.
      ...((rewritten ? materialMeanwhile : current.materialPending)
        ? { materialPending: true as const }
        : {}),
    };
  }

  /** `ZagotovkaCoreV1` без `text`: текст живёт в колонке `body`. */
  /**
   * The emoji ceiling a channel's post is written to (`97dq.83`): the post's
   * own «Эмодзи» from the piece's settings, else the channel card. The text
   * checks honour it, so «до 3» with three kinds is not «decoration».
   */
  private emojiCeilingFor(
    tags: unknown,
    integration: PieceIntegrationRow | undefined
  ): EmojiCeiling | null | undefined {
    if (!integration) return undefined;
    return emojiCeilingOf(
      effectiveEmojiLevel(
        undefined,
        tags,
        integration.id,
        parseWritingProfile(
          integration.writingProfile,
          integration.providerIdentifier,
          integration.contentLanguage
        ).emojiLevel
      )
    );
  }

  /** The same ceiling for a row whose channel is known only by its id. */
  private async emojiCeilingById(
    organizationId: string,
    tags: unknown,
    integrationId: string | null | undefined
  ): Promise<EmojiCeiling | null | undefined> {
    if (!integrationId) return undefined;
    try {
      const integrations = await this.pieces.listIntegrations(organizationId);
      return this.emojiCeilingFor(
        tags,
        integrations.find((integration) => integration.id === integrationId)
      );
    } catch {
      // The ceiling only widens a warning; without it the platform's stands.
      return undefined;
    }
  }

  private storedCore(core: ZagotovkaCoreV1): Record<string, unknown> {
    const { text, ...stored } = core;
    void text;
    return stored;
  }

  /* -----------------------------------------------------------------------
   * Правки
   * -------------------------------------------------------------------- */

  /**
   * Снятие адаптации. Опубликованный пост не отдаёт своего происхождения.
   *
   * Удалённый пост это не отменяет: от него не осталось ничего, что человек
   * мог бы открыть, и держать ради него строку было бы бухгалтерией о
   * несуществующем.
   *
   * Язык отказа — русский, и это не забытый параметр: подпись метода
   * согласована с Z3 и языка не несёт, а раздел говорит по-русски, пока
   * человек не попросил иначе (`AGENTS.md`). Когда двери начнут передавать
   * язык, он придёт сюда так же, как в `detail`.
   */
  async deleteAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string
  ): Promise<void> {
    const found = await this.pieces.findAdaptation(
      organizationId,
      pieceId,
      adaptationId
    );
    if (!found) {
      throw pieceError('ADAPTATION_NOT_FOUND', 'ru', adaptationId);
    }
    if (
      found.post &&
      !found.post.deletedAt &&
      String(found.post.state || '').toUpperCase() === 'PUBLISHED'
    ) {
      throw pieceError('ADAPTATION_PUBLISHED', 'ru', adaptationId);
    }
    await this.pieces.deleteAdaptation(organizationId, pieceId, adaptationId);
  }

  /* -----------------------------------------------------------------------
   * Экран адаптации (`content-factory-next-97dq.37`)
   * -------------------------------------------------------------------- */

  /**
   * Every read of a variant's post that an action on it starts from
   * (`2q28.39`): autosave, «Поставить на …», «Убрать следы», «Проверить
   * факты», «Переписать» and their «Принять». If the confirm-time cleanup
   * removed this variant's draft, the post comes back as the same `DRAFT`
   * first — under the channel lock, only the rows that cleanup removed
   * (`droppedByConfirm`, `restoreDraftPost`) — and the row is read again.
   * Anything else reads exactly as it did. «Запланировать» restores inside
   * its own queue transaction instead, so a refusal brings nothing back.
   */
  private async liveVariantRead<
    T extends {
      post: {
        id: string;
        state: string;
        deletedAt: Date | null;
        integration: { id?: string };
      } | null;
    }
  >(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    read: () => Promise<T | null>
  ): Promise<T | null> {
    const row = await read();
    const post = row?.post;
    const integrationId = post?.integration?.id;
    if (
      !post ||
      !post.deletedAt ||
      upperState(post.state) !== 'DRAFT' ||
      !integrationId ||
      !this.planStore()
    )
      return row;
    let revived = false;
    try {
      revived = await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        if (!db.restoreDraftPost) return false;
        const variants = await db.channelVariants(organizationId, pieceId, integrationId);
        if (!droppedByConfirm(variants, adaptationId)) return false;
        return db.restoreDraftPost(organizationId, post.id);
      });
    } catch (error) {
      this.logger.warn(
        `Adaptation ${adaptationId}: removed draft was not brought back: ${describeError(error)}`
      );
    }
    return revived ? read() : row;
  }

  /**
   * Черновик, который экран адаптации вправе менять: свой, живой и `DRAFT`.
   * Возвращает строку вместе с постом, чтобы звавшему не читать её второй раз.
   */
  private async draftForWorkspace(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    language: 'ru' | 'en',
    /**
     * «Запланировать» / «Подтвердить» may bring back a variant whose draft
     * left the calendar when another variant was confirmed (`2q28.39`).
     */
    revivable = false
  ) {
    const draft = await this.pieces.workspaceDraft(
      organizationId,
      pieceId,
      adaptationId
    );
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    const post = draft.post;
    if (
      !post ||
      (post.deletedAt && !revivable) ||
      String(post.state || '').toUpperCase() !== 'DRAFT'
    ) {
      throw workspaceError('ADAPTATION_NOT_DRAFT', language);
    }
    return { draft, post };
  }

  /**
   * Версия, которую можно править руками (`97dq.80`): черновик — как
   * раньше, и пост в очереди, пока до его слота больше
   * `QUEUED_EDIT_MARGIN_MS`. Публикация читает текст поста из базы в момент
   * выхода, поэтому правка меняет только текст и картинку: дата, состояние
   * и начатая публикация остаются как были — ни перезапуска, ни второй
   * очереди. Пост, который уже уходит или вышел, — отказ
   * `ADAPTATION_EDIT_CLOSED` простыми словами. Удалённый или заменённый
   * пост — `ADAPTATION_POST_GONE`, ошибка публикации — `ADAPTATION_POST_FAILED`
   * (ревью P3-3: не «снимите с расписания» там, где снимать нечего).
   */
  private async editableForWorkspace(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    language: 'ru' | 'en'
  ) {
    const draft = await this.liveVariantRead(organizationId, pieceId, adaptationId, () =>
      this.pieces.workspaceDraft(organizationId, pieceId, adaptationId)
    );
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    const post = draft.post;
    const state = String(post?.state || '').toUpperCase();
    if (!post || post.deletedAt) throw workspaceError('ADAPTATION_POST_GONE', language);
    if (state === 'DRAFT') return { draft, post };
    if (state === 'ERROR') throw workspaceError('ADAPTATION_POST_FAILED', language);
    if (state === 'QUEUE') {
      const at = post.publishDate ? new Date(post.publishDate as any) : null;
      if (
        at &&
        !Number.isNaN(at.getTime()) &&
        at.getTime() > this.now().getTime() + QUEUED_EDIT_MARGIN_MS
      )
        return { draft, post };
      throw workspaceError('ADAPTATION_EDIT_CLOSED', language);
    }
    if (state === 'PUBLISHED') throw workspaceError('ADAPTATION_EDIT_CLOSED', language);
    throw workspaceError('ADAPTATION_NOT_DRAFT', language);
  }

  /** Одна адаптация, как её показывает страница, — после записи. */
  private async adaptationAfterWrite(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    language: 'ru' | 'en',
    checks?: AdaptationChecksV1
  ): Promise<AdaptationV1> {
    const [integrations, rows, piece] = await Promise.all([
      this.pieces.listIntegrations(organizationId),
      this.pieces.adaptationsByPiece(organizationId, [pieceId]),
      // The post's own plan mode lives in the piece's tags (F6).
      Promise.resolve()
        .then(() => this.pieces.getPiece(organizationId, pieceId))
        .catch(() => null),
    ]);
    const row = rows.find((one) => one.id === adaptationId);
    if (!row) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    return this.adaptationOf(
      row,
      pieceId,
      integrations,
      checks,
      holdersOfRows(rows, piece?.tags, integrations)
    );
  }

  /**
   * Ручная правка адаптации: тело и/или картинка (спецификация §3.5).
   * Черновик и, с `97dq.80`, пост в очереди до слота (`editableForWorkspace`).
   *
   * «Ручное редактирование поста — классная штука, оно точно должно быть»
   * (владелец, 22.09.2026). Тело адаптации и HTML её черновика пишутся одной
   * транзакцией тем же `editorHtml`, что и приёмка правок, — иначе страница и
   * календарь показали бы два разных текста. Метки цитат снимаются тем же
   * `stripCitationLabels`, что при генерации (`97dq.40`): человек мог вставить
   * их обратно из старой копии. Квитанция проверок считается заново по
   * новому телу и приходит в ответе.
   *
   * Картинка — одна, из медиатеки области, и путь к ней сервер берёт сам:
   * принять путь из тела значило бы позволить приложить к посту что угодно.
   */
  async editAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    input: PieceAdaptationEditRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PieceAdaptationEditResponseV1> {
    if (input?.body === undefined && input?.image === undefined) {
      throw workspaceError('ADAPTATION_EDIT_EMPTY', language);
    }
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const { draft, post } = await this.editableForWorkspace(
      organizationId,
      pieceId,
      adaptationId,
      language
    );

    const change: Parameters<PieceRepository['editAdaptation']>[4] = {};
    let text = draft.body ?? '';
    if (input.body !== undefined) {
      text = stripCitationLabels(String(input.body ?? '')).trim();
      if (!text) throw workspaceError('ADAPTATION_EDIT_EMPTY', language);
      const provider = this.integrationManager.getSocialIntegration(
        post.integration.providerIdentifier
      );
      change.body = text;
      change.content = renderedPost(text, provider?.editor ?? 'normal');
    }
    if (input.image !== undefined) {
      if (input.image === null) {
        change.image = '[]';
        change.mediaId = null;
      } else {
        const media = await this.pieces.findMedia(
          organizationId,
          trimmed(input.image?.id)
        );
        if (!media) throw workspaceError('ADAPTATION_MEDIA_UNKNOWN', language);
        change.image = JSON.stringify([
          {
            id: media.id,
            path: media.path,
            ...(media.alt ? { alt: media.alt } : {}),
            ...(media.thumbnail ? { thumbnail: media.thumbnail } : {}),
          },
        ]);
        change.mediaId = media.id;
      }
    }

    // Пост в очереди уйдёт в канал как есть, поэтому правка проходит ту же
    // проверку площадки, что и «Запланировать» (ревью P2-1): длина, вложение,
    // настройки. Отказ — словами площадки, запись не делается.
    if (String(post.state || '').toUpperCase() === 'QUEUE') {
      const refusal = await this.queueRefusal(
        organizationId,
        {
          ...post,
          content: change.content ?? post.content,
          image: change.image ?? post.image,
        },
        language
      );
      if (refusal) {
        throw Object.assign(
          new AdaptationReviewError(
            'ADAPTATION_SCHEDULE_INVALID',
            ADAPTATION_WORKSPACE_ERROR_CODES.ADAPTATION_SCHEDULE_INVALID.status,
            `${refusal.text} ${QUEUED_EDIT_REFUSAL_TAIL[language]}`
          ),
          { subject: post.integration.providerIdentifier }
        );
      }
    }

    try {
      await this.pieces.editAdaptation(
        organizationId,
        pieceId,
        adaptationId,
        post.id,
        change,
        // Пост в очереди — только пока до слота больше минуты (`97dq.80`):
        // то же условие ещё раз в самой записи, против гонки с отправкой.
        new Date(this.now().getTime() + QUEUED_EDIT_MARGIN_MS)
      );
    } catch (error) {
      const reason = (error as any)?.reason;
      if (reason === 'ADAPTATION_NOT_DRAFT')
        throw workspaceError('ADAPTATION_NOT_DRAFT', language);
      if (reason === 'ADAPTATION_EDIT_CLOSED')
        throw workspaceError('ADAPTATION_EDIT_CLOSED', language);
      if (reason === 'ADAPTATION_POST_GONE')
        throw workspaceError('ADAPTATION_POST_GONE', language);
      if (reason === 'ADAPTATION_POST_FAILED')
        throw workspaceError('ADAPTATION_POST_FAILED', language);
      if (reason === 'ADAPTATION_NOT_FOUND')
        throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
      throw error;
    }
    // Правленый текст ищется сразу, как и свежая адаптация (`m2eg.19`).
    this.search?.invalidate(organizationId);

    const core = this.coreOf(piece);
    const checks = trimmed(text)
      ? await adaptationChecksOf(
          {
            organizationId,
            text,
            platform: providerOfPlatform(draft.platform),
            language,
            foreignShingles: this.foreignShinglesOf(piece),
            grounded: this.groundedOf(core),
            supported: this.supportedOf(core),
            emojiCeiling: await this.emojiCeilingById(
              organizationId,
              piece.tags,
              post.integration?.id
            ),
          },
          { slopCheck: this.slopCheck, voiceCheck: this.voiceCheck }
        )
      : undefined;
    return {
      adaptation: await this.adaptationAfterWrite(
        organizationId,
        pieceId,
        adaptationId,
        language,
        checks
      ),
    };
  }

  /**
   * Почему площадка не примет пост в очередь — или `null`. Одна проверка
   * для «Запланировать», «Поставить на …» и автопилота (`97dq.57`, I3): те же
   * четыре ответа `validatePosts`, что проверяло окно «Создать пост».
   */
  private async queueRefusal(
    organizationId: string,
    post: QueuePostLike,
    language: 'ru' | 'en'
  ): Promise<{ text: string } | null> {
    if (!this.posts) return null;
    const settings = jsonOf<Record<string, unknown>>(post.settings, {});
    const image = jsonOf<unknown>(post.image, []);
    const [verdict] = await this.posts.validatePosts(organizationId, [
      {
        integration: { id: post.integration.id },
        value: [
          {
            content: post.content,
            image: Array.isArray(image) ? (image as any[]) : [],
          },
        ],
        settings: {
          ...settings,
          __type: settings.__type ?? post.integration.providerIdentifier,
        },
      },
    ]);
    if (!verdict) return null;
    const channel = post.integration.name || post.integration.providerIdentifier;
    const text = (reason: Parameters<typeof scheduleRefusalText>[2]) => ({
      text: scheduleRefusalText(language, channel, reason),
    });
    if (verdict.emptyContent) return text({ kind: 'empty' });
    if (!verdict.valid)
      return text({ kind: 'settings', detail: trimmed(verdict.settingsError) });
    if (verdict.errors !== true)
      return text({ kind: 'media', detail: trimmed(verdict.errors) });
    if (verdict.tooLong)
      return text({ kind: 'too_long', max: Number(verdict.maximumCharacters) || 0 });
    return null;
  }

  /**
   * «Запланировать» и «Опубликовать сейчас» с экрана адаптации (§3.5).
   *
   * Три шага, и все три — те же, что делало окно «Создать пост», а не их
   * копия: проверка площадки (`validatePosts`, то есть `POST /posts/valid`),
   * дата (`changeDate`, `update` — дата без смены состояния) и перевод
   * черновика в очередь с запуском публикации (`changePostStatus`). `changeDate`
   * с `schedule` здесь не подходит: у черновика он оставляет `DRAFT`. «Сейчас» —
   * это очередь с текущим временем, ровно как `type: 'now'` у окна.
   *
   * Отказ площадки говорится словами на языке экрана, с именем канала; её
   * собственное сообщение (по-английски) идёт хвостом как есть.
   */
  async scheduleAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    input: PieceAdaptationScheduleRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PieceAdaptationScheduleResponseV1> {
    const now = input?.now === true;
    const wanted = trimmed(input?.date);
    if (now === Boolean(wanted))
      throw workspaceError('ADAPTATION_SCHEDULE_DATE_REQUIRED', language);
    let when = this.now();
    if (!now) {
      when = new Date(wanted);
      if (!Number.isFinite(when.getTime()))
        throw workspaceError('ADAPTATION_SCHEDULE_DATE_INVALID', language);
      // Минута запаса: время, выбранное в календаре, успевает «пройти», пока
      // человек дочитывает строку.
      if (when.getTime() < this.now().getTime() - 60_000)
        throw workspaceError('ADAPTATION_SCHEDULE_DATE_PAST', language);
    }
    if (!this.posts)
      throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);

    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const { post } = await this.draftForWorkspace(
      organizationId,
      pieceId,
      adaptationId,
      language,
      Boolean(this.planStore())
    );

    // Площадка проверяет пост до замка (I3): замок не ждёт её.
    const refusal = await this.queueRefusal(organizationId, post, language);
    if (refusal) {
      throw Object.assign(
        new AdaptationReviewError(
          'ADAPTATION_SCHEDULE_INVALID',
          ADAPTATION_WORKSPACE_ERROR_CODES.ADAPTATION_SCHEDULE_INVALID.status,
          refusal.text
        ),
        { subject: post.integration.providerIdentifier }
      );
    }

    if (!this.planStore()) {
      // Наборы без плана канала: как до волны.
      try {
        await this.queuePost(organizationId, post.id, when.toISOString());
      } catch (error) {
        if (error instanceof QueueStartFailed)
          throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);
        // `changePostStatus` goes through the Postiz-side queue gate
        // (`97dq.67`); its refusal speaks this workspace's language here.
        if ((error as { code?: string })?.code === 'CF_QUEUE_BUSY')
          throw workspaceError('ADAPTATION_QUEUE_BUSY', language);
        throw error;
      }
    } else {
      // Одна очередь на заготовку в канале (`97dq.57`, I1, review F5): выбор
      // человека снимает другие версии с очереди, пока это безопасно, а
      // версию, которая выходит через две минуты или раньше, не трогает — и
      // тогда эта в очередь не встаёт. Под замком — только база (F4, N2).
      const integrationId = post.integration.id;
      const effects = await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        const variants = await db.channelVariants(organizationId, pieceId, integrationId);
        const mine = variants.find((one) => one.id === adaptationId);
        if (!mine?.post || upperState(mine.post.state) !== 'DRAFT')
          throw workspaceError('ADAPTATION_NOT_DRAFT', language);
        // «Вариант 1» после подтверждения второго (`2q28.39`): его черновик
        // ушёл из календаря, и выбор человека возвращает тот же пост — в той
        // же транзакции, что и очередь, так что отказ ничего не оживляет.
        if (
          mine.post.deletedAt &&
          !(
            droppedByConfirm(variants, adaptationId) &&
            db.restoreDraftPost &&
            (await db.restoreDraftPost(organizationId, mine.post.id))
          )
        )
          throw workspaceError('ADAPTATION_NOT_DRAFT', language);
        const gate = queueGate(variants, adaptationId, this.now(), {
          releaseHuman: true,
          blockPublished: false,
        });
        if (gate.block) throw workspaceError('ADAPTATION_QUEUE_BUSY', language);
        const released = await this.releaseInDb(
          db,
          organizationId,
          variants.filter((one) => gate.release.includes(one.id))
        );
        await db.setPostState(organizationId, post.id, { state: 'QUEUE', publishDate: when });
        await db.setPlan(organizationId, adaptationId, { plannedAt: this.now() });
        return {
          stop: released.map((one) => one.postId),
          start: { adaptationId, postId: post.id },
          released,
        } as QueueEffects;
      });
      if (!(await this.applyQueueEffects(organizationId, pieceId, integrationId, effects, language)))
        throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);
      await this.dropOtherDrafts(organizationId, pieceId, integrationId, adaptationId);
    }

    return {
      adaptation: await this.adaptationAfterWrite(
        organizationId,
        pieceId,
        adaptationId,
        language
      ),
    };
  }

  /**
   * «Снять с расписания» — пост из очереди обратно в черновик
   * (`content-factory-next-97dq.37`, спецификация десятого захода §3.2).
   *
   * Правка текста разрешена только черновику, поэтому запланированный пост
   * возвращается в черновик явным действием, а не молча при первой правке.
   * Опубликованный пост назад не уходит: он уже в канале.
   */
  async unscheduleAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PieceAdaptationScheduleResponseV1> {
    if (!this.posts)
      throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const draft = await this.pieces.workspaceDraft(
      organizationId,
      pieceId,
      adaptationId
    );
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    const post = draft.post;
    const state = String(post?.state || '').toUpperCase();
    if (!post || post.deletedAt || state !== 'QUEUE')
      throw workspaceError('ADAPTATION_NOT_QUEUED', language);
    if (!this.planStore()) {
      await this.posts.changePostStatus(organizationId, post.id, 'draft');
    } else {
      // Под тем же замком канала, что постановка и возврат очереди (N1):
      // возврат не поставит обратно пост, который человек только что снял.
      const integrationId = post.integration.id;
      await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
        const variants = await db.channelVariants(organizationId, pieceId, integrationId);
        const mine = variants.find((one) => one.id === adaptationId);
        if (!mine?.post || mine.post.deletedAt || upperState(mine.post.state) !== 'QUEUE')
          throw workspaceError('ADAPTATION_NOT_QUEUED', language);
        await db.setPostState(organizationId, mine.post.id, { state: 'DRAFT' });
        // Review F10 (`97dq.64`): a queued variant that was not the slot
        // holder would turn into a superseded draft and vanish from the
        // calendar the moment the person unscheduled it, so it takes the
        // slot — but only from a holder that has no draft on the calendar
        // (review F6 of the fourteenth walk). A holder's live draft is the
        // version the person last chose or wrote; unscheduling another one
        // must not hide it. Then the unscheduled version goes back to the
        // drafts of the piece page, which is what «снять» asks for.
        const holder = this.holderOf(variants);
        const holderDraftShown =
          !!holder &&
          holder.id !== adaptationId &&
          !!holder.post &&
          !holder.post.deletedAt &&
          upperState(holder.post.state) === 'DRAFT';
        if (holder?.id !== adaptationId && !holderDraftShown)
          await db.setPlan(organizationId, adaptationId, { plannedAt: this.now() });
        // Снятый человеком пост — уже не очередь автопилота (метка I5 снята).
        await db.setPlan(organizationId, adaptationId, { plan: 'reserve' }, 'autopilot');
      });
      await this.syncWorkflow(organizationId, post.id);
    }
    return {
      adaptation: await this.adaptationAfterWrite(
        organizationId,
        pieceId,
        adaptationId,
        language
      ),
    };
  }

  /* -----------------------------------------------------------------------
   * Настройки поста (`content-factory-next-97dq.70`)
   *
   * Одна панель в двух местах: карточка канала и правая колонка вкладки
   * канала. Изменение поста сохраняется само как его переопределение
   * (`post-settings.ts`, `ContentPiece.tags.postSettings`). Режим плана
   * поста применяется к написанному посту сразу — тем же замком канала и тем
   * же правилом одной очереди (`queueGate`), что и остальные постановки.
   * -------------------------------------------------------------------- */

  /**
   * Сохранить настройки поста и, если прислан режим плана, применить его к
   * держателю слота заготовки в канале.
   *
   * Ревью `97dq.70` (P1): запись в `tags` и решение о посте — под одним
   * замком канала и в одной транзакции. Строка заготовки блокируется
   * (`lockPieceTags`), пишутся только присланные поля, и режим, по которому
   * решается судьба поста, перечитывается под замком из только что
   * записанного, а не берётся из запроса. Проверка площадки — до замка (I3);
   * решение — по состоянию, прочитанному под ним.
   */
  async savePostSettings(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    input: PiecePostSettingsRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PiecePostSettingsResponseV1> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', language, pieceId);
    const channel = (await this.pieces.listIntegrations(organizationId)).find(
      (one) => one.id === integrationId
    );
    if (!channel) throw pieceError('PIECE_CHANNEL_UNKNOWN', language, integrationId);
    const store = this.planStore();
    if (!store) throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);

    const patch: PostSettingsPatchV1 = {
      ...(input?.options ? { options: input.options } : {}),
      ...(input?.planMode !== undefined
        ? { planMode: isPlanMode(input.planMode) ? input.planMode : null }
        : {}),
    };
    // Аватар — только этой области, тем же чтением, что у адаптации.
    const chosen = trimmed(patch.options?.brandProfileId ?? undefined);
    if (chosen && !(await this.pieces.findAvatar(organizationId, chosen)))
      throw pieceError('PIECE_AVATAR_UNKNOWN', language, chosen);

    const decides = patch.planMode !== undefined;
    // «Как в канале» с режимом, который видел человек (`97dq.86`, F10):
    // решает замок, а не страница.
    const seen =
      patch.planMode === null && isPlanMode(input?.expectedChannelMode)
        ? input.expectedChannelMode
        : undefined;
    const channelNow = planModeOf(channel.planMode);
    const outcome = await this.planPostUnderLock(
      organizationId,
      pieceId,
      channel,
      {
        patch,
        decides,
        // Прогноз режима только для проверки площадки до замка; решает
        // режим, перечитанный под замком.
        predicted: decides
          ? patch.planMode ?? (seen && seen !== channelNow ? seen : channelNow)
          : null,
        ...(seen ? { followChannelAs: seen } : {}),
      },
      language
    );
    return { settings: outcome.settings, adaptation: outcome.adaptation };
  }

  /**
   * Одна постановка плана поста (`97dq.70`): до замка — проверка площадки,
   * если пост может встать в очередь; под замком — запись настроек (если
   * есть), перечитанный режим и решение; после — Temporal.
   *
   * `expectedChannelMode` — ход «Ко всем N»: пост со своим режимом или канал,
   * режим которого уже сменился, под замком пропускаются.
   */
  private async planPostUnderLock(
    organizationId: string,
    pieceId: string,
    channel: PieceIntegrationRow,
    work: {
      patch?: PostSettingsPatchV1;
      decides: boolean;
      predicted: PlanModeV1 | null;
      expectedChannelMode?: PlanModeV1;
      /**
       * «Как в канале», выбранное при этом режиме канала (`97dq.86`, F10).
       * Под замком: режим канала тот же — пост хранит `null`; другой — пост
       * хранит этот режим явно. Иначе другая вкладка, переключившая канал
       * между показом и сохранением, решила бы судьбу поста за человека.
       */
      followChannelAs?: PlanModeV1;
    },
    language: 'ru' | 'en'
  ): Promise<{
    settings: PiecePostSettingsV1 | null;
    adaptation: AdaptationV1 | null;
    applied: boolean;
  }> {
    const store = this.planStore()!;
    const integrationId = channel.id;

    // Площадка проверяет черновик до замка (I3), если его может поставить
    // автопилот. Проверка годится только для той версии, которую видели.
    let refusal: string | null = null;
    let validatedId: string | null = null;
    if (work.decides && work.predicted === 'autopilot' && this.posts) {
      const first = this.holderOf(
        await store.channelVariants(organizationId, pieceId, integrationId)
      );
      if (first?.post && !first.post.deletedAt && upperState(first.post.state) === 'DRAFT') {
        const draft = await this.pieces.workspaceDraft(organizationId, pieceId, first.id);
        if (draft?.post) {
          refusal = (await this.queueRefusal(organizationId, draft.post, language))?.text ?? null;
          validatedId = first.id;
        }
      }
    }

    const decided = await this.lockChannel(
      organizationId,
      pieceId,
      integrationId,
      async (
        db
      ): Promise<{
        settings: PiecePostSettingsV1 | null;
        id: string | null;
        effects: QueueEffects;
        applied: boolean;
      }> => {
        const locked = db.lockPieceTags
          ? await db.lockPieceTags(organizationId, pieceId)
          : { tags: db.pieceTags ? await db.pieceTags(organizationId, pieceId) : null };
        if (!locked) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
        let tags = locked.tags;
        let settings = postSettingsOf(tags, integrationId);
        let patch = work.patch;
        if (patch && patch.planMode === null && work.followChannelAs) {
          const channelNow = planModeOf(await db.channelPlanMode(organizationId, integrationId));
          if (channelNow !== work.followChannelAs)
            patch = { ...patch, planMode: work.followChannelAs };
        }
        if (patch) {
          settings = mergePostSettings(settings, patch, this.now().toISOString());
          tags = withPostSettings(tags, integrationId, settings);
          if (db.writePieceTags) await db.writePieceTags(organizationId, pieceId, tags);
        }
        const none = { settings, id: null as string | null, effects: NO_EFFECTS, applied: false };
        if (!work.decides) return none;

        const own = postPlanModeOf(tags, integrationId);
        const channelMode = planModeOf(await db.channelPlanMode(organizationId, integrationId));
        if (work.expectedChannelMode) {
          // «Ко всем N»: свой режим поста, поставленный между счётом и ходом,
          // и сменившийся режим канала — не трогаются.
          if (own || channelMode !== work.expectedChannelMode) return none;
        }
        const mode = own ?? channelMode;
        const variants = await db.channelVariants(organizationId, pieceId, integrationId);
        const holder = this.holderOf(variants);
        if (!holder?.post || holder.post.deletedAt) return none;
        if (
          work.expectedChannelMode &&
          (variants.some((one) => upperState(one.post?.state) === 'PUBLISHED') ||
            !planWouldChange(
              { plan: holder.plan, state: holder.post.state },
              mode
            ))
        )
          return none;
        const decision = await this.decideHolderPlan(
          db,
          organizationId,
          channel,
          variants,
          holder,
          mode,
          validatedId,
          refusal,
          language
        );
        return { settings, ...decision, applied: decision.id !== null };
      }
    );

    if (!decided.id) return { settings: decided.settings, adaptation: null, applied: false };
    await this.applyQueueEffects(
      organizationId,
      pieceId,
      integrationId,
      decided.effects,
      language
    );
    return {
      settings: decided.settings,
      adaptation: await this.adaptationAfterWrite(organizationId, pieceId, decided.id, language),
      applied: decided.applied,
    };
  }

  /**
   * Режим — к держателю слота, под замком (`97dq.70`): «Автопилот» ставит
   * его в очередь на его время, «Бронь» снимает очередь автопилота обратно
   * в бронь, «Без плана» снимает бронь и оставляет черновик.
   *
   * Очередь, которую подтвердил человек («Запланировать», «Подтвердить»), —
   * его решение, и режим её не трогает. Автопилот ставит в очередь только
   * после проверки площадки этой же версии (I3) и по правилу одной очереди
   * (`queueGate`, I1, I4); отказ оставляет бронь с причиной.
   */
  private async decideHolderPlan(
    db: PlanDb,
    organizationId: string,
    channel: PieceIntegrationRow,
    variants: PlanVariantRow[],
    holder: PlanVariantRow,
    mode: PlanModeV1,
    validatedId: string | null,
    refusal: string | null,
    language: 'ru' | 'en'
  ): Promise<{ id: string; effects: QueueEffects }> {
    const post = holder.post!;
    const state = upperState(post.state);
    const now = this.now();

    if (state === 'QUEUE') {
      if (mode === 'autopilot' || holder.plan !== 'autopilot' || !canReplaceQueued(post, now))
        return { id: holder.id, effects: NO_EFFECTS };
      await db.setPostState(organizationId, post.id, { state: 'DRAFT' });
      await db.setPlan(organizationId, holder.id, { plan: mode, planNote: null });
      return { id: holder.id, effects: { stop: [post.id], start: null, released: [] } };
    }
    if (state !== 'DRAFT') return { id: holder.id, effects: NO_EFFECTS };

    if (mode === 'draft') {
      await db.setPlan(organizationId, holder.id, { plan: 'draft', planNote: null });
      return { id: holder.id, effects: NO_EFFECTS };
    }

    // Время брони остаётся за постом, если оно ещё впереди; иначе —
    // ближайшее свободное время САМОГО канала.
    const at = new Date(post.publishDate).getTime();
    const own =
      (holder.plan === 'reserve' || holder.plan === 'autopilot') &&
      at > now.getTime() + QUEUE_REPLACE_MARGIN_MS
        ? new Date(at)
        : null;
    const date =
      own ??
      (await this.freeSlotIn(db, organizationId, channel.id, channel.postingTimes, [post.id]));

    if (mode === 'reserve') {
      if (date) await db.setPostState(organizationId, post.id, { publishDate: date });
      await db.setPlan(organizationId, holder.id, { plan: 'reserve', planNote: null });
      return { id: holder.id, effects: NO_EFFECTS };
    }

    let note: string | null = null;
    let effects = NO_EFFECTS;
    if (!this.posts)
      note = ADAPTATION_WORKSPACE_MESSAGES.ADAPTATION_SCHEDULE_UNAVAILABLE[language];
    else if (!date) note = PLAN_NOTES.noTimes[language];
    else {
      const gate = queueGate(variants, holder.id, now, {
        releaseHuman: false,
        blockPublished: true,
      });
      if (gate.block) note = PLAN_NOTES[gate.block][language];
      // Площадка проверяла другую версию или не проверяла вовсе (режим
      // сменился между проверкой и замком): без проверки в очередь не ставим.
      else if (validatedId !== holder.id) note = PLAN_NOTES.settleFailed[language];
      else if (refusal) note = refusal;
      else {
        const released = await this.releaseInDb(
          db,
          organizationId,
          variants.filter((one) => gate.release.includes(one.id))
        );
        effects = {
          stop: released.map((one) => one.postId),
          start: { adaptationId: holder.id, postId: post.id },
          released,
        };
      }
    }
    const queued = !!effects.start;
    await db.setPostState(organizationId, post.id, {
      ...(queued ? { state: 'QUEUE' as const } : {}),
      ...(date ? { publishDate: date } : {}),
    });
    await db.setPlan(organizationId, holder.id, {
      plan: queued ? 'autopilot' : 'reserve',
      planNote: note,
    });
    return { id: holder.id, effects };
  }

  /**
   * Посты канала, которые изменит его режим, — одним правилом для счёта и
   * для хода «Ко всем N» (`planWouldChange`): невышедшие, без своего режима,
   * не в архиве, и режим их действительно меняет. Очередь, подтверждённая
   * человеком, сюда не входит.
   */
  private async piecesToApplyIn(
    organizationId: string,
    integrationId: string,
    mode: PlanModeV1
  ): Promise<string[]> {
    const repo = this.pieces as Partial<PieceRepository>;
    if (typeof repo.channelPieceVariants !== 'function') return [];
    const rows = await repo.channelPieceVariants(organizationId, integrationId);
    const byPiece = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byPiece.get(row.contentPieceId) ?? [];
      list.push(row);
      byPiece.set(row.contentPieceId, list);
    }
    const result: string[] = [];
    for (const [pieceId, variants] of byPiece) {
      const piece = variants[0]?.piece;
      if (!piece || piece.archivedAt) continue;
      if (postPlanModeOf(piece.tags, integrationId)) continue;
      if (variants.some((one) => upperState(one.post?.state) === 'PUBLISHED')) continue;
      const holder = this.holderOf(variants);
      if (holder?.post && planWouldChange({ plan: holder.plan, state: holder.post.state }, mode))
        result.push(pieceId);
    }
    return result;
  }

  /** Сколько уже написанных постов изменит режим канала (`97dq.70`). */
  async channelPlanImpact(
    organizationId: string,
    integrationId: string,
    language: 'ru' | 'en' = 'ru'
  ): Promise<ChannelPlanImpactV1> {
    const channel = (await this.pieces.listIntegrations(organizationId)).find(
      (one) => one.id === integrationId
    );
    if (!channel) throw pieceError('PIECE_CHANNEL_UNKNOWN', language, integrationId);
    const mode = planModeOf(channel.planMode);
    const pieces = await this.piecesToApplyIn(organizationId, integrationId, mode);
    return { integrationId, planMode: mode, count: pieces.length };
  }

  /**
   * «Ко всем N»: режим канала — к каждому посту из счёта, по одному, каждый
   * под своим замком. `expected` — режим, на который человек ответил: если
   * канал с тех пор сменил режим, ход не начинается (409). Под замком каждого
   * поста режим канала и свой режим поста перечитываются: пост, получивший
   * свой режим посреди хода, не трогается. Отказ одного поста не останавливает
   * остальные.
   */
  async applyChannelPlanMode(
    organizationId: string,
    integrationId: string,
    expected: PlanModeV1 | undefined,
    language: 'ru' | 'en' = 'ru'
  ): Promise<ChannelPlanApplyResponseV1> {
    const channel = (await this.pieces.listIntegrations(organizationId)).find(
      (one) => one.id === integrationId
    );
    if (!channel) throw pieceError('PIECE_CHANNEL_UNKNOWN', language, integrationId);
    const mode = planModeOf(channel.planMode);
    if (!isPlanMode(expected) || expected !== mode)
      throw workspaceError('CHANNEL_PLAN_MODE_CHANGED', language);
    if (!this.planStore()) throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);
    const pieces = await this.piecesToApplyIn(organizationId, integrationId, mode);
    let applied = 0;
    for (const pieceId of pieces) {
      try {
        const outcome = await this.planPostUnderLock(
          organizationId,
          pieceId,
          channel,
          { decides: true, predicted: mode, expectedChannelMode: mode },
          language
        );
        if (outcome.applied) applied += 1;
      } catch (error) {
        this.logger.error(
          `Piece ${pieceId}: channel plan mode not applied: ${describeError(error)}`
        );
      }
    }
    return { integrationId, planMode: mode, count: pieces.length, applied };
  }

  /**
   * «Поставить на ЧЧ:ММ» из календаря (`content-factory-next-97dq.57`).
   *
   * Выбранная версия становится держателем слота своей заготовки в канале
   * (`plannedAt`), прочие версии уходят из очереди, пока это безопасно, и
   * версия встаёт на время по режиму канала: «Бронь» — «в плане», «Автопилот»
   * — в очередь через ту же проверку площадки, что у «Запланировать» (отказ
   * оставляет бронь с причиной), «Без плана» — черновик с этим временем.
   * Уже запланированная версия переносится и остаётся в очереди, если до её
   * выхода больше двух минут. Ответ несёт итог — время, режим и состояние —
   * для любого экрана подтверждения.
   */
  async placeAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    input: PieceAdaptationPlaceRequestV1,
    language: 'ru' | 'en' = 'ru'
  ): Promise<PieceAdaptationPlaceResponseV1> {
    const wanted = trimmed(input?.date);
    if (!wanted) throw workspaceError('ADAPTATION_SCHEDULE_DATE_REQUIRED', language);
    const when = new Date(wanted);
    if (!Number.isFinite(when.getTime()))
      throw workspaceError('ADAPTATION_SCHEDULE_DATE_INVALID', language);
    if (when.getTime() < this.now().getTime() - 60_000)
      throw workspaceError('ADAPTATION_SCHEDULE_DATE_PAST', language);
    const store = this.planStore();
    if (!this.posts || !store)
      throw workspaceError('ADAPTATION_SCHEDULE_UNAVAILABLE', language);

    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const draft = await this.liveVariantRead(organizationId, pieceId, adaptationId, () =>
      this.pieces.workspaceDraft(organizationId, pieceId, adaptationId)
    );
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    const post = draft.post;
    const state = upperState(post?.state);
    const now = this.now();
    if (
      !post ||
      post.deletedAt ||
      (state !== 'DRAFT' &&
        !(state === 'QUEUE' && canReplaceQueued(post, now)))
    ) {
      throw workspaceError('ADAPTATION_NOT_DRAFT', language);
    }

    const iso = when.toISOString();
    const integrationId = post.integration.id;
    // Площадка проверяет черновик до замка (I3), если его может поставить
    // в очередь автопилот; замок её не ждёт (N2).
    let validated = false;
    let refusal: string | null = null;
    if (
      state === 'DRAFT' &&
      (await this.planModeFor(store, organizationId, pieceId, integrationId)) === 'autopilot'
    ) {
      refusal = (await this.queueRefusal(organizationId, post, language))?.text ?? null;
      validated = true;
    }

    // Под коротким замком — только решение и база (F4, N2). Другие версии
    // снимаются с очереди только тогда, когда выбранная действительно встаёт
    // в очередь (F9), и только по правилу одной очереди (`queueGate`, F1, F5).
    const decided = await this.lockChannel(organizationId, pieceId, integrationId, async (db) => {
      const mode = await this.planModeFor(db, organizationId, pieceId, integrationId);
      const variants = await db.channelVariants(organizationId, pieceId, integrationId);
      const mine = variants.find((one) => one.id === adaptationId);
      const mineState = upperState(mine?.post?.state);
      const nowInLock = this.now();
      if (
        !mine?.post ||
        mine.post.deletedAt ||
        (mineState !== 'DRAFT' &&
          !(mineState === 'QUEUE' && canReplaceQueued(mine.post, nowInLock)))
      ) {
        throw workspaceError('ADAPTATION_NOT_DRAFT', language);
      }
      let status: 'reserved' | 'queued' | 'draft' = 'reserved';
      let plan: PlanModeV1 | undefined;
      let note: string | null = null;
      let autopilot = false;
      let effects = NO_EFFECTS;
      const release = async (ids: string[]) => {
        const released = await this.releaseInDb(
          db,
          organizationId,
          variants.filter((one) => ids.includes(one.id))
        );
        effects = {
          stop: released.map((one) => one.postId),
          start: { adaptationId, postId: mine.post!.id },
          released,
        };
      };
      if (mineState === 'QUEUE') {
        // Подтверждённая очередь переносится и остаётся очередью; процесс
        // публикации перезапускается на новое время после фиксации. Метка
        // очереди (чья она — человека или автопилота) не меняется.
        const gate = queueGate(variants, adaptationId, nowInLock, {
          releaseHuman: true,
          blockPublished: false,
        });
        if (gate.block) throw workspaceError('ADAPTATION_QUEUE_BUSY', language);
        await release(gate.release);
        await db.setPostState(organizationId, mine.post.id, { publishDate: when });
        status = 'queued';
      } else if (mode === 'autopilot') {
        const gate = queueGate(variants, adaptationId, nowInLock, {
          releaseHuman: true,
          blockPublished: true,
        });
        note = gate.block ? PLAN_NOTES[gate.block][language] : validated ? refusal : null;
        if (note || !validated) {
          await db.setPostState(organizationId, mine.post.id, { publishDate: when });
          plan = 'reserve';
        } else {
          await release(gate.release);
          await db.setPostState(organizationId, mine.post.id, {
            state: 'QUEUE',
            publishDate: when,
          });
          status = 'queued';
          plan = 'autopilot';
          autopilot = true;
        }
      } else {
        await db.setPostState(organizationId, mine.post.id, { publishDate: when });
        status = mode === 'draft' ? 'draft' : 'reserved';
        plan = mode;
      }
      await db.setPlan(organizationId, adaptationId, {
        ...(plan ? { plan } : {}),
        planNote: note,
        plannedAt: this.now(),
      });
      return { mode, status, note, autopilot, effects, moved: mineState === 'QUEUE' };
    });

    const { mode } = decided;
    let { status, note, autopilot } = decided;
    if (
      !(await this.applyQueueEffects(organizationId, pieceId, integrationId, decided.effects, language))
    ) {
      status = 'reserved';
      note = PLAN_NOTES.startFailed[language];
      autopilot = false;
    }

    const adaptation = await this.adaptationAfterWrite(
      organizationId,
      pieceId,
      adaptationId,
      language
    );
    if (decided.moved && status === 'queued') autopilot = adaptation.plan?.autopilot ?? false;
    return {
      adaptation,
      placement: { mode, status, date: iso, autopilot, note },
    };
  }

  async researchCore(organizationId: string, pieceId: string, actorUserId: string,
    input: { confirmWebSpend?: boolean; level?: PieceResearchLevel; direction?: string },
    language: 'ru' | 'en' = 'ru'): Promise<PieceResearchPreview> {
    if (input.confirmWebSpend !== true) throw new AdaptationReviewError('PIECE_RESEARCH_CONFIRM', 400,
      language === 'ru' ? 'Подтвердите поиск по источникам.' : 'Confirm source research.');
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const core = this.coreOf(piece);
    if (!core?.text.trim()) throw new AdaptationReviewError('PIECE_CORE_MISSING', 409,
      language === 'ru' ? 'Сначала добавьте суть.' : 'Add the core text first.');
    if (!this.snapshots || !this.intake || !this.aiUsage || !actorUserId)
      throw new AdaptationReviewError('PIECE_RESEARCH_UNAVAILABLE', 503,
        language === 'ru' ? 'Исследование сейчас недоступно.' : 'Research is unavailable.');
    const level: PieceResearchLevel = input.level === 'quick' || input.level === 'deep'
      ? input.level
      : 'standard';
    const direction = typeof input.direction === 'string'
      ? input.direction.trim().slice(0, 300)
      : '';
    const state = await this.intake.researchExistingCore(
      organizationId,
      core.text,
      core.brief,
      language,
      level,
      direction || undefined
    );
    const snapshotKey = randomUUID();
    await this.snapshots.set(this.coreResearchKey(organizationId, actorUserId, pieceId, snapshotKey),
      JSON.stringify({ version: PIECE_RESEARCH_VERSION, organizationId, actorUserId, pieceId, language,
        body: piece.body, title: piece.title, brief: piece.brief, state,
        expiresAt: this.now().getTime() + INTAKE_SNAPSHOT_TTL_SECONDS * 1000 }),
      'EX', INTAKE_SNAPSHOT_TTL_SECONDS);
    return { version: PIECE_RESEARCH_VERSION, snapshotKey, level, input: core.text,
      ...(direction ? { direction } : {}),
      facts: state.filled.brief.facts, corrections: state.corrections, summary: state.summary };
  }

  async acceptCoreResearch(organizationId: string, pieceId: string, actorUserId: string,
    input: PieceResearchSelection) {
    const expired = () => new AdaptationReviewError('PIECE_RESEARCH_EXPIRED', 409,
      'Результат исследования истёк. Запустите исследование снова.');
    if (!this.snapshots || !this.intake || !this.aiUsage) throw expired();
    const key = this.coreResearchKey(organizationId, actorUserId, pieceId, input.snapshotKey);
    const raw = await this.snapshots.get(key);
    let saved: { version: string; organizationId: string; actorUserId: string; pieceId: string;
      language: 'ru' | 'en'; body: string; title: string; brief: unknown;
      state: IntakeRunState; expiresAt: number };
    try { saved = JSON.parse(raw || 'null'); } catch { throw expired(); }
    if (!saved || !(PIECE_RESEARCH_VERSIONS as readonly string[]).includes(saved.version) ||
      saved.organizationId !== organizationId ||
      saved.actorUserId !== actorUserId || saved.pieceId !== pieceId ||
      !Number.isFinite(saved.expiresAt) || saved.expiresAt <= this.now().getTime()) throw expired();
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', saved.language, pieceId);
    if (piece.body !== saved.body || piece.title !== saved.title || !isDeepStrictEqual(piece.brief, saved.brief))
      throw new AdaptationReviewError('PIECE_RESEARCH_STALE', 409,
        'Заготовка уже изменилась. Обновите страницу перед новым исследованием.');
    const core = this.coreOf(piece);
    if (!core) throw expired();
    const allowed = new Set(saved.state.filled.brief.facts.map((fact: PieceFactV2) => fact.factKey));
    if (!Array.isArray(input.selectedKeys) || input.selectedKeys.length > 100 ||
      input.selectedKeys.some(key => typeof key !== 'string' || !allowed.has(key)))
      throw new AdaptationReviewError('PIECE_RESEARCH_SELECTION', 400, 'Выберите опоры из результата исследования.');
    const state = this.intake.selectCoreResearch(saved.state, saved.body, saved.language, input.selectedKeys);
    const rewritten = await writeCore({ organizationId, language: saved.language,
      delegatedPolicy: await this.coreDelegatedPolicy(organizationId),
      brief: selectedFactsBrief(state.filled.brief), answers: core.answers, questionTextByKey: {},
      personText: core.personText ?? '', instruction: instructionOf(core), existingCore: state.correctedInput || saved.body,
      borrowed: (piece.brief as any)?.borrowed ?? null, foreignShingles: this.foreignShinglesOf(piece) },
      { aiUsage: this.aiUsage, slopCheck: this.slopCheck, warn: message => this.logger.warn(message) });
    if (rewritten.writtenBy !== 'model' || !rewritten.text.trim())
      throw new AdaptationReviewError('PIECE_RESEARCH_WRITE_FAILED', 503,
        'Не удалось дополнить суть. Исходный текст сохранён; попробуйте применить результат ещё раз.');
    const accepted = await this.pieces.acceptCoreReview(organizationId, pieceId,
      { body: saved.body, title: saved.title, brief: saved.brief }, rewritten.text, saved.title,
      { ...(piece.brief as Record<string, unknown>), ...this.storedCore(rewritten),
        brief: state.filled.brief, authorNumbers: core.authorNumbers,
        personText: core.personText ?? '', ...(core.sourceText ? { sourceText: core.sourceText } : {}), ...keptInstruction(core), questions: core.questions,
        // The model wrote this text from all the material (`97dq.75`): the
        // hand edit is in the old one, and nothing added is waiting any more.
        editedBy: undefined, materialPending: undefined });
    await this.snapshots.del(key);
    return accepted;
  }

  private coreResearchKey(organizationId: string, actorUserId: string, pieceId: string, id: string): string {
    return `piece:research:${organizationId}:${actorUserId}:${pieceId}:${id}`;
  }

  async reviewV2(
    organizationId: string,
    pieceId: string,
    adaptationId: string | undefined,
    input: {
      mode?: AdaptationReviewAction;
      instruction?: string;
      confirmWebSpend?: boolean;
    },
    language: 'ru' | 'en' = 'ru'
  ) {
    if (input.mode === 'research') throw new AdaptationReviewError('ADAPTATION_REVIEW_MODE', 400, 'Исследование доступно через «Дополнить ресерчем».');
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const core = this.coreOf(piece);
    if (core && !core.text.trim())
      throw new AdaptationReviewError(
        'PIECE_CORE_MISSING',
        409,
        'Сначала ответьте на вопросы к заготовке.'
      );
    if (input.instruction !== undefined && !input.instruction.trim())
      throw new AdaptationReviewError(
        'REWRITE_INSTRUCTION',
        400,
        'Напишите, что перегенерировать.'
      );
    if (!this.aiUsage)
      throw new AdaptationReviewError(
        'AI_UNAVAILABLE',
        503,
        'Проверка сейчас недоступна.'
      );
    let text = core?.text ?? piece.body;
    let snapshot: ReviewSnapshotV2 | undefined;
    /**
     * Площадка, по порогам которой считается каталог штампов. У сути это
     * `core` — ровно то, чем её метит приёмка правки ниже, — а у адаптации её
     * канал, тот же, что берёт строка качества на странице
     * (`adaptationOf` → `adaptationChecksOf`). Одно число о тексте должно
     * считаться одними порогами (`content-factory-next-97dq.3`, P2-17).
     */
    let platform = 'core';
    // «До N» поста или канала (`97dq.83`): у сути потолка нет.
    let emojiCeiling: EmojiCeiling | null | undefined;
    if (adaptationId) {
      const draft = await this.liveVariantRead(organizationId, pieceId, adaptationId, () =>
        this.pieces.reviewDraft(organizationId, pieceId, adaptationId)
      );
      if (!draft)
        throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
      if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt)
        throw reviewConflict();
      const provider = this.integrationManager.getSocialIntegration(
        draft.post.integration.providerIdentifier
      );
      platform = providerOfPlatform(draft.post.integration.providerIdentifier);
      emojiCeiling = await this.emojiCeilingById(
        organizationId,
        piece.tags,
        draft.post.integration.id
      );
      text = reviewTextOf(draft, provider.editor);
      snapshot = {
        adaptationTitle: draft.title ?? null,
        postId: draft.post.id,
        postContent: draft.post.content,
        postUpdatedAt: draft.post.updatedAt.toISOString(),
        adaptationBody: draft.body,
        adaptationUpdatedAt: draft.updatedAt.toISOString(),
      };
    }
    if (!text.trim())
      throw new AdaptationReviewError(
        'REVIEW_EMPTY',
        400,
        'Сначала добавьте текст.'
      );
    // Only legacy null titles fall back to the first nonempty line.
    const title = adaptationId
      ? snapshot!.adaptationTitle ??
        text.split('\n').find((line) => line.trim()) ??
        ''
      : piece.title;
    const sign = (
      reviewed: Omit<
        ReviewProposalV3,
        | 'version'
        | 'language'
        | 'organizationId'
        | 'pieceId'
        | 'adaptationId'
        | 'expires'
        | 'originalText'
        | 'title'
        | 'snapshot'
        | 'pieceSnapshot'
      >
    ) => {
      const proposal: ReviewProposalV3 = {
        version: REVIEW_VERSION,
        language,
        organizationId,
        pieceId,
        ...(adaptationId ? { adaptationId } : {}),
        expires: Date.now() + 30 * 60 * 1000,
        originalText: text,
        title,
        ...reviewed,
        snapshot,
        pieceSnapshot: {
          body: piece.body,
          brief: piece.brief,
          title: piece.title,
        },
      };
      const {
        organizationId: _org,
        pieceId: _piece,
        adaptationId: _adaptation,
        expires: _expires,
        snapshot: _snapshot,
        pieceSnapshot: _pieceSnapshot,
        ...publicResult
      } = proposal;
      return { ...publicResult, token: signReview(proposal) };
    };
    let sources: ReturnType<typeof webReviewSources> | undefined;
    let factCheck: ReviewProposalV3['factCheck'] | undefined;
    if (input.mode === 'web') {
      if (input.confirmWebSpend !== true || !this.webReview)
        throw new AdaptationReviewError(
          'REVIEW_WEB_CONFIRM',
          400,
          'Подтвердите расход на поиск и ИИ.'
        );
      /**
       * Сначала — что проверять, и только потом — поиск.
       *
       * Восьмой заход, E1: «почему только первые 5000 знаков… мы должны
       * выбирать суть, которую нужно проверить». Раньше сюда уходило начало
       * текста, исследование сжимало его в один-два запроса о теме, и число в
       * середине поста не искали вовсе. Теперь по запросу на утверждение,
       * в пределах потолка уровня; одно исследование — одна бронь квоты, как
       * и было.
       */
      const level: ResearchLevel = 'standard';
      const found = await checkableClaims(
        organizationId,
        { text, language },
        this.aiUsage,
        Math.min(
          RESEARCH_LEVEL_PRESETS[level].maxSearchQueries,
          REVIEW_CLAIM_QUERIES_MAX
        )
      );
      const queries = claimQueries(found.claims);
      if (!queries.length) {
        /**
         * Тихий удачный исход — но не один на два разных случая.
         *
         * «Проверять нечего» верно, только когда утверждений не нашлось вовсе:
         * текст без них ничем не хуже, и 4xx на него врал бы про поломку там,
         * где её нет. Если утверждения есть, а запроса по ним не составлено —
         * это наш пробел, и записывать его в свойство текста нечестно
         * (`content-factory-next-97dq.3`, P2-9). Ни поиска, ни вызова
         * проверяющей модели ни в том, ни в другом случае.
         */
        const findings = catalogFindingsOf(
          text,
          language,
          platform,
          // Те же опоры, что у обычного хода проверки (`97dq.10`): одно число
          // о тексте не должно зависеть от того, нашёлся ли запрос к поиску.
          this.groundedOf(core ?? null),
          this.supportedOf(core ?? null),
          emojiCeiling
        );
        const nothingFound = found.extracted === 0;
        return sign({
          text,
          changes: [],
          verdict: 'clean',
          summary: nothingFound
            ? language === 'ru'
              ? 'Проверять нечего: в тексте нет утверждений, которые можно сверить с источниками.'
              : 'Nothing to check: the text states no claim a source could confirm.'
            : language === 'ru'
            ? `Нашли ${found.extracted} ${claimWord(
                found.extracted
              )}, но не смогли составить по ним поисковый запрос. Поиск не запускали.`
            : `Found ${found.extracted} claim${
                found.extracted === 1 ? '' : 's'
              }, but could not turn them into a search query. No search was run.`,
          slopBefore: findings.length,
          slopAfter: findings.length,
          catalog: {
            removed: [],
            remaining: findings.map(({ ruleId, excerpt }) => ({ ruleId, excerpt })),
          },
          sources: [],
          factCheck: {
            claims: 0,
            queries: [],
            searched: false,
            extracted: found.extracted,
            unphrased: found.unphrased,
          },
        });
      }
      sources = webReviewSources(
        await this.webReview.research(
          organizationId,
          text.slice(0, REVIEW_CLAIM_TEXT_CHARS),
          { level, task: 'facts', language, queries }
        )
      );
      factCheck = {
        claims: queries.length,
        queries,
        searched: true,
        extracted: found.extracted,
        unphrased: found.unphrased,
      };
      if (!sources.length)
        throw new AdaptationReviewError(
          'REVIEW_WEB_EMPTY',
          422,
          'Поиск не дал источников с текстом. Черновик не изменён.'
        );
    }
    const reviewed = await reviewOnceV3(
      organizationId,
      {
        text,
        title,
        instruction: input.instruction,
        mode: input.mode,
        core: core?.text ?? piece.body,
        personText: core?.personText ?? '',
        facts: core ? selectedFactsBrief(core.brief).facts : [],
        language,
        platform,
        ...(emojiCeiling !== undefined ? { emojiCeiling } : {}),
        sources,
      },
      this.aiUsage,
      message => this.logger.warn(message)
    );
    return sign({ ...reviewed, sources, ...(factCheck ? { factCheck } : {}) });
  }

  async acceptReviewV2(
    organizationId: string,
    pieceId: string,
    adaptationId: string | undefined,
    input: { token: string; selectedIds: string[]; variant?: string }
  ) {
    const proposal = readReview(
      input.token,
      organizationId,
      pieceId,
      adaptationId
    );
    let text: string, title: string;
    try {
      text = applyReviewChanges(
        proposal.originalText,
        proposal.changes,
        input.selectedIds
      );
      title = proposal.title;
      if (proposal.changes.some((c) => c.target === 'title'))
        title = applyReviewChanges(
          proposal.title,
          proposal.changes,
          input.selectedIds,
          'title',
          input.variant
        );
    } catch {
      throw new AdaptationReviewError(
        'REVIEW_SELECTION',
        400,
        'Выберите правки из результата проверки.'
      );
    }
    if (adaptationId) {
      const draft = await this.liveVariantRead(organizationId, pieceId, adaptationId, () =>
        this.pieces.reviewDraft(organizationId, pieceId, adaptationId)
      );
      if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', 'ru', adaptationId);
      if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt)
        throw reviewConflict();
      const provider = this.integrationManager.getSocialIntegration(
        draft.post.integration.providerIdentifier
      );
      const titleSelected = proposal.changes.some(
        (c) => c.target === 'title' && input.selectedIds.includes(c.id)
      );
      if (
        titleSelected &&
        proposal.originalText.split('\n').find((line) => line.trim()) ===
          proposal.title
      )
        text = syncEmbeddedTitle(text, proposal.title, title);
      return this.pieces.acceptReviewV2(
        organizationId,
        pieceId,
        adaptationId,
        proposal.snapshot!,
        text,
        renderedPost(text, provider.editor),
        titleSelected ? title : proposal.snapshot!.adaptationTitle
      );
    }
    const brief = proposal.pieceSnapshot.brief as Record<string, unknown>;
    const stored = {
      ...brief,
      slop: runSlopCheck(text, { platform: 'core', locale: proposal.language }),
      ...(text !== proposal.originalText
        ? { writtenBy: 'model', editedBy: undefined }
        : {}),
      ...(title !== proposal.title ? { titleEdited: true } : {}),
    };
    return this.pieces.acceptCoreReview(
      organizationId,
      pieceId,
      proposal.pieceSnapshot,
      text,
      title,
      stored
    );
  }

  async archive(
    organizationId: string,
    pieceId: string,
    archived: boolean
  ): Promise<void> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    await this.pieces.archive(
      organizationId,
      pieceId,
      archived ? this.now() : null
    );
  }

  /**
   * Удалить заготовку насовсем (`97dq.30`, владелец 22.09.2026: «нет
   * возможности удалить заготовку, она должна быть из списка и из самой
   * заготовки»). В отличие от адаптации, опубликованный пост здесь не
   * запрет: удаляется запись заготовки и строки адаптаций, а посты в каналах
   * остаются — как и при архиве.
   */
  async delete(organizationId: string, pieceId: string): Promise<void> {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    await this.pieces.delete(organizationId, pieceId);
  }

  /* -----------------------------------------------------------------------
   * Чистая половина
   * -------------------------------------------------------------------- */

  private group(rows: AdaptationRow[]): Map<string, AdaptationRow[]> {
    const byPiece = new Map<string, AdaptationRow[]>();
    for (const row of rows) {
      const list = byPiece.get(row.contentPieceId) ?? [];
      list.push(row);
      byPiece.set(row.contentPieceId, list);
    }
    return byPiece;
  }

  /** Пишет ли эта заготовка на такую площадку хоть чем-нибудь. */
  private writesTo(rows: AdaptationRow[], platform: string): boolean {
    const wanted = providerOfPlatform(platform);
    return rows.some((row) => providerOfPlatform(row.platform) === wanted);
  }

  /**
   * Суть из строки: `body` — текст, `brief` — всё остальное.
   *
   * `null` у материала до волны, и это читается по `kind`, а не по наличию
   * JSON: строка без `kind` — заготовка, у которой суть не выделена, её тело
   * это HTML одного канала, и показывать его как нейтральную суть было бы
   * враньём.
   */
  private coreOf(piece: PieceRow): ZagotovkaCoreV1 | null {
    if (piece.kind !== 'CORE') return null;
    const stored = (piece.brief || {}) as Record<string, any>;
    const brief = (stored.brief || null) as BriefFilledV1 | null;
    if (!brief) return null;
    return {
      version: PIECE_CORE_VERSION,
      text: piece.body,
      brief,
      answers: Array.isArray(stored.answers) ? stored.answers : [],
      slop: (stored.slop as SlopReportV1) ?? null,
      writtenBy: stored.writtenBy === 'fallback' ? 'fallback' : 'model',
      authorNumbers: stored.authorNumbers === true,
      // Открытых вопросов у заготовки до волны `m2eg` не было вовсе, и это
      // читается как «спрашивать нечего», а не как пробел.
      questions: this.questionsOf(stored.questions),
      ...(typeof stored.personText === 'string'
        ? { personText: stored.personText }
        : {}),
      // Присланный чужой текст (`97dq.25`): у заготовок до этой волны его нет.
      ...(typeof stored.sourceText === 'string' && stored.sourceText.trim()
        ? { sourceText: stored.sourceText }
        : {}),
      // Присланное дословно (`97dq.41`): только у заготовок после этой волны.
      ...(typeof stored.inputText === 'string' && stored.inputText.trim()
        ? { inputText: stored.inputText }
        : {}),
      // Задание и ссылки из него (`97dq.29`): тоже только у новых заготовок.
      ...(typeof stored.instructionText === 'string' && stored.instructionText.trim()
        ? { instructionText: stored.instructionText }
        : {}),
      ...(Array.isArray(stored.keepLinks)
        ? { keepLinks: stored.keepLinks.filter((link: unknown): link is string => typeof link === 'string' && !!link.trim()) }
        : {}),
      // Источник повода (`content-factory-next-75xn.8`). Читается защитно и
      // по одному полю: у заготовок до этой волны его нет вовсе, а `brief` —
      // это JSON, записанный прежними сборками.
      ...(leadSourceOf(stored.leadSource)
        ? { leadSource: leadSourceOf(stored.leadSource)! }
        : {}),
      // Что автор дал заготовке потом (`97dq.75`): ссылка для поста,
      // дописанный материал, правка сути и её прежние тексты.
      ...(readPostLink(stored.postLink)
        ? { postLink: readPostLink(stored.postLink)! }
        : {}),
      ...(readAddedMaterial(stored.addedMaterial).length
        ? { addedMaterial: readAddedMaterial(stored.addedMaterial) }
        : {}),
      ...(stored.materialPending === true ? { materialPending: true } : {}),
      ...(stored.editedBy === 'person' ? { editedBy: 'person' as const } : {}),
      ...(stored.editedBy === 'person' && typeof stored.editedAt === 'string'
        ? { editedAt: stored.editedAt }
        : {}),
      ...(readCoreRevisions(stored.revisions).length
        ? { revisions: readCoreRevisions(stored.revisions) }
        : {}),
    };
  }

  /** Сохранённые отпечатки читаются защитно: `brief` — JSON старых сборок. */
  private foreignShinglesOf(piece: PieceRow): string[] {
    const stored = (piece.brief || {}) as Record<string, unknown>;
    if (!Array.isArray(stored.foreignShingles)) return [];
    return [
      ...new Set(
        stored.foreignShingles
          .map((value) => trimmed(value))
          .filter(Boolean)
      ),
    ];
  }

  /** Открытые вопросы из строки: чужой формы здесь быть не должно, но бывает. */
  private questionsOf(value: unknown): PieceQuestionsV1 | null {
    const stored = (value || null) as PieceQuestionsV1 | null;
    if (!stored || typeof stored !== 'object') return null;
    const items = Array.isArray(stored.items) ? stored.items : [];
    const answered = Array.isArray(stored.answered) ? stored.answered : [];
    // Вопрос «на чём стоит» без ключа снят с волны m2eg; вопрос о материале
    // с ключом (`97dq.44`) стоит на том же поле и остаётся.
    const retired = (question: PieceOpenQuestionV1) =>
      question.field === 'facts' && !question.key;
    const retiredFacts = items.some(retired);
    return {
      round: Number(stored.round) || 0,
      items: items.filter((question) => !retired(question)),
      answered:
        retiredFacts && !answered.some((answer) => answer.field === 'facts')
          ? [
              ...answered,
              {
                field: 'facts',
                text: '',
                origin: 'model',
                answeredAt: this.now().toISOString(),
              },
            ]
          : answered,
    };
  }

  private row(
    piece: PieceRow,
    index: number,
    language: 'ru' | 'en',
    cells: PieceCellV1[]
  ): PieceRowV1 {
    const stored = (piece.brief || {}) as Record<string, any>;
    const core = piece.kind === 'CORE';
    return {
      id: piece.id,
      code: materialCode(index),
      title: piece.title,
      format: materialFormat(piece.body, piece.tags, language),
      date: materialDate(piece.createdAt, language),
      createdAt: isoOf(piece.createdAt) || '',
      excerpt: core ? this.excerptOf(piece.body) : [],
      coreExtracted: core,
      origin: this.originOf(stored),
      ...(voiceVersionLabel(piece.brandProfileVersion)
        ? { voiceVersion: voiceVersionLabel(piece.brandProfileVersion) }
        : {}),
      slopVerdict: stored.slop?.verdict ?? null,
      cells,
      archivedAt: isoOf(piece.archivedAt),
    };
  }

  /** Первые строки сути. Пустые не считаются: абзацы разделены пустой строкой. */
  private excerptOf(body: string): string[] {
    return String(body || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, PIECE_EXCERPT_LINES);
  }

  private originOf(stored: Record<string, any>): PieceOriginV1 {
    /*
      `content-factory-next-75xn.8`. `'lead'` жил в союзе и был подписан на
      обоих экранах — «из повода», — но ни одна строка его не возвращала:
      заготовка не знала, что выросла из повода, и подпись была недостижимой.
      Повод отвечает первым, потому что род входа у такой заготовки всегда
      `link` (повод приходит заголовком, выдержкой и адресом), и «ссылка»
      говорит о ней меньше, чем «повод».
    */
    if (leadSourceOf(stored?.leadSource)) return 'lead';
    const kind = trimmed(stored?.brief?.inputKind);
    return kind === 'thought' || kind === 'link' || kind === 'foreign_post' || kind === 'instruction'
      ? (kind as PieceOriginV1)
      : 'legacy';
  }

  /**
   * Адаптация для экрана.
   *
   * Имя канала берётся из списка каналов области по `integrationId`, а не из
   * поста: у `ContentDerivation.integrationId` нет внешнего ключа, и у
   * адаптации без поста имени иначе нет вовсе (решение Z1, записано в
   * `content-material.repository.ts`). Пост, когда он есть, отвечает первым:
   * он знает, куда текст ушёл на самом деле.
   *
   * Квитанция проверок считается здесь заново по сохранённому телу
   * (`content-factory-next-97dq.2`). Хранить её негде — схема в этой волне не
   * меняется, — а считать дважды разными руками нельзя, поэтому обе стороны
   * зовут `adaptationChecksOf`. Это страница одной заготовки, а не список:
   * список вообще не показывает строку качества, и считать её на каждую
   * строку области значило бы платить временем за то, чего никто не видит.
   */
  private adaptationOf(
    row: AdaptationRow,
    pieceId: string,
    integrations: PieceIntegrationRow[],
    checks?: AdaptationChecksV1,
    holders?: ReadonlySet<string>
  ): AdaptationV1 {
    const state = adaptationState(row.post);
    // Строка без полей плана — от старого сервера или набора: плана не знаем.
    const plan =
      row.plan !== undefined
        ? adaptationPlanOf(row, holders ? holders.has(row.id) : true)
        : undefined;
    const named =
      row.post?.integration ??
      integrations.find((one) => one.id === row.integrationId) ??
      null;
    const dated = state === 'published' || state === 'queued';
    const platform = providerOfPlatform(row.platform);
    const body = row.body ?? null;
    return {
      id: row.id,
      pieceId,
      kind: (trimmed(row.kind) || 'post') as AdaptationKindV1,
      platform,
      integrationId: row.integrationId ?? named?.id ?? null,
      integrationName: named?.name ?? null,
      title: row.title ?? null,
      // Текст строк до этой волны живёт в посте, и тянуть его сюда значило бы
      // выдать разметку канала за текст адаптации. `null` честнее.
      body,
      postId: row.postId ?? null,
      mediaId: row.mediaId ?? null,
      state: state ?? 'draft',
      date: dated ? isoOf(row.post?.publishDate) : null,
      url: row.post?.releaseURL ?? null,
      createdAt: isoOf(row.createdAt) || '',
      // Квитанцию считает страница, одним заходом на все строки сразу. Её
      // нет у строки без тела и у строки постарше последних
      // `PIECE_CHECKED_ADAPTATIONS`: считать нечего либо незачем.
      ...(checks ? { checks } : {}),
      ...(plan ? { plan } : {}),
    };
  }

  /**
   * Куда эту заготовку можно понести.
   *
   * Каждая площадка колонок плюс площадки живых каналов: первая половина —
   * «сюда уже писали», вторая — «сюда можно писать сейчас». Площадка без
   * живого канала приходит с `available: false`, чтобы страница показала её
   * выключенной с причиной, а не отказала после нажатия.
   */
  private targetsOf(
    integrations: PieceIntegrationRow[],
    adaptations: AdaptationRow[]
  ): PieceTargetV1[] {
    const platforms = new Map<string, PieceTargetV1>();
    const take = (platform: string) => {
      const provider = providerOfPlatform(platform);
      if (!provider) return null;
      const existing = platforms.get(provider);
      if (existing) return existing;
      const fresh: PieceTargetV1 = {
        platform: provider,
        name: this.integrationManager.getSocialIntegration(provider)?.name || provider,
        kinds: kindsOfProvider(provider),
        channels: [],
        available: false,
      };
      platforms.set(provider, fresh);
      return fresh;
    };

    for (const column of columnsOf(integrations, adaptations)) {
      take(column.platform);
    }
    for (const integration of integrations) {
      const target = take(integration.providerIdentifier);
      if (!target) continue;
      target.channels.push({
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
      });
      target.available = true;
    }
    return [...platforms.values()];
  }

  /**
   * Вкладки каналов (`content-factory-next-97dq.37`): одна на подключённый
   * канал, в порядке каналов области.
   *
   * Значок вкладки — та же клетка, что в таблице «Заготовки» (`bestCell`), но
   * по адаптациям одного канала, а не площадки. Канал адаптации — её
   * `integrationId`, а у строки без него — канал её поста; строки, у которых
   * нет ни того, ни другого, во вкладки не попадают (они видны в
   * `adaptations`). Версии идут от старой к новой: это «Вариант 1 … N».
   */
  private channelTabsOf(
    integrations: PieceIntegrationRow[],
    adaptations: AdaptationRow[],
    tags: unknown = null
  ): PieceChannelTabV1[] {
    return integrations.map((integration) => {
      const mine = adaptations.filter(
        (row) =>
          (row.integrationId ?? row.post?.integration?.id ?? null) ===
          integration.id
      );
      const provider = this.integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
      let maxLength: number | null = null;
      try {
        maxLength = provider ? this.providerMaxLength(provider, integration) : null;
      } catch {
        maxLength = null;
      }
      return {
        integrationId: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        maxLength: Number.isFinite(maxLength) ? maxLength : null,
        cell: bestCell(integration.providerIdentifier, mine),
        adaptationIds: mine.map((row) => row.id),
        // Режим канала и свои настройки поста (`97dq.70`): панель справа
        // показывает «как в канале» с его значением и то, что изменено.
        planMode: planModeOf(integration.planMode),
        settings: postSettingsOf(tags, integration.id),
        // Optional questions under a short post (`97dq.98`), while open.
        materialAsk: openMaterialAskOf(tags, integration.id),
      };
    });
  }

  /**
   * Ask «Какую ссылку поставить в пост?» (`97dq.75`): the piece's channels —
   * those it already has an adaptation in, or every connected channel while
   * it has none — and whether any of them lets a post carry a link, by the
   * post's own setting first and the channel card second.
   */
  private linkQuestionOf(
    core: ZagotovkaCoreV1 | null,
    integrations: PieceIntegrationRow[],
    adaptations: AdaptationRow[],
    tags: unknown
  ): boolean {
    if (!core) return false;
    const used = new Set(
      adaptations
        .map((row) => row.integrationId ?? row.post?.integration?.id ?? null)
        .filter((id): id is string => Boolean(id))
    );
    const considered = used.size
      ? integrations.filter((integration) => used.has(integration.id))
      : integrations;
    const policies = considered.map((integration) => {
      const own = postSettingsOf(tags, integration.id)?.options.links;
      return own && own !== 'channel'
        ? own
        : parseWritingProfile(
            integration.writingProfile,
            integration.providerIdentifier,
            integration.contentLanguage
          ).linkPolicy;
    });
    return linkQuestionOpen(core, policies);
  }

  /* -----------------------------------------------------------------------
   * Интервью под канал
   * -------------------------------------------------------------------- */

  /** Ответы человека под канал — дословно, с происхождением и площадкой. */
  private channelAnswers(plan: PieceAdaptPlanV1): PieceAnswerV1[] {
    const answeredAt = this.now().toISOString();
    return (plan.request?.answers || [])
      .map((answer) => {
        // Вопрос словами модели едет с ответом (`97dq.44`): сервер круга не
        // помнит. Только у её вопросов — у шаблонных текст известен и так.
        const question = isInterviewAskKey(answer?.key)
          ? oneLine(trimmed(answer?.question)).slice(0, INTERVIEW_QUESTION_MAX_CHARS)
          : '';
        return {
          key: answer?.key,
          text: trimmed(answer?.text),
          ...(question ? { question } : {}),
          origin: answer?.origin === 'confirmed' ? 'confirmed' : 'person',
          step: 'adaptation' as const,
          platform: plan.channel.providerIdentifier,
          answeredAt,
        };
      })
      .filter((answer) => answer.key && answer.text) as PieceAnswerV1[];
  }

  /**
   * Давать ли модели спросить перед адаптацией (`97dq.44`).
   *
   * Только первая адаптация на канале, только у заготовки с сутью (у
   * материала до волны спрашивать не по чему) и только на первом круге: ответ,
   * «Решите за меня» или «Решите всё за меня» — это уже второй круг.
   */
  private asksBeforeAdapting(
    plan: PieceAdaptPlanV1,
    answers: readonly PieceAnswerV1[]
  ): boolean {
    return (
      plan.firstOnChannel === true &&
      Boolean(plan.core?.text?.trim()) &&
      !answers.length &&
      !plan.request?.skipInterview &&
      !plan.request?.decideKeys?.length
    );
  }

  /** Отданный модели вопрос не задаётся второй раз. */
  private decided(
    request: PieceAdaptRequestV1,
    question: PieceQuestionV1
  ): boolean {
    return (request?.decideKeys || []).includes(question.key);
  }

  /**
   * Который это круг.
   *
   * Ответы или «Реши сама» в запросе означают, что круг уже был. Дальше
   * `PIECE_MAX_INTERVIEW_ROUNDS` вопросов не задают вовсе и модель решает
   * сама: отказать человеку `PIECE_INTERVIEW_EXHAUSTED` после того, как он
   * дважды ответил, значило бы взять ответы и не дать текста.
   */


  /**
   * Свои прежние тексты по теме этой заготовки.
   *
   * Решение владельца 07.09.2026 (`content-factory-next-m2eg.19`): «нам это
   * нужно сразу сделать, чтобы модель научилась на них ссылаться».
   *
   * Три условия отбора, и каждое — про то, чтобы ссылка была настоящей:
   *
   *  - только ВЫШЕДШИЕ тексты со своим адресом (`linkableOnly`): сослаться
   *    можно лишь на то, что читатель откроет;
   *  - только эта площадка: ссылка из Telegram на пост в Telegram —
   *    продолжение разговора, а ссылка на чужую площадку — уход с неё;
   *  - три штуки. Список — материал для одной фразы, а не витрина; длинный
   *    список модель начинает пересказывать вместо того, чтобы писать.
   *
   * Спрашивается тем же, чем человек назвал предмет: тезисом заготовки, а не
   * заголовком канала. Отказ поиска — пустой список: адаптация пишется и без
   * ссылок, а вот пустое обещание «нашлось» она бы уже не отработала.
   */
  private async relatedPosts(
    organizationId: string,
    plan: PieceAdaptPlanV1
  ): Promise<RelatedOwnPostV1[]> {
    if (!this.search) return [];
    const query =
      trimmed(plan.core?.brief?.thesis) ||
      trimmed(plan.core?.text) ||
      plan.title;
    if (!query) return [];
    try {
      const hits = await this.search.search(organizationId, query, {
        platform: plan.channel.providerIdentifier,
        kinds: ['ADAPTATION', 'POST'],
        linkableOnly: true,
        limit: 3,
        mode: 'ranked',
      });
      return relatedOwnPostsOf(hits);
    } catch (error) {
      this.logger.warn(
        `Related own posts could not be gathered; the adaptation goes on without them: ${describeError(
          error
        )}`
      );
      return [];
    }
  }

  /**
   * Материал заготовки, названный явно: факты и доказательства её брифа.
   *
   * Адаптация не ищет в вебе (`materialPolicy: 'PIECE_ONLY'`), поэтому то, на
   * чём стоит заготовка, обязано доехать до строителя контекста своими
   * идентификаторами. Берётся только записанное: у факта — `factId`, у
   * доказательства — `evidenceId`. Утверждение брифа без записи в памяти
   * области идентификатора не имеет, и выдумывать его здесь нечем.
   *
   * И оно же — словами (`content-factory-next-97dq.2`). Владелец, 18.09.2026:
   * «заготовка должна подготавливать всё полезное, что может быть для
   * адаптации». Одних идентификаторов для этого мало: строка без записи в
   * памяти не доезжала вовсе, а записанная приезжала тем, что строитель
   * контекста счёл нужным показать. Отбор — тот же `selectedFactsBrief`, что
   * решает, какие опоры идут в текст: своё и подтверждённое целиком, из
   * находок ресерча — только отмеченные человеком.
   */
  private briefMaterial(plan: PieceAdaptPlanV1): {
    factIds: string[];
    evidenceIds: string[];
    material: IntakeMaterialHintV1[];
  } {
    const facts = plan.core?.brief ? selectedFactsBrief(plan.core.brief).facts : [];
    return {
      factIds: [
        ...new Set(facts.map((fact) => trimmed(fact?.factId)).filter(Boolean)),
      ],
      evidenceIds: [
        ...new Set(
          facts.map((fact) => trimmed(fact?.evidenceId)).filter(Boolean)
        ),
      ],
      material: materialHints(
        facts as PieceFactV2[],
        plan.core?.brief?.inputKind
      ),
    };
  }

  /**
   * На чём стоит заготовка — словами, для проверки на штампы.
   *
   * `content-factory-next-97dq.10`, решение владельца 18.09.2026: точное число
   * из источников размытым количеством не считается. Чтобы это было правдой, а
   * не догадкой, каталогу передаётся ровно тот материал, из которого написана
   * адаптация: суть, слова человека и отмеченные опоры брифа — тот же
   * `selectedFactsBrief` → `materialHints`, что собирает промпт. Второго
   * сборщика здесь нет намеренно: два ответа на вопрос «на чём стоит эта
   * заготовка» разошлись бы молча, и находка то появлялась бы, то исчезала.
   */
  private groundedOf(core: ZagotovkaCoreV1 | null): string[] {
    if (!core) return [];
    const facts = core.brief ? selectedFactsBrief(core.brief).facts : [];
    return [
      trimmed(core.text),
      trimmed(core.personText),
      ...materialHints(facts as PieceFactV2[], core.brief?.inputKind).map(
        (hint) => hint.statement
      ),
    ].filter(Boolean);
  }

  /**
   * Утверждения отмеченных фактов — то же, что проверка адаптации получает
   * как `facts` и читает `reviewSupportedOf` (`content-factory-next-97dq.33`).
   * Строка качества на странице и «было N → стало M» в проверке обязаны
   * освобождать одни и те же пересказы опор, поэтому сборщик один.
   */
  private supportedOf(core: ZagotovkaCoreV1 | null): string[] {
    if (!core?.brief) return [];
    return reviewSupportedOf({ facts: selectedFactsBrief(core.brief).facts });
  }

  /** Подсказки генератору: канал, бриф заготовки, суть, опоры и ответы. */
  private hintsOf(
    plan: PieceAdaptPlanV1,
    answers: PieceAnswerV1[],
    material: IntakeMaterialHintV1[] = []
  ): IntakeGenerationHintsV1 {
    const brief = plan.core?.brief;
    const formatHint =
      channelFormatHint(
        answers.find((answer) => answer.key === 'format')?.text
      ) ?? channelFormatHint(brief?.format);
    // Что унести — направление всего текста, а не слова для цитаты: своей
    // строкой, а не среди ответов «цитировать дословно» (`97dq.31`).
    // Ответ на вопрос и разовая правка поста — одно и то же «что унести»;
    // правка поста главнее, и строка в промпте одна (`97dq.31` + `97dq.38`).
    const takeaway = trimmed(plan.request?.overrides?.takeaway)
      ? undefined
      : answers.find((answer) => answer.key === TAKEAWAY_QUESTION_KEY)?.text;
    // Ответы на вопросы модели (`97dq.44`) — направление этой версии, а не
    // цитата: своим блоком, парой «вопрос → ответ».
    const interview = adaptationInterviewLines(
      answers.filter((answer) => isInterviewAskKey(answer.key))
    );
    const quoted = answers.filter(
      (answer) =>
        answer.key !== TAKEAWAY_QUESTION_KEY && !isInterviewAskKey(answer.key)
    );
    // The author's link (`97dq.75`): the post's own «Ссылка для поста», else
    // the piece's answer. Nobody answered — the writer keeps its general rule.
    const link = effectivePostLink(
      plan.core,
      plan.request?.overrides?.postLink,
      plan.request?.overrides?.postLinkText
    );
    // «Текст ссылки» (`97dq.79`, hints `v3`): the words that carry the link.
    const authorLink = link
      ? {
          url: link.url,
          ...(link.from === 'post' ? { forPost: true } : {}),
          ...(link.url && link.text ? { text: link.text } : {}),
        }
      : null;
    return {
      version: INTAKE_HINTS_VERSION,
      brief: {
        thesis: brief?.thesis ?? null,
        position: brief?.position ?? null,
        disagreement: brief?.disagreement ?? null,
        audience: brief?.audience ?? null,
        goal: brief?.goal ?? null,
        ...(brief?.origins ? { origins: { ...brief.origins } } : {}),
      },
      ...(plan.core ? { core: plan.core.text } : {}),
      ...(material.length ? { material } : {}),
      ...(quoted.length
        ? { answers: quoted.map((answer) => `${answer.key}: ${answer.text}`) }
        : {}),
      ...(takeaway ? { takeaway } : {}),
      ...(interview.length ? { interview } : {}),
      ...(formatHint ? { formatHint } : {}),
      ...(plan.core?.keepLinks?.length ? { keepLinks: [...plan.core.keepLinks] } : {}),
      ...(authorLink ? { authorLink } : {}),
      ...(postOverridesOf(plan.request, plan.postEmojiLevel)
        ? { post: postOverridesOf(plan.request, plan.postEmojiLevel)! }
        : {}),
      ...(plan.foreignShingles.length
        ? { foreignShingles: plan.foreignShingles }
        : {}),
      channel: {
        integrationId: plan.channel.id,
        providerIdentifier: plan.channel.providerIdentifier,
        maxLength: plan.channel.maxLength,
        maxCaptionLength: plan.channel.maxCaptionLength,
        editor: plan.channel.editor,
        writingProfile: plan.channel.profile,
      },
    };
  }
}

export { PieceError };
