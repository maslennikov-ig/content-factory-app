import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
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
import { catalogFindingsOf } from './review-prompt.v5';
import { reviewTextOf } from './review-input';
import {
  factKind,
  factStatus,
  selectedFactsBrief,
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
  PieceDetailV1,
  PieceFieldAnswerV1,
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
  RelatedOwnPostV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  ADAPTATION_KINDS_LATER,
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
import { stripBoldMarkers } from '@contentfactory/helpers/utils/bold-markers';
import { editorHtml } from '../brief/editor-html';
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
import { writeCore } from './core-write';
import { PieceRepository, type PieceIntegrationRow, type PieceRow } from './piece.repository';
import { PIECE_ERROR_MESSAGES, PieceError, pieceError } from './errors';

import { htmlToPlainText } from '../brand-voice/html-text';
import {
  RESEARCH_LEVEL_PRESETS,
  WebResearchService,
  type ResearchLevel,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { AdaptationReviewError, reviewConflict,
  type AdaptationReviewAction, type AdaptationReviewSnapshot } from './adaptation-review.contract';
import {
  READY_ADAPTATIONS_VERSION,
  type ReadyAdaptationsResponseV1,
} from './ready-adaptations.contract';

/** Шов проверки на ИИ-штампы: в наборах подменяется, в продукте настоящий. */
export type PieceSlopCheckPort = (
  text: string,
  platform: string,
  locale: 'ru' | 'en',
  /** Опоры заготовки: точное число из них размытым количеством не считается. */
  grounded?: readonly string[]
) => SlopReportV1 | null;

const defaultSlopCheck: PieceSlopCheckPort = (
  text,
  platform,
  locale,
  grounded
) => runSlopCheck(text, { platform, locale, html: false, grounded });

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
  channel: {
    id: string;
    name: string;
    providerIdentifier: string;
    contentLanguage: string | null;
    profile: ChannelWritingProfileV1;
    maxLength: number;
    maxCaptionLength: number | null;
    editor: 'none' | 'normal' | 'markdown' | 'html';
  };
  /** `null` — материал до волны: сути нет, есть только тело канала. */
  core: ZagotovkaCoreV1 | null;
  /** Отпечатки чужого исходника, сохранённые рядом с брифом заготовки. */
  foreignShingles: string[];
  legacyBody: string | null;
  title: string;
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

@Injectable()
export class PieceService {
  private readonly logger = new Logger(PieceService.name);
  private readonly now: () => Date;
  private readonly slopCheck: PieceSlopCheckPort | null;

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
    private readonly snapshots: IntakeSnapshotStore | null = null
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
        promoteNoChannel(bestCell(column.platform, mine), column)
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
    const cells = columns.map((column) =>
      promoteNoChannel(bestCell(column.platform, adaptations), column)
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
      },
      scored.map((row) => ({
        text: row.body as string,
        platform: providerOfPlatform(row.platform),
      })),
      { slopCheck: this.slopCheck, voiceCheck: this.voiceCheck }
    );
    const checksById = new Map(
      scored.map((row, index) => [row.id, checks[index]])
    );

    return {
      state: 'default',
      piece: this.row(piece, index < 0 ? order.length : index, language, cells),
      core,
      legacyBody: core ? null : piece.body,
      adaptations: adaptations.map((row) =>
        this.adaptationOf(row, pieceId, integrations, checksById.get(row.id))
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
    return {
      pieceId,
      integrationId,
      kind: wanted || kinds[0],
      language,
      request,
      channel: {
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        contentLanguage: integration.contentLanguage ?? null,
        profile: parseWritingProfile(
          integration.writingProfile,
          integration.providerIdentifier,
          integration.contentLanguage
        ),
        maxLength: this.providerMaxLength(provider, integration),
        maxCaptionLength: provider.maxCaptionLength?.() ?? null,
        editor: provider.editor,
      },
      core,
      foreignShingles: this.foreignShinglesOf(piece),
      legacyBody: core ? null : piece.body,
      title: piece.title,
    };
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
    const hints = this.hintsOf(plan, answers, brief.material);
    hints.allowQuestion = !answers.length && !plan.request?.skipInterview && !(plan.request?.decideKeys?.length);
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
      ...(plan.request?.brandProfileSelection
        ? { brandProfileSelection: plan.request.brandProfileSelection as any }
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
    const content = (output.content as any[])
      .filter((item) => trimmed(item?.content))
      .map((item) => ({
        content: trimmed(item.content),
        usedCitationIds: Array.isArray(item?.usedCitationIds)
          ? item.usedCitationIds.filter((id: unknown) => trimmed(id))
          : [],
      }));
    if (!content.length) return null;

    const plain = content.map((item) => item.content).join('\n\n');
    const html = editorHtml(plain, plan.channel.editor);
    const snapshotId = trimmed(output.contentContextSnapshotId) || null;
    const versionId = trimmed(output.brandProfileVersionId) || null;

    const postId = await this.pieces.createDraft(organizationId, {
      channelId: plan.channel.id,
      providerIdentifier: plan.channel.providerIdentifier,
      content: html,
      date: trimmed(output.date) || this.now().toISOString(),
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
      state: 'draft',
      date: null,
      url: null,
      createdAt: isoOf(row.createdAt) || this.now().toISOString(),
      ...(answers.length ? { answers } : {}),
      checks,
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
    const given = this.fieldAnswers(plan.request);
    const acceptedEvidence: AcceptedEvidence[] = [];
    if (this.intake) {
      const urls = [
        ...new Set(given.flatMap((answer) => linksOf(answer.text))),
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
    const fresh: PieceFieldAnswerV1[] = [
      ...given.map((answer) => ({ ...answer, origin: 'person' as const, answeredAt })),
      ...decided.map((field) => ({
        field,
        text: '',
        origin: 'model' as const,
        answeredAt,
      })),
    ];

    const brief = given.length
      ? this.briefWithAnswers(plan.core.brief, given, acceptedEvidence)
      : plan.core.brief;
    const answered = [...before.answered, ...fresh];
    const settled = [...new Set(answered.map((answer) => answer.field))];
    const items: PieceOpenQuestionV1[] = [];
    const questions: PieceQuestionsV1 = { round, items, answered };

    /*
      После уточнений пишем первую суть. Для уже написанной сути делегирование
      снимает вопрос без повторного платного вызова.
    */
    let core: ZagotovkaCoreV1 = { ...plan.core, brief, questions };
    if ((given.length || !plan.core.text.trim()) && this.aiUsage) {
      const said = this.promptAnswers(given, answeredAt);
      const rewritten = await writeCore(
        {
          organizationId,
          language,
          brief: selectedFactsBrief(brief),
          answers: [...plan.core.answers, ...said],
          questionTextByKey: Object.fromEntries(
            said.map((answer) => [
              answer.key,
              before.items.find((question) => question.field === CORE_QUESTION_FIELDS[answer.key])?.question || coreQuestionText(answer.key, language),
            ])
          ),
          // Слова человека, с которых началась заготовка. Чужого текста здесь
          // нет ни одним полем и быть не может: он не сохраняется вовсе.
          personText: plan.core.personText ?? '',
          borrowed: plan.borrowed ?? null,
          foreignShingles: plan.foreignShingles,
        },
        {
          aiUsage: this.aiUsage,
          slopCheck: this.slopCheck,
          warn: (message) => this.logger.warn(message),
        }
      );
      core = { ...rewritten, brief, questions, ...(plan.borrowed ? { borrowed: plan.borrowed } : {}), personText: plan.core.personText ?? '' };
    }

    if (!core.text.trim()) {
      yield { name: 'error', error: true, code: 'PIECE_NOT_SAVED', message: PIECE_ERROR_MESSAGES.PIECE_NOT_SAVED[language] };
      return;
    }

    try {
      if (!this.briefs) {
        throw new Error('The piece service was built without its repository');
      }
      await this.briefs.updateCore(organizationId, plan.pieceId, {
        body: core.text,
        ...(!plan.titleEdited && (!plan.core.text || !textOrNull(plan.title) || plan.title === briefTitle(briefForGate(plan.core.brief), language) || ['Материал без названия', 'Untitled piece'].includes(plan.title)) ? { title: briefTitle({ thesis: textOrNull(brief.thesis) || core.text }, language) } : {}),
        brief: {
          ...this.storedCore(core),
          ...(plan.titleEdited ? { titleEdited: true } : {}),
          ...(plan.foreignShingles.length
            ? { foreignShingles: plan.foreignShingles }
            : {}),
        },
      });
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

  /** Ответы запроса: дословно, по одному на поле, пустые — не ответы. */
  private fieldAnswers(
    request: PieceAnswerRequestV1
  ): Array<{ field: BriefField; text: string }> {
    const byField = new Map<BriefField, string>();
    for (const answer of request.answers || []) {
      // Дословно: ни заглавной буквы, ни правки опечатки. Обрезаются только
      // пробелы по краям, потому что пустая строка — это не ответ.
      if (
        answer?.field &&
        answer.field !== 'facts' &&
        trimmed(answer.text)
      ) {
        byField.set(answer.field, answer.text.trim());
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
    next.ungrounded = next.facts
      .filter((fact) => !fact.verified && fact.origin !== 'person')
      .map((fact) => fact.statement);
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

  /** `ZagotovkaCoreV1` без `text`: текст живёт в колонке `body`. */
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
      brief: selectedFactsBrief(state.filled.brief), answers: core.answers, questionTextByKey: {},
      personText: core.personText ?? '', existingCore: state.correctedInput || saved.body,
      borrowed: (piece.brief as any)?.borrowed ?? null, foreignShingles: this.foreignShinglesOf(piece) },
      { aiUsage: this.aiUsage, slopCheck: this.slopCheck, warn: message => this.logger.warn(message) });
    if (rewritten.writtenBy !== 'model' || !rewritten.text.trim())
      throw new AdaptationReviewError('PIECE_RESEARCH_WRITE_FAILED', 503,
        'Не удалось дополнить суть. Исходный текст сохранён; попробуйте применить результат ещё раз.');
    const accepted = await this.pieces.acceptCoreReview(organizationId, pieceId,
      { body: saved.body, title: saved.title, brief: saved.brief }, rewritten.text, saved.title,
      { ...(piece.brief as Record<string, unknown>), ...this.storedCore(rewritten),
        brief: state.filled.brief, authorNumbers: core.authorNumbers,
        personText: core.personText ?? '', questions: core.questions });
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
    if (adaptationId) {
      const draft = await this.pieces.reviewDraft(
        organizationId,
        pieceId,
        adaptationId
      );
      if (!draft)
        throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
      if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt)
        throw reviewConflict();
      const provider = this.integrationManager.getSocialIntegration(
        draft.post.integration.providerIdentifier
      );
      platform = providerOfPlatform(draft.post.integration.providerIdentifier);
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
          this.groundedOf(core ?? null)
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
      const draft = await this.pieces.reviewDraft(
        organizationId,
        pieceId,
        adaptationId
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
      ...(text !== proposal.originalText ? { writtenBy: 'model' } : {}),
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
  async acceptAdaptationReview(organizationId: string, pieceId: string, adaptationId: string,
    input: { text: string; snapshot: AdaptationReviewSnapshot }) {
    const draft = await this.pieces.reviewDraft(organizationId, pieceId, adaptationId);
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', 'ru', adaptationId);
    if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt) throw reviewConflict();
    if (!input.text.trim()) throw new AdaptationReviewError('ADAPTATION_REVIEW_EMPTY', 400, 'Исправленный текст пуст.');
    const provider = this.integrationManager.getSocialIntegration(draft.post.integration.providerIdentifier);
    return this.pieces.acceptReview(organizationId, pieceId, adaptationId, input.snapshot,
      input.text, renderedPost(input.text, provider.editor));
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
      // Источник повода (`content-factory-next-75xn.8`). Читается защитно и
      // по одному полю: у заготовок до этой волны его нет вовсе, а `brief` —
      // это JSON, записанный прежними сборками.
      ...(leadSourceOf(stored.leadSource)
        ? { leadSource: leadSourceOf(stored.leadSource)! }
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
    const retiredFacts = items.some((question) => question.field === 'facts');
    return {
      round: Number(stored.round) || 0,
      items: items.filter((question) => question.field !== 'facts'),
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
    return kind === 'thought' || kind === 'link' || kind === 'foreign_post'
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
    checks?: AdaptationChecksV1
  ): AdaptationV1 {
    const state = adaptationState(row.post);
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

  /* -----------------------------------------------------------------------
   * Интервью под канал
   * -------------------------------------------------------------------- */

  /** Ответы человека под канал — дословно, с происхождением и площадкой. */
  private channelAnswers(plan: PieceAdaptPlanV1): PieceAnswerV1[] {
    const answeredAt = this.now().toISOString();
    return (plan.request?.answers || [])
      .map((answer) => ({
        key: answer?.key,
        text: trimmed(answer?.text),
        origin: answer?.origin === 'confirmed' ? 'confirmed' : 'person',
        step: 'adaptation' as const,
        platform: plan.channel.providerIdentifier,
        answeredAt,
      }))
      .filter((answer) => answer.key && answer.text) as PieceAnswerV1[];
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
    return {
      version: INTAKE_HINTS_VERSION,
      brief: {
        thesis: brief?.thesis ?? null,
        position: brief?.position ?? null,
        disagreement: brief?.disagreement ?? null,
        audience: brief?.audience ?? null,
        goal: brief?.goal ?? null,
      },
      ...(plan.core ? { core: plan.core.text } : {}),
      ...(material.length ? { material } : {}),
      ...(answers.length
        ? { answers: answers.map((answer) => `${answer.key}: ${answer.text}`) }
        : {}),
      ...(formatHint ? { formatHint } : {}),
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
