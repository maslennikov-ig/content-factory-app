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
  BriefFilledV1,
  PieceAdaptEventV1,
  PieceAdaptRequestV1,
  PieceAnswerV1,
  PieceCellV1,
  PieceDetailV1,
  PieceOriginV1,
  PieceQuestionV1,
  PieceRowV1,
  PieceTargetV1,
  PiecesQueryV1,
  PiecesResponseV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  ADAPTATION_KINDS_LATER,
  PIECE_CORE_VERSION,
  PIECE_EXCERPT_LINES,
  PIECE_MAX_INTERVIEW_ROUNDS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  adaptationState,
  bestCell,
  columnsOf,
  kindsOfProvider,
  materialCode,
  materialDate,
  materialFormat,
  providerOfPlatform,
  voiceVersionLabel,
} from '../materials/material-presentation';
import type { AdaptationRow } from '../materials/content-material.repository';
import {
  parseWritingProfile,
  type ChannelWritingProfileV1,
} from '../channels/channel-writing-profile';
import { questionsForChannel } from '../channels/channel-questions';
import { editorHtml } from '../brief/editor-html';
import { PieceRepository, type PieceIntegrationRow, type PieceRow } from './piece.repository';
import { PieceError, pieceError } from './errors';

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
  legacyBody: string | null;
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
    @Optional() slopCheck: PieceSlopCheckPort | null = null
  ) {
    this.now = now || (() => new Date());
    this.slopCheck = slopCheck || defaultSlopCheck;
  }

  /* -----------------------------------------------------------------------
   * Чтение
   * -------------------------------------------------------------------- */

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
    const matched = await this.pieces.searchPieceIds(organizationId, query.q);

    const rows: PieceRowV1[] = [];
    for (let index = 0; index < all.length; index += 1) {
      const piece = all[index];
      const mine = byPiece.get(piece.id) ?? [];
      const cells = columns.map((column) => bestCell(column.platform, mine));
      if (piece.archivedAt && !query.includeArchived) continue;
      if (matched && !matched.has(piece.id)) continue;
      if (query.missingOn && this.writesTo(mine, query.missingOn)) continue;
      if (query.state && !cells.some((cell) => cell.state === query.state)) {
        continue;
      }
      rows.push(this.row(piece, index, language, cells));
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
    const cells = columns.map((column) => bestCell(column.platform, adaptations));
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
    const round = this.roundOf(plan.request);
    if (
      !answers.length &&
      plan.request?.skipInterview !== true &&
      round <= PIECE_MAX_INTERVIEW_ROUNDS
    ) {
      const questions = questionsForChannel(
        plan.channel.profile,
        plan.channel.providerIdentifier,
        plan.core,
        language
      ).filter((question) => !this.decided(plan.request, question));
      if (questions.length) {
        yield { name: 'questions', questions, round };
        return;
      }
    }

    const hints = this.hintsOf(plan, answers);
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
    } as GeneratorRunInput;

    let output: any = null;
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

    const checks = {
      antiCopy: output.antiCopy ?? null,
      slop:
        plan.request?.options?.slopCheck === true && this.slopCheck
          ? this.slopCheck(
              plain,
              plan.channel.providerIdentifier,
              plan.language
            )
          : null,
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
        name: provider,
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
  private roundOf(request: PieceAdaptRequestV1): number {
    const answered =
      (request?.answers || []).length > 0 ||
      (request?.decideKeys || []).length > 0;
    return answered ? 2 : 1;
  }

  /** Подсказки генератору: канал, бриф заготовки, суть и ответы под канал. */
  private hintsOf(
    plan: PieceAdaptPlanV1,
    answers: PieceAnswerV1[]
  ): IntakeGenerationHintsV1 {
    const brief = plan.core?.brief;
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
