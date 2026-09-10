import { isDeepStrictEqual } from 'node:util';
import { reviewOnceV2, signReview, readReview } from './review.v2';
import { REVIEW_VERSION, applyReviewChanges, syncEmbeddedTitle, type ReviewProposal, type ReviewSnapshotV2 } from './review.v2.contract';
import { webReviewSources } from './adaptation-web-review';
import { selectedFactsBrief, type PieceFactV2 } from './piece-facts.v2';
import { briefForGate } from './core-questions';
import { briefTitle } from '../brief/content-brief.compose';
import { textOrNull } from '../intake/intake-content';
import type { PieceAnswerEventV2 } from '../brand-voice/intake-v2.contract';
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
} from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import { INTAKE_HINTS_VERSION } from '@contentfactory/nestjs-libraries/agent/generator-run-input';
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
  VOICE_CHECK_SILENT,
  type VoiceCheckPort,
} from '../brand-voice/voice-check.port';
import { editorHtml } from '../brief/editor-html';
import { ContentBriefRepository } from '../brief/content-brief.repository';
import { singleLinkOf } from '../intake/intake-kind';
import {
  CORE_QUESTION_FIELDS,
  coreQuestionText,
} from './core-questions';
import { writeCore } from './core-write';
import { PieceRepository, type PieceIntegrationRow, type PieceRow } from './piece.repository';
import { PIECE_ERROR_MESSAGES, PieceError, pieceError } from './errors';

import { htmlToPlainText } from '../brand-voice/html-text';
import { reviewAdaptationOnce } from './adaptation-review';
import { reviewAdaptationWithSearch } from './adaptation-web-review';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { ADAPTATION_REVIEW_ACTIONS, ADAPTATION_REVIEW_VERSION, AdaptationReviewError, reviewConflict,
  type AdaptationReviewAction, type AdaptationReviewResult, type AdaptationReviewSnapshot } from './adaptation-review.contract';
import {
  READY_ADAPTATIONS_VERSION,
  type ReadyAdaptationsResponseV1,
} from './ready-adaptations.contract';

/** Шов проверки на ИИ-штампы: в наборах подменяется, в продукте настоящий. */
export type PieceSlopCheckPort = (
  text: string,
  platform: string,
  locale: 'ru' | 'en'
) => SlopReportV1 | null;

const defaultSlopCheck: PieceSlopCheckPort = (text, platform, locale) =>
  runSlopCheck(text, { platform, locale, html: false });

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
    private readonly webReview: WebResearchService | null = null
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
        const text = htmlToPlainText(row.body || row.post.content || '');
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

    return {
      state: 'default',
      piece: this.row(piece, index < 0 ? order.length : index, language, cells),
      core,
      legacyBody: core ? null : piece.body,
      adaptations: adaptations.map((row) =>
        this.adaptationOf(row, pieceId, integrations)
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
    const hints = this.hintsOf(plan, answers);
    hints.allowQuestion = !answers.length && !plan.request?.skipInterview && !(plan.request?.decideKeys?.length);
    const brief = this.briefMaterial(plan);
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
     */
    const checks: AdaptationChecksV1 = {
      antiCopy: output.antiCopy ?? null,
      slop: this.slopCheck
        ? this.slopCheck(plain, plan.channel.providerIdentifier, plan.language)
        : null,
      voice: this.voiceCheck
        ? await this.voiceCheck.voiceCheckFor(
            organizationId,
            plain,
            plan.language
          )
        : VOICE_CHECK_SILENT,
    };
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
  async selectFact(organizationId: string, pieceId: string, statement: string, selected: boolean) {
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    const core = this.coreOf(piece);
    if (!core || !this.briefs) throw pieceError('PIECE_CORE_MISSING', 'ru', pieceId);
    if (!core.brief.facts.some((fact) => fact.statement === statement)) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    const facts = core.brief.facts.map((fact: PieceFactV2) => fact.statement === statement ? { ...fact, selected } : fact);
    await this.briefs.updateCoreMetadata(organizationId, pieceId, { expectedBody: piece.body, expectedBrief: piece.brief, brief: { ...(piece.brief as object), brief: { ...core.brief, facts } } });
    return { statement, selected };
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
  ): AsyncGenerator<PieceAnswerEventV2> {
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
    const decided = [...new Set([...(plan.request.decide || []), ...before.items.map((question) => question.field)])].filter(
      (field) => !given.some((answer) => answer.field === field)
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
      ? this.briefWithAnswers(plan.core.brief, given)
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
      if (answer?.field && trimmed(answer.text)) {
        byField.set(answer.field, answer.text.trim());
      }
    }
    return [...byField].map(([field, text]) => ({ field, text }));
  }

  /**
   * Бриф с ответами человека, где слово человека сильнее ответа модели.
   *
   * Ответ про факты становится фактом с происхождением `person`, и адрес
   * внутри него — его опорой. Без адреса опора всё равно есть: это слово
   * автора, и ворота считают его опорой (`brief-gate.ts`, `own`). Ровно из-за
   * обратного правила вопрос «на что это опирается» задавался по кругу.
   */
  private briefWithAnswers(
    brief: BriefFilledV1,
    given: ReadonlyArray<{ field: BriefField; text: string }>
  ): BriefFilledV1 {
    const next: BriefFilledV1 = {
      ...brief,
      origins: { ...brief.origins },
      facts: [...brief.facts],
    };
    for (const answer of given) {
      if (answer.field === 'facts') {
        const url = singleLinkOf(answer.text);
        const fact: BriefFilledFactV1 = {
          statement: url
            ? answer.text.replace(url, '').trim() || answer.text
            : answer.text,
          sourceUrl: url,
          factId: null,
          evidenceId: null,
          origin: 'person',
          verified: Boolean(url),
        };
        next.facts = [...next.facts, fact];
        continue;
      }
      next[answer.field] = answer.text;
      next.origins[answer.field] = 'person';
    }
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

  /** Signed review questions share /answer, but save author evidence without a model call. */
  async answerReviewQuestions(
    organizationId: string,
    pieceId: string,
    input: {
      token: string;
      adaptationId?: string;
      answers: Array<{ questionId: string; text: string }>;
    }
  ) {
    const proposal = readReview(
      input.token,
      organizationId,
      pieceId,
      input.adaptationId
    );
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', 'ru', pieceId);
    if (piece.archivedAt) throw pieceError('PIECE_ARCHIVED', 'ru', pieceId);
    if (
      piece.body !== proposal.pieceSnapshot.body ||
      piece.title !== proposal.pieceSnapshot.title ||
      !isDeepStrictEqual(piece.brief, proposal.pieceSnapshot.brief)
    )
      throw reviewConflict();
    const core = this.coreOf(piece);
    if (!core || !this.briefs)
      throw pieceError('PIECE_CORE_MISSING', 'ru', pieceId);
    if (input.adaptationId) {
      const draft = await this.pieces.reviewDraft(
        organizationId,
        pieceId,
        input.adaptationId
      );
      const snapshot = proposal.snapshot!;
      if (
        !draft?.post ||
        draft.post.state !== 'DRAFT' ||
        draft.post.deletedAt ||
        draft.post.id !== snapshot.postId ||
        draft.post.content !== snapshot.postContent ||
        draft.post.updatedAt.toISOString() !== snapshot.postUpdatedAt ||
        draft.body !== snapshot.adaptationBody ||
        (draft.title ?? null) !== snapshot.adaptationTitle ||
        draft.updatedAt.toISOString() !== snapshot.adaptationUpdatedAt
      )
        throw reviewConflict();
    }
    if (
      !input.answers.length ||
      new Set(input.answers.map((a) => a.questionId)).size !==
        input.answers.length
    )
      throw new AdaptationReviewError(
        'REVIEW_ANSWER',
        400,
        'Ответьте на вопрос из проверки.'
      );
    const answers = input.answers.map((answer) => {
      const question = proposal.changes.find(
        (change) => change.id === answer.questionId && change.basket === 'ask'
      );
      if (!question || !answer.text.trim() || answer.text.length > 2000)
        throw new AdaptationReviewError(
          'REVIEW_ANSWER',
          400,
          'Ответьте на вопрос из проверки.'
        );
      return {
        questionId: question.id,
        question: question.why,
        excerpt: question.excerpt,
        text: answer.text,
        answeredAt: this.now().toISOString(),
        origin: 'person' as const,
      };
    });
    const facts: PieceFactV2[] = answers.map((answer) => ({
      statement: answer.text,
      sourceUrl: null,
      factId: null,
      evidenceId: null,
      origin: 'person',
      kind: 'own',
      status: 'unverified',
      verified: false,
    }));
    const stored = piece.brief as Record<string, unknown>;
    const priorAnswers = (
      core.brief as unknown as { reviewAnswers?: unknown[] }
    ).reviewAnswers;
    const nextBrief = {
      ...stored,
      brief: {
        ...core.brief,
        facts: [...core.brief.facts, ...facts],
        reviewAnswers: [
          ...(Array.isArray(priorAnswers) ? priorAnswers : []),
          ...answers,
        ],
      },
    };
    await this.briefs.updateCoreMetadata(organizationId, pieceId, {
      expectedBody: piece.body,
      expectedBrief: piece.brief,
      brief: nextBrief,
    });
    const remainingQuestions = proposal.changes.filter(
      (change) =>
        change.basket === 'ask' &&
        !answers.some((answer) => answer.questionId === change.id)
    );
    const remaining = remainingQuestions.length
      ? {
          adaptationId: input.adaptationId,
          questions: remainingQuestions,
          token: signReview({
            ...proposal,
            changes: remainingQuestions,
            pieceSnapshot: { ...proposal.pieceSnapshot, brief: nextBrief },
          }),
        }
      : null;
    return {
      version: 'review-answer/v2' as const,
      pieceId,
      savedQuestionIds: answers.map((a) => a.questionId),
      remaining,
    };
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
      text =
        provider.editor === 'html' || provider.editor === 'normal'
          ? htmlToPlainText(draft.post.content)
          : draft.post.content;
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
    let sources: ReturnType<typeof webReviewSources> | undefined;
    if (input.mode === 'web' || input.mode === 'research') {
      if (input.confirmWebSpend !== true || !this.webReview)
        throw new AdaptationReviewError(
          'REVIEW_WEB_CONFIRM',
          400,
          'Подтвердите расход на поиск и модели.'
        );
      sources = webReviewSources(
        await this.webReview.research(organizationId, text.slice(0, 5000), {
          ...(input.mode === 'research' ? { level: 'deep' as const } : {}),
        })
      );
      if (!sources.length)
        throw new AdaptationReviewError(
          'REVIEW_WEB_EMPTY',
          422,
          'Поиск не дал источников с текстом. Черновик не изменён.'
        );
    }
    // Only legacy null titles fall back to the first nonempty line.
    const title = adaptationId
      ? snapshot!.adaptationTitle ??
        text.split('\n').find((line) => line.trim()) ??
        ''
      : piece.title;
    const reviewed = await reviewOnceV2(
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
        sources,
      },
      this.aiUsage
    );
    const proposal: ReviewProposal = {
      version: REVIEW_VERSION,
      language,
      organizationId,
      pieceId,
      ...(adaptationId ? { adaptationId } : {}),
      expires: Date.now() + 30 * 60 * 1000,
      originalText: text,
      title,
      ...reviewed,
      sources,
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
        editorHtml(text, provider.editor),
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
  async reviewAdaptation(organizationId: string, pieceId: string, adaptationId: string,
    mode: AdaptationReviewAction, language: 'ru' | 'en' = 'ru', confirmWebSpend = false): Promise<AdaptationReviewResult> {
    if (!ADAPTATION_REVIEW_ACTIONS.includes(mode)) {
      throw new AdaptationReviewError('ADAPTATION_REVIEW_MODE', 400, 'Выберите режим проверки.');
    }
    if ((mode === 'web' || mode === 'research') && confirmWebSpend !== true) throw new AdaptationReviewError('ADAPTATION_REVIEW_WEB_CONFIRM', 400, language === 'ru' ? 'Подтвердите расход на поиск и модели.' : 'Confirm spending on search and models.');
    if ((mode === 'web' || mode === 'research') && !this.webReview) throw new AdaptationReviewError('ADAPTATION_REVIEW_WEB_UNAVAILABLE', 503, language === 'ru' ? 'Поиск сейчас недоступен. Черновик не изменён.' : 'Search is unavailable. The draft has not changed.');
    const piece = await this.pieces.getPiece(organizationId, pieceId);
    if (!piece) throw pieceError('PIECE_NOT_FOUND', language, pieceId);
    const draft = await this.pieces.reviewDraft(organizationId, pieceId, adaptationId);
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', language, adaptationId);
    if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt) throw reviewConflict();
    if (!this.aiUsage) throw new AdaptationReviewError('AI_UNAVAILABLE', 503, 'Проверка сейчас недоступна.');
    const core = this.coreOf(piece);
    const provider = this.integrationManager.getSocialIntegration(draft.post.integration.providerIdentifier);
    const originalText = provider.editor === 'html' || provider.editor === 'normal'
      ? htmlToPlainText(draft.post.content) : draft.post.content;
    const result = mode === 'web' || mode === 'research'
      ? await reviewAdaptationWithSearch(organizationId, { text: originalText, language }, this.aiUsage, this.webReview!, mode === 'research' ? 'deep' : 'standard')
      : await reviewAdaptationOnce(organizationId, {
      mode, text: originalText, core: core?.text ?? piece.body,
      personText: core?.personText ?? '', facts: core?.brief.facts ?? [], language,
    }, this.aiUsage);
    return { version: ADAPTATION_REVIEW_VERSION, mode, originalText, ...result,
      snapshot: { postId: draft.post.id, postContent: draft.post.content,
        postUpdatedAt: draft.post.updatedAt.toISOString(), adaptationBody: draft.body,
        adaptationUpdatedAt: draft.updatedAt.toISOString() } };
  }

  async acceptAdaptationReview(organizationId: string, pieceId: string, adaptationId: string,
    input: { text: string; snapshot: AdaptationReviewSnapshot }) {
    const draft = await this.pieces.reviewDraft(organizationId, pieceId, adaptationId);
    if (!draft) throw pieceError('ADAPTATION_NOT_FOUND', 'ru', adaptationId);
    if (!draft.post || draft.post.state !== 'DRAFT' || draft.post.deletedAt) throw reviewConflict();
    if (!input.text.trim()) throw new AdaptationReviewError('ADAPTATION_REVIEW_EMPTY', 400, 'Исправленный текст пуст.');
    const provider = this.integrationManager.getSocialIntegration(draft.post.integration.providerIdentifier);
    return this.pieces.acceptReview(organizationId, pieceId, adaptationId, input.snapshot,
      input.text, editorHtml(input.text, provider.editor));
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
    return {
      round: Number(stored.round) || 0,
      items: Array.isArray(stored.items) ? stored.items : [],
      answered: Array.isArray(stored.answered) ? stored.answered : [],
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
   */
  private adaptationOf(
    row: AdaptationRow,
    pieceId: string,
    integrations: PieceIntegrationRow[]
  ): AdaptationV1 {
    const state = adaptationState(row.post);
    const named =
      row.post?.integration ??
      integrations.find((one) => one.id === row.integrationId) ??
      null;
    const dated = state === 'published' || state === 'queued';
    return {
      id: row.id,
      pieceId,
      kind: (trimmed(row.kind) || 'post') as AdaptationKindV1,
      platform: providerOfPlatform(row.platform),
      integrationId: row.integrationId ?? named?.id ?? null,
      integrationName: named?.name ?? null,
      title: row.title ?? null,
      // Текст строк до этой волны живёт в посте, и тянуть его сюда значило бы
      // выдать разметку канала за текст адаптации. `null` честнее.
      body: row.body ?? null,
      postId: row.postId ?? null,
      mediaId: row.mediaId ?? null,
      state: state ?? 'draft',
      date: dated ? isoOf(row.post?.publishDate) : null,
      url: row.post?.releaseURL ?? null,
      createdAt: isoOf(row.createdAt) || '',
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
   * области идентификатора не имеет, и выдумывать его здесь нечем — оно уже
   * доехало словами, внутри сути и брифа.
   */
  private briefMaterial(plan: PieceAdaptPlanV1): {
    factIds: string[];
    evidenceIds: string[];
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
    };
  }

  /** Подсказки генератору: канал, бриф заготовки, суть и ответы под канал. */
  private hintsOf(
    plan: PieceAdaptPlanV1,
    answers: PieceAnswerV1[]
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
