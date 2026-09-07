/**
 * Вход одной мыслью: от вставленного текста до черновика в каждом канале.
 *
 * `content-factory-next-tu3k` (P1), решения владельца 06.09.2026. Владелец
 * остановился на вкладке «Бриф» — восемь полей и отдельная форма факта — со
 * словами «слишком сложно» для ежедневного «появилась мысль или скопировал
 * чужой пост → хочу свой пост». Здесь и живёт ответ: человек даёт одно поле и
 * выбирает каналы, бриф заполняет модель, вопросов не больше двух и только про
 * тезис и факты, черновик появляется сразу.
 *
 * Что этот файл решает, а что нет:
 *
 * - он **не пишет текст**. Пишет `AgentGraphService`, тот же самый, что и
 *   кнопка «Generate Posts»: вторая генерация была бы вторым местом, где
 *   живут голос, контекст и метки цитат;
 * - он **не заводит второй способ создать пост**. Черновик сохраняется через
 *   `ContentBriefRepository.createDraft`, то есть через `PostsRepository`, в
 *   состоянии `DRAFT`, и ничего никуда не публикует;
 * - он **не меняет ворота брифа**. `evaluateBrief` вызывается как есть; ново
 *   здесь только то, кто заполняет поля и о чём спрашивают человека.
 *
 * Цена одного входа названа числом и держится этим файлом: не больше двух
 * вызовов модели своей операцией `intake` (разбор чужого текста и заполнение
 * брифа), не больше трёх поисков (проверка чисел) и не больше трёх генераций
 * (по каналу). Поиск и генерация учитываются своими операциями и здесь второй
 * раз не считаются.
 *
 * Чужой текст. Он входит в промпт ровно один раз — в огороженный блок разбора,
 * одной строкой (`intake.prompts.ts`), и дальше не идёт никуда: ни в
 * `generator.start`, ни в подсказки, ни в черновик. Дальше едут тема, угол,
 * строение и отрезки по восемь слов, по которым проверяют, что дословного
 * заимствования не случилось.
 *
 * Порядок параметров конструктора — часть договора: наборы и стенд собирают
 * сервис руками и передают сотрудников по местам. Новый параметр добавляется
 * только в конец и только необязательным.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentGraphService } from '@contentfactory/nestjs-libraries/agent/agent.graph.service';
import type {
  GeneratorRunInput,
  IntakeGenerationHintsV1,
} from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import { slopCheck as runSlopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
import { INTAKE_HINTS_VERSION } from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import {
  WebResearchService,
  WebSearchNotConfigured,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import type { WebResearchResult } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import {
  WEB_SEARCH_MAX_SOURCE_CHARS,
  getChatModel,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { ContentSourceRegistryService } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service';
import { SourceFetchGateway } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway';
import { parseSourcePayload } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-parser';
import type { ParsedSourcePayload } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-parser';
import {
  assertDomainAllowed,
  assertRobotsAllowed,
  parseDeniedDomains,
  robotsUrlFor,
} from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';
import { CONTENT_CONTEXT_MAX_EVIDENCE_V1 } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { evaluateBrief } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import type {
  Brief,
  BriefField,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import type {
  BriefFieldOriginV1,
  BriefFilledFactV1,
  BriefFilledV1,
  IntakeClaimV1,
  IntakeEventV1,
  IntakeFormatV1,
  IntakeInputKindV1,
  IntakeQuestionV1,
  IntakeEventWithPieceV1,
  PieceAnswerInputV1,
  PieceAnswerV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  INTAKE_INPUT_MIN_CHARS,
  INTAKE_MAX_CHANNELS,
  INTAKE_MAX_QUESTIONS,
  INTAKE_MAX_VERIFIED_CLAIMS,
  PIECE_MAX_INTERVIEW_ROUNDS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  CORE_QUESTION_FIELDS,
  coreQuestionText,
  coreQuestionsFor,
} from '../pieces/core-questions';
import { writeCore, type CoreBorrowedV1 } from '../pieces/core-write';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { ContentBriefRepository } from '../brief/content-brief.repository';
import { briefTitle } from '../brief/content-brief.compose';
import { editorHtml } from '../brief/editor-html';
import {
  kindsOfProvider,
  materialFormat,
} from '../materials/material-presentation';
import {
  INTAKE_LINK_UNREACHABLE_MESSAGES,
  IntakeError,
  intakeError,
} from './intake.errors';
import { detectInputKind, singleLinkOf, wordShingles } from './intake-kind';
import { claimMatchesExcerpt } from './claim-match';
import {
  briefFillPrompt,
  briefFillSchema,
  extractionPrompt,
  extractionSchema,
  oneLine,
} from './intake.prompts';
import type { IntakeExtractionV1 } from './intake.prompts';

/** Факт, у которого отняли опору, фактом уже не является. */
const UNUSABLE_FACT_STATUSES = ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'];

const BRIEF_FORMATS: IntakeFormatV1[] = [
  'auto',
  'opinion',
  'announcement',
  'list',
  'expert',
  'case',
  'story',
];

const ORIGINS: BriefFieldOriginV1[] = [
  'input',
  'person',
  'avatar',
  'memory',
  'search',
  'model',
];

/** Поля, которые модель предлагает сама, а человек правит. */
const PROPOSED_FIELDS: BriefField[] = ['position', 'disagreement', 'audience'];

/** Сколько знаков портрета аватара доходит до промпта. */
const PORTRAIT_MAX_CHARS = 700;

/** Сколько фактов памяти показывается модели. */
const MEMORY_FACTS_LIMIT = 8;

/** Потолок разбора чужого текста в знаках — тот же, что у выдержки поиска. */
const BORROWED_TEXT_LIMIT = WEB_SEARCH_MAX_SOURCE_CHARS;

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const textOrNull = (value: unknown): string | null => trimmed(value) || null;

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export type IntakeChannelV1 = {
  id: string;
  name: string;
  providerIdentifier: string;
  contentLanguage: string | null;
  /**
   * Карточка «Как пишем сюда». Читается защитно: колонку `Integration.
   * writingProfile` привозит поток S2 этой же волны, и до его слияния её в
   * модели просто нет. Отсутствие карточки — это умолчания провайдера, а не
   * поломка.
   */
  writingProfile: any | null;
  maxLength: number;
  maxCaptionLength: number | null;
  editor: 'none' | 'normal' | 'markdown' | 'html';
};

export type IntakePlanV1 = {
  input: string;
  inputKind: IntakeInputKindV1;
  language: ContentLanguage;
  /**
   * Каналы, в которые пишутся адаптации. Пустой список — законный ход
   * (`content-factory-next-tu3k.9`): человек делает заготовку и решает потом,
   * во что её превратить.
   */
  channels: IntakeChannelV1[];
  answers: Array<{ field: BriefField; text: string }>;
  decide: BriefField[];
  /** Ответы интервью заготовки, дословно, как их дал человек. */
  interview: PieceAnswerInputV1[];
  /** Ключи вопросов заготовки, отданные модели («Реши сама»). */
  decideKeys: PieceQuestionKeyV1[];
  /** Интервью пропущено одной кнопкой: модель решает всё сама. */
  skipInterview: boolean;
  briefOverrides: Record<string, string>;
  options: {
    searchEnrichment: boolean;
    slopCheck: boolean;
    isPicture: boolean;
  };
  brandProfileSelection?: { mode: 'active' | 'version' | 'none'; versionId?: string };
  sourceLeadId?: string;
};

/** Доказательство, принятое за этот вход: адрес, заголовок, выдержка. */
type AcceptedEvidence = {
  evidenceId: string;
  url: string;
  title: string | null;
  excerpt: string;
};

/** Шов под проверку на ИИ-штампы: по умолчанию — `text-quality/slop-check` (поток S3), в тестах подменяется. */
export type SlopCheckPort = (
  text: string,
  platform: string,
  locale: ContentLanguage
) => SlopReportV1 | null;

const defaultSlopCheck: SlopCheckPort = (text, platform, locale) =>
  runSlopCheck(text, { platform, locale, html: false });

type FilledBrief = {
  brief: BriefFilledV1;
  /** Поля, которые модель честно оставила пустыми, и её варианты для них. */
  options: Partial<Record<BriefField, string[]>>;
  modelReturnedNull: Partial<Record<BriefField, boolean>>;
  factIds: string[];
  evidenceIds: string[];
  /**
   * О чём стоит поискать опору, если её не нашлось ни одной. `null` — искать
   * нечего или незачем; поиск делает `run`, объявив о нём событием.
   */
  pendingSearch: string | null;
};

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);
  private readonly now: () => Date;
  private readonly parse: typeof parseSourcePayload;
  private readonly slopCheck: SlopCheckPort | null;
  private readonly deniedDomains: string[];

  constructor(
    private readonly generator: AgentGraphService,
    private readonly research: WebResearchService,
    private readonly sources: ContentSourceRegistryService,
    private readonly gateway: SourceFetchGateway,
    private readonly facts: ContentFactService,
    private readonly brandProfiles: BrandProfileContextService,
    private readonly briefRepository: ContentBriefRepository,
    private readonly integrations: IntegrationService,
    @Inject(IntegrationManager)
    private readonly integrationManager: IntegrationManager,
    private readonly aiUsage: AiUsageService,
    @Optional() now: () => Date = () => new Date(),
    /** Тот же разбор страницы, что и у реестра источников. */
    @Optional() parse: typeof parseSourcePayload = parseSourcePayload,
    /**
     * Проверка на ИИ-штампы. Необязательна и последняя: её привозит поток S3
     * волны, а до его слияния вход обязан работать без неё —
     * `checks.slop` тогда просто `null`.
     */
    @Optional() slopCheck: SlopCheckPort | null = null
  ) {
    this.now = now || (() => new Date());
    this.parse = parse || parseSourcePayload;
    this.slopCheck = slopCheck || defaultSlopCheck;
    this.deniedDomains = parseDeniedDomains(process.env.SOURCE_DENIED_DOMAINS);
  }

  /* -----------------------------------------------------------------------
   * Отказы до первого байта
   * -------------------------------------------------------------------- */

  /**
   * Всё, что можно отклонить обычным HTTP, отклоняется здесь.
   *
   * Граница между этим методом и `run` — это граница между «ответ ещё не
   * начался» и «ответ уже идёт». После первого байта код ответа не изменить, и
   * отказ становится последней строкой стрима, которую экран обязан уметь
   * прочитать. Чем меньше таких строк, тем лучше, поэтому сюда собрано всё
   * решаемое заранее: длина, число каналов, их существование и то, умеет ли
   * продукт писать в такой канал вообще.
   */
  async prepare(
    organizationId: string,
    body: Record<string, any>
  ): Promise<IntakePlanV1> {
    const language: ContentLanguage = body?.language === 'en' ? 'en' : 'ru';
    const input = trimmed(body?.input);
    if (input.length < INTAKE_INPUT_MIN_CHARS) {
      throw intakeError('INTAKE_INPUT_TOO_SHORT', language);
    }

    const wanted = [
      ...new Set(
        (Array.isArray(body?.integrationIds) ? body.integrationIds : [])
          .map((id: unknown) => trimmed(id))
          .filter(Boolean)
      ),
    ] as string[];
    /*
      Пустого списка каналов эта дверь больше не отвергает
      (`content-factory-next-tu3k.9`, решение владельца 06.09.2026). Раньше
      «вход одной мыслью» существовал только ради черновика, и просьба без
      канала была бессмысленной; теперь его результат — заготовка, а канал
      выбирают потом. `INTAKE_CHANNEL_REQUIRED` из контракта не исчез: он
      остался у двери адаптации как `PIECE_CHANNEL_REQUIRED`, где отсутствие
      канала действительно означает «нечего адаптировать во что».
    */
    if (wanted.length > INTAKE_MAX_CHANNELS) {
      throw intakeError('INTAKE_TOO_MANY_CHANNELS', language);
    }

    const owned = wanted.length
      ? await this.integrations.getIntegrationsList(organizationId)
      : [];
    const channels: IntakeChannelV1[] = [];
    for (const id of wanted) {
      const integration = (owned || []).find(
        (candidate: any) =>
          candidate?.id === id && !candidate?.disabled && !candidate?.deletedAt
      );
      if (!integration) {
        throw intakeError('INTAKE_CHANNEL_UNKNOWN', language, id);
      }
      const provider = this.integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
      if (!provider) {
        throw intakeError(
          'INTAKE_CHANNEL_UNSUPPORTED',
          language,
          integration.providerIdentifier
        );
      }
      channels.push({
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        contentLanguage: integration.contentLanguage ?? null,
        // Защитно: колонку привозит поток S2 этой же волны.
        writingProfile: (integration as any).writingProfile ?? null,
        maxLength: this.providerMaxLength(provider, integration),
        maxCaptionLength: provider.maxCaptionLength?.() ?? null,
        editor: provider.editor,
      });
    }

    const overrides: Record<string, string> = {};
    for (const [field, value] of Object.entries(body?.briefOverrides || {})) {
      const text = trimmed(value);
      if (text) overrides[field] = text;
    }

    return {
      input,
      // Слово клиента сильнее: ссылку он узнаёт сам и уже подписал ею поле, а
      // разошедшиеся половины одного правила — худшее из двух зол.
      inputKind: this.knownKind(body?.inputKind) ?? detectInputKind(input),
      language,
      channels,
      answers: (Array.isArray(body?.answers) ? body.answers : [])
        .map((answer: any) => ({
          field: answer?.field as BriefField,
          text: trimmed(answer?.text),
        }))
        .filter((answer: any) => answer.field && answer.text),
      decide: (Array.isArray(body?.decide) ? body.decide : []).filter(
        (field: unknown): field is BriefField => typeof field === 'string'
      ),
      // Ответы интервью берутся как есть: опечатки и шероховатости и есть
      // материал, и приглаживать их здесь значило бы стереть ровно то, ради
      // чего продукт спрашивал.
      interview: (Array.isArray(body?.interview) ? body.interview : [])
        .map(
          (answer: any): PieceAnswerInputV1 => ({
            key: answer?.key as PieceQuestionKeyV1,
            text: typeof answer?.text === 'string' ? answer.text : '',
            origin: answer?.origin === 'confirmed' ? 'confirmed' : 'person',
          })
        )
        .filter((answer: PieceAnswerInputV1) => answer.key && answer.text.trim()),
      decideKeys: (Array.isArray(body?.decideKeys) ? body.decideKeys : []).filter(
        (key: unknown): key is PieceQuestionKeyV1 => typeof key === 'string'
      ),
      skipInterview: body?.skipInterview === true,
      briefOverrides: overrides,
      options: {
        searchEnrichment: body?.options?.searchEnrichment !== false,
        slopCheck: body?.options?.slopCheck === true,
        isPicture: body?.options?.isPicture === true,
      },
      brandProfileSelection: body?.brandProfileSelection,
      sourceLeadId: trimmed(body?.sourceLeadId) || undefined,
    };
  }

  private knownKind(value: unknown): IntakeInputKindV1 | null {
    return value === 'thought' || value === 'link' || value === 'foreign_post'
      ? value
      : null;
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
   * Ход
   * -------------------------------------------------------------------- */

  async *run(
    organizationId: string,
    plan: IntakePlanV1,
    actorUserId?: string
  ): AsyncGenerator<IntakeEventWithPieceV1> {
    const language = plan.language;
    yield {
      name: 'intake-started',
      inputKind: plan.inputKind,
      channels: plan.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        providerIdentifier: channel.providerIdentifier,
      })),
    };

    const evidence = new Map<string, AcceptedEvidence>();
    let borrowedText: string | null = null;

    if (plan.inputKind === 'link') {
      const url = singleLinkOf(plan.input);
      let accepted: AcceptedEvidence;
      try {
        accepted = await this.readLink(organizationId, url || plan.input);
      } catch (error) {
        this.logger.warn(
          `Intake could not read the pasted link: ${describeError(error)}`
        );
        yield {
          name: 'error',
          error: true,
          code: 'INTAKE_LINK_UNREACHABLE',
          message: INTAKE_LINK_UNREACHABLE_MESSAGES[language],
        };
        return;
      }
      evidence.set(accepted.evidenceId, accepted);
      yield {
        name: 'link-fetched',
        url: accepted.url,
        title: accepted.title,
        evidenceId: accepted.evidenceId,
      };
      // Прочитанная страница дальше живёт как чужой пост: своих слов у
      // человека здесь нет, есть чужой текст и желание написать свой.
      borrowedText = accepted.excerpt;
    } else if (plan.inputKind === 'foreign_post') {
      borrowedText = plan.input.slice(0, BORROWED_TEXT_LIMIT);
    }

    let extraction: IntakeExtractionV1 | null = null;
    let foreignShingles: string[] = [];
    if (borrowedText) {
      extraction = await this.extract(organizationId, borrowedText, language);
      const checkable = this.claimsToCheck(extraction, plan);
      if (checkable.length) {
        // Экран молчал те несколько секунд, что идёт проверка чисел, и человек
        // читал молчание как зависание (`content-factory-next-tu3k.7`).
        yield { name: 'search-started', reason: 'claims', count: checkable.length };
      }
      const claims = await this.checkClaims(
        organizationId,
        extraction,
        plan,
        evidence,
        checkable
      );
      yield { name: 'claims', claims };
      foreignShingles = wordShingles(borrowedText);
    }

    let filled = await this.fillBrief(
      organizationId,
      plan,
      extraction,
      evidence
    );
    if (filled.pendingSearch) {
      yield { name: 'search-started', reason: 'facts', count: 1 };
      filled = await this.addSearchedFacts(
        organizationId,
        plan,
        filled,
        evidence
      );
    }
    yield { name: 'brief-filled', brief: filled.brief };

    // Ворота брифа первые и главные: без тезиса или факта дальше не идут
    // вовсе. Интервью заготовки — уже поверх годного брифа, и оба вопроса
    // терминальны, поэтому больше трёх за шаг не бывает никогда.
    const questions = this.questionsFor(filled, plan);
    if (questions.length) {
      yield { name: 'questions', questions };
      return;
    }
    const interview = this.interviewFor(filled, plan);
    if (interview.length) {
      yield {
        name: 'piece-questions',
        questions: interview,
        round: this.interviewRound(plan),
      };
      return;
    }

    /*
      Суть — один раз, до цикла по каналам. Это и есть волна «заготовка и
      адаптации»: три канала дают ОДНУ заготовку и три адаптации, а не три
      материала с HTML одного канала в теле.

      Единственный случай, когда её не пишут, — ход, у которого нет ни автора,
      ни канала: записать заготовку не под кого, генерировать нечего, и платный
      вызов ушёл бы в никуда.
    */
    if (!actorUserId && !plan.channels.length) {
      yield { name: 'done', postIds: [] };
      return;
    }
    const answers = this.interviewAnswers(plan);
    const core = await writeCore(
      {
        organizationId,
        language,
        brief: filled.brief,
        answers,
        questionTextByKey: Object.fromEntries(
          answers.map((answer) => [
            answer.key,
            coreQuestionText(answer.key, language),
          ])
        ),
        // Чужой текст в суть не идёт ни одним полем: для вставленного поста
        // словами человека не располагаем вовсе, и блок остаётся пустым.
        personText: extraction ? '' : plan.input,
        borrowed: extraction ? this.borrowedForCore(extraction) : null,
        foreignShingles,
      },
      {
        aiUsage: this.aiUsage,
        slopCheck: this.slopCheck,
        warn: (message) => this.logger.warn(message),
      }
    );

    const piece = actorUserId
      ? await this.briefRepository.recordCore(organizationId, {
          title: briefTitle(this.gateBrief(filled.brief), plan.language),
          body: core.text,
          brief: this.storedCore(core),
          language: plan.language,
          createdByUserId: actorUserId,
        })
      : null;
    const pieceId = piece?.id ?? null;
    if (piece) {
      yield { name: 'piece', pieceId: piece.id, code: piece.code, core };
    }

    const postIds: string[] = [];
    for (const channel of plan.channels) {
      yield { name: 'channel-started', integrationId: channel.id };
      const outcome = yield* this.writeChannel(
        organizationId,
        plan,
        channel,
        filled,
        extraction,
        foreignShingles,
        core,
        pieceId
      );
      if (outcome) postIds.push(outcome);
    }

    yield { name: 'done', postIds };
  }

  /** `ZagotovkaCoreV1` без `text`: текст живёт в колонке `body`. */
  private storedCore(core: ZagotovkaCoreV1): Record<string, unknown> {
    const { text, ...stored } = core;
    void text;
    return stored;
  }

  /** Взятое из чужого текста — для промпта сути. Сам текст сюда не кладётся. */
  private borrowedForCore(extraction: IntakeExtractionV1): CoreBorrowedV1 {
    return {
      topic: trimmed(extraction.topic),
      angle: trimmed(extraction.angle),
      structure: (extraction.structure || []).slice(0, 8).map(trimmed),
      claims: (extraction.claims || [])
        .slice(0, 12)
        .map((claim) => trimmed(claim?.text))
        .filter(Boolean),
    };
  }

  /* -----------------------------------------------------------------------
   * Ссылка
   * -------------------------------------------------------------------- */

  /**
   * Страница по ссылке, прочитанная один раз и замороженная как доказательство.
   *
   * Тем же путём, что и `ContentSourceRegistryService.validateSource`: тот же
   * шлюз с закреплением адреса, та же проверка запрещённых доменов, тот же
   * `robots.txt` и тот же разбор. Своего пути к сети у входа нет и быть не
   * должно — вторая дверь в веб означала бы вторую политику доступа.
   *
   * Выключатель `SOURCE_DIRECT_FETCH` соблюдается. Он выражает решение
   * установки «этот сервер не ходит по произвольным адресам», и обходить его
   * ради удобства значило бы снять единственный рычаг, которым это решение
   * выражено. Когда он выключен, человек слышит понятное «вставьте текст
   * поста прямо в поле», а не тишину.
   */
  private async readLink(
    organizationId: string,
    rawUrl: string
  ): Promise<AcceptedEvidence> {
    if (process.env.SOURCE_DIRECT_FETCH !== 'true') {
      throw new Error('Direct source fetching is disabled for this deployment');
    }
    const check = (url: string) => assertDomainAllowed(url, this.deniedDomains);
    check(rawUrl);
    const robots = await this.gateway.fetch(
      robotsUrlFor(rawUrl),
      'ROBOTS' as any,
      {},
      check
    );
    assertRobotsAllowed(robots.body, rawUrl);

    const fetched = await this.gateway.fetch(rawUrl, 'URL', {}, check);
    const parsed: ParsedSourcePayload = this.parse('URL', fetched.body, {
      contentType: fetched.contentType || 'text/html',
      charset: fetched.charset,
    });
    const excerpt = this.cutAtParagraph(parsed.text, BORROWED_TEXT_LIMIT);
    if (!excerpt) throw new Error('The page carries no readable text');

    const accepted = await this.sources.acceptSearchResult(
      organizationId,
      {
        url: fetched.finalUrl || rawUrl,
        title: parsed.title ?? null,
        excerpt,
        // Дата публикации со страницы не берётся: разбор угадывает её по
        // разметке, а неверная дата у доказательства хуже отсутствующей.
        publishedAt: null,
        provider: 'user_link',
      },
      { reuseBy: 'url' }
    );
    return {
      evidenceId: accepted.evidenceId,
      url: accepted.url,
      title: accepted.title,
      excerpt: accepted.excerpt,
    };
  }

  /** Обрезка по границе абзаца: обрубленное на полуслове читается как сбой. */
  private cutAtParagraph(value: string, maximum: number): string {
    const text = (value || '').trim();
    if (text.length <= maximum) return text;
    const cut = text.slice(0, maximum);
    const boundary = cut.lastIndexOf('\n\n');
    return (boundary > maximum / 2 ? cut.slice(0, boundary) : cut).trim();
  }

  /* -----------------------------------------------------------------------
   * Разбор чужого текста и проверка чисел
   * -------------------------------------------------------------------- */

  private async extract(
    organizationId: string,
    text: string,
    language: ContentLanguage
  ): Promise<IntakeExtractionV1> {
    return this.aiUsage.executeAiOperation(
      organizationId,
      'intake',
      async () => {
        const model = (
          await getChatModel(organizationId, 0, 2_048, 'extract')
        ).withStructuredOutput(extractionSchema);
        return (await model.invoke(
          extractionPrompt(text, language)
        )) as IntakeExtractionV1;
      },
      'extract'
    );
  }

  /**
   * Числа из чужого поста проверяются поиском, и только они входят в текст.
   *
   * Решение владельца: «числа берутся только после проверки поиском,
   * непроверенные в текст не идут и показаны как „не подтверждено“». Три
   * проверки на вход — предел, названный в плане: каждая стоит поиска, а
   * четвёртое число редко решает судьбу поста.
   *
   * Три статуса, и разница между двумя из них важна. `verified` — число нашлось
   * на странице, которую теперь можно процитировать. `unverified` — искали и не
   * нашли. `skipped` — не искали вовсе: у утверждения нет числа, поиск выключен
   * человеком или не настроен в области. Выключенный поиск — это настройка, а
   * не поломка, и `WebSearchNotConfigured` здесь никого не роняет.
   */
  /** Утверждения разбора, как их читает и проверка, и событие о ней. */
  private claimsOf(extraction: IntakeExtractionV1) {
    return (extraction.claims || []).slice(0, 12).map((claim) => ({
      text: trimmed(claim?.text),
      hasNumber: Boolean(claim?.hasNumber),
      searchQuery: textOrNull(claim?.searchQuery),
    }));
  }

  /**
   * Какие числа уйдут в поиск. Считается до самого поиска, потому что об этом
   * говорит событие `search-started`, а обещать число проверок после того, как
   * они прошли, поздно.
   */
  private claimsToCheck(extraction: IntakeExtractionV1, plan: IntakePlanV1) {
    if (!plan.options.searchEnrichment) return [];
    return this.claimsOf(extraction)
      .filter((claim) => claim.hasNumber && claim.text)
      .slice(0, INTAKE_MAX_VERIFIED_CLAIMS);
  }

  private async checkClaims(
    organizationId: string,
    extraction: IntakeExtractionV1,
    plan: IntakePlanV1,
    evidence: Map<string, AcceptedEvidence>,
    checkable: ReturnType<IntakeService['claimsToCheck']>
  ): Promise<IntakeClaimV1[]> {
    const claims = this.claimsOf(extraction);

    const results = await Promise.allSettled(
      checkable.map((claim) =>
        this.research.research(
          organizationId,
          claim.searchQuery || claim.text,
          { language: plan.language }
        )
      )
    );

    const answered = new Map<string, IntakeClaimV1>();
    for (let index = 0; index < checkable.length; index += 1) {
      const claim = checkable[index];
      const settled = results[index];
      if (settled.status === 'rejected') {
        if (!(settled.reason instanceof WebSearchNotConfigured)) {
          this.logger.warn(
            `A claim could not be checked against the web: ${describeError(
              settled.reason
            )}`
          );
        }
        // Поиск не ответил — это «не проверяли», а не «проверили и не нашли».
        answered.set(claim.text, {
          text: claim.text,
          hasNumber: true,
          status: 'skipped',
          evidenceId: null,
          sourceUrl: null,
        });
        continue;
      }
      const accepted = await this.keepMatch(
        organizationId,
        claim.text,
        settled.value,
        evidence
      );
      answered.set(claim.text, {
        text: claim.text,
        hasNumber: true,
        status: accepted ? 'verified' : 'unverified',
        evidenceId: accepted?.evidenceId ?? null,
        sourceUrl: accepted?.url ?? null,
      });
    }

    return claims.map(
      (claim) =>
        answered.get(claim.text) || {
          text: claim.text,
          hasNumber: claim.hasNumber,
          // Числа не было — проверять нечего; было, но до тройки не попало
          // или поиск выключен — не проверяли. Оба случая «не проверяли».
          status: 'skipped',
          evidenceId: null,
          sourceUrl: null,
        }
    );
  }

  /** Первая находка, в выдержке которой стоит то же число, — и она же память. */
  private async keepMatch(
    organizationId: string,
    claim: string,
    answer: WebResearchResult,
    evidence: Map<string, AcceptedEvidence>
  ): Promise<AcceptedEvidence | null> {
    const sourceByUrl = new Map(
      (answer.sources || []).map((source) => [source.url, source])
    );
    for (const fact of answer.facts || []) {
      if (!claimMatchesExcerpt(claim, fact.text)) continue;
      const source = sourceByUrl.get(fact.sourceUrl);
      try {
        const accepted = await this.sources.acceptSearchResult(
          organizationId,
          {
            url: fact.sourceUrl,
            title: source?.title ?? null,
            excerpt: fact.text,
            publishedAt: source?.publishedAt ?? null,
            provider: source?.provider ?? answer.provider,
          },
          { reuseBy: 'url' }
        );
        const kept: AcceptedEvidence = {
          evidenceId: accepted.evidenceId,
          url: accepted.url,
          title: accepted.title,
          excerpt: accepted.excerpt,
        };
        evidence.set(kept.evidenceId, kept);
        return kept;
      } catch (error) {
        this.logger.warn(
          `A confirming page could not be kept as evidence: ${describeError(
            error
          )}`
        );
        return null;
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * Заполнение брифа
   * -------------------------------------------------------------------- */

  private async fillBrief(
    organizationId: string,
    plan: IntakePlanV1,
    extraction: IntakeExtractionV1 | null,
    evidence: Map<string, AcceptedEvidence>
  ): Promise<FilledBrief> {
    const person = this.personFields(plan);
    const avatar = await this.avatarOf(organizationId, plan);
    const memory = await this.rememberedFacts(organizationId, plan, extraction);

    const material = extraction
      ? this.borrowedSummary(extraction)
      : plan.input;

    const answer = await this.aiUsage.executeAiOperation(
      organizationId,
      'intake',
      async () => {
        const model = (
          await getChatModel(organizationId, 0, 2_048, 'extract')
        ).withStructuredOutput(briefFillSchema);
        return await model.invoke(
          briefFillPrompt({
            language: plan.language,
            material,
            materialKind: extraction ? 'borrowed' : 'thought',
            fixed: Object.entries(person).map(([field, text]) => ({
              field,
              text,
            })),
            avatar: avatar.lines,
            channel: this.channelLines(plan.channels[0]),
            facts: memory.map((fact) => `[F:${fact.id}] ${oneLine(fact.statement)}`),
            evidence: [...evidence.values()].map(
              (item) =>
                `[E:${item.evidenceId}] ${oneLine(item.title || item.url)} — ${oneLine(
                  item.excerpt
                ).slice(0, 400)}`
            ),
          })
        );
      },
      'extract'
    );

    return this.settleBrief({
      plan,
      answer: answer as any,
      person,
      avatar,
      memory,
      evidence,
      extraction,
      organizationId,
    });
  }

  /**
   * Слово человека сильнее ответа модели, и это не спор о качестве.
   *
   * Человек ответил на вопрос или поправил квитанцию — значит про это поле
   * решение уже принято, и второй раз его не спрашивают и не переписывают.
   */
  private personFields(plan: IntakePlanV1): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const [field, text] of Object.entries(plan.briefOverrides)) {
      if (text) fields[field] = text;
    }
    for (const answer of plan.answers) {
      if (answer.text) fields[answer.field] = answer.text;
    }
    // Ответ интервью — такое же слово человека, как ответ на вопрос ворот, и
    // ложится в то же поле брифа с тем же происхождением `person`. Дословно:
    // ни `trim` внутри, ни заглавной буквы в начале.
    for (const answer of plan.interview) {
      const field = CORE_QUESTION_FIELDS[answer.key];
      if (field && answer.text.trim()) fields[field] = answer.text;
    }
    return fields;
  }

  /* -----------------------------------------------------------------------
   * Интервью заготовки
   * -------------------------------------------------------------------- */

  /** Ответы интервью, дословно, с происхождением и шагом. */
  private interviewAnswers(plan: IntakePlanV1): PieceAnswerV1[] {
    const answeredAt = this.now().toISOString();
    return plan.interview.map((answer) => ({
      key: answer.key,
      text: answer.text,
      origin: answer.origin,
      step: 'core' as const,
      answeredAt,
    }));
  }

  /** Который это круг уточнений: ответы в запросе означают, что круг был. */
  private interviewRound(plan: IntakePlanV1): number {
    return plan.interview.length || plan.decideKeys.length ? 2 : 1;
  }

  /**
   * Три вопроса заготовки — и молчание, когда спрашивать больше нельзя.
   *
   * Исчерпав `PIECE_MAX_INTERVIEW_ROUNDS`, продукт не отказывает
   * (`PIECE_INTERVIEW_EXHAUSTED` остаётся дверям Z3 на случай, когда клиент
   * сам просит третий круг), а решает сам: человек уже дважды ответил, и взять
   * ответы, не дав текста, — худшее, что можно сделать после этого.
   */
  private interviewFor(
    filled: FilledBrief,
    plan: IntakePlanV1
  ): PieceQuestionV1[] {
    if (plan.skipInterview) return [];
    if (this.interviewRound(plan) > PIECE_MAX_INTERVIEW_ROUNDS) return [];
    return coreQuestionsFor({
      brief: filled.brief,
      options: filled.options,
      language: plan.language,
      answeredKeys: plan.interview.map((answer) => answer.key),
      decideKeys: plan.decideKeys,
    });
  }

  /** Портрет, аудитории и запреты аватара — строками для промпта. */
  private async avatarOf(
    organizationId: string,
    plan: IntakePlanV1
  ): Promise<{ lines: string[]; audience: string | null }> {
    try {
      const resolved = await this.brandProfiles.resolve(
        organizationId,
        (plan.brandProfileSelection as any) || { mode: 'active' },
        plan.channels[0]?.providerIdentifier
      );
      const voice = (resolved as any)?.effectiveVoice;
      if (!voice) return { lines: [], audience: null };
      const lines: string[] = [];
      const portrait = trimmed(voice.persona?.portrait);
      if (portrait) {
        lines.push(`- ${oneLine(portrait).slice(0, PORTRAIT_MAX_CHARS)}`);
      }
      const audiences = (voice.project?.audiences || [])
        .map((item: any) =>
          [trimmed(item?.name), trimmed(item?.need)].filter(Boolean).join(' — ')
        )
        .filter(Boolean);
      for (const audience of audiences.slice(0, 3)) {
        lines.push(`- reader: ${oneLine(audience)}`);
      }
      for (const claim of (voice.guardrails?.prohibitedClaims || []).slice(0, 5)) {
        const text = trimmed(claim);
        if (text) lines.push(`- never claim: ${oneLine(text)}`);
      }
      return { lines, audience: audiences[0] || null };
    } catch (error) {
      // Аватар улучшает бриф и не разрешает его: неудача чтения означает
      // «пишем нейтрально», а не отказ человеку в черновике.
      this.logger.warn(
        `Intake filled a brief without the workspace avatar: ${describeError(
          error
        )}`
      );
      return { lines: [], audience: null };
    }
  }

  /**
   * Факты области, отобранные по совпадению слов со входом.
   *
   * Отбор местный, а не запросом. `listFacts(orgId, q)` соединяет слова через
   * И — каждое слово обязано встретиться, — и дюжина слов входа не нашла бы ни
   * одной строки. Каталог области берётся целиком (его потолок — сто строк) и
   * ранжируется здесь тем же способом, каким это делает радар тем.
   */
  private async rememberedFacts(
    organizationId: string,
    plan: IntakePlanV1,
    extraction: IntakeExtractionV1 | null
  ): Promise<Array<{ id: string; statement: string }>> {
    let catalogue: any[] = [];
    try {
      catalogue = (await this.facts.listFacts(organizationId)) as any[];
    } catch (error) {
      this.logger.warn(
        `Intake filled a brief without workspace memory: ${describeError(error)}`
      );
      return [];
    }
    const subject = [
      plan.input,
      extraction?.topic || '',
      extraction?.angle || '',
    ].join(' ');
    const wanted = new Set(this.tokens(subject));
    return catalogue
      .filter((fact) => !UNUSABLE_FACT_STATUSES.includes(fact?.status))
      .map((fact) => ({
        id: String(fact.id),
        statement: trimmed(fact.statement),
        score: this.tokens(fact.statement).filter((token) => wanted.has(token))
          .length,
      }))
      .filter((fact) => fact.statement)
      .sort((left, right) => right.score - left.score)
      .slice(0, MEMORY_FACTS_LIMIT)
      .map(({ id, statement }) => ({ id, statement }));
  }

  private tokens(value: unknown): string[] {
    return trimmed(value)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 3);
  }

  /** Взятое из чужого текста: тема, угол, строение и судьба каждого числа. */
  private borrowedSummary(extraction: IntakeExtractionV1): string {
    return [
      `Topic: ${oneLine(extraction.topic || '')}`,
      `Angle: ${oneLine(extraction.angle || '')}`,
      ...(extraction.structure || [])
        .slice(0, 8)
        .map((step, index) => `Structure ${index + 1}: ${oneLine(step)}`),
      ...(extraction.claims || [])
        .slice(0, 12)
        .map((claim) => `Claim: ${oneLine(claim?.text || '')}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Карточка канала «Как пишем сюда», строками.
   *
   * Читается защитно и с умолчаниями: настоящую карточку и её разбор привозит
   * поток S2 волны, а до того канал описывается тем, что известно и так, —
   * пределом провайдера и телеграм-умолчаниями из исследования владельца
   * (обычный пост 500–1000 знаков, немного эмодзи, один призыв вопросом).
   */
  private channelLines(channel?: IntakeChannelV1): string[] {
    if (!channel) return [];
    const profile = channel.writingProfile;
    const lines: string[] = [`- hard limit: ${channel.maxLength} characters`];
    const policy = profile?.lengthPolicy;
    if (policy && typeof policy === 'object' && policy.idealMin) {
      lines.push(`- usual length: ${policy.idealMin}–${policy.idealMax} characters`);
    } else if (channel.providerIdentifier === 'telegram') {
      lines.push('- usual length: 500–1000 characters');
    }
    if (profile?.emojiLevel === 'none') lines.push('- no emoji');
    else if (profile?.emojiLevel === 'few' || (!profile && channel.providerIdentifier === 'telegram')) {
      lines.push('- a few emoji, at most two kinds, never as list markers');
    }
    if (profile?.ctaKind && profile.ctaKind !== 'none') {
      lines.push(`- one call to action, of the kind: ${profile.ctaKind}`);
    } else if (!profile && channel.providerIdentifier === 'telegram') {
      lines.push('- one call to action, a question');
    }
    if (profile?.hashtagPolicy === 'none') lines.push('- no hashtags');
    const notes = trimmed(profile?.notes);
    if (notes) lines.push(`- ${oneLine(notes).slice(0, 500)}`);
    return lines;
  }

  /**
   * Ответ модели превращается в бриф детерминированно.
   *
   * Всё, что модель могла бы решить о себе самой, решается здесь: чужой
   * идентификатор факта отбрасывается, факт без опоры уходит в `ungrounded` и
   * в текст не идёт, слово человека переписывает предложение модели, поле,
   * отданное модели («Реши сама»), заполняется её же первым вариантом.
   */
  private async settleBrief(input: {
    plan: IntakePlanV1;
    answer: any;
    person: Record<string, string>;
    avatar: { lines: string[]; audience: string | null };
    memory: Array<{ id: string; statement: string }>;
    evidence: Map<string, AcceptedEvidence>;
    extraction: IntakeExtractionV1 | null;
    organizationId: string;
  }): Promise<FilledBrief> {
    const { plan, answer, person, avatar, memory, evidence } = input;
    const knownFacts = new Set(memory.map((fact) => fact.id));
    const modelReturnedNull: Partial<Record<BriefField, boolean>> = {};
    const origins: BriefFilledV1['origins'] = {};

    const originOf = (field: string): BriefFieldOriginV1 | null => {
      const claimed = trimmed(answer?.origins?.[field]);
      return (ORIGINS as string[]).includes(claimed)
        ? (claimed as BriefFieldOriginV1)
        : null;
    };

    const options: Partial<Record<BriefField, string[]>> = {};
    for (const field of PROPOSED_FIELDS.concat(['thesis'] as BriefField[])) {
      const list = (answer?.options?.[field] || [])
        .map((option: unknown) => trimmed(option))
        .filter(Boolean)
        .slice(0, 3);
      if (list.length) options[field] = list;
    }

    const settleText = (field: string): string | null => {
      if (person[field]) {
        origins[field as keyof BriefFilledV1['origins']] = 'person';
        return person[field];
      }
      const proposed = textOrNull(answer?.[field]);
      if (proposed) {
        origins[field as keyof BriefFilledV1['origins']] =
          originOf(field) || 'model';
        return proposed;
      }
      modelReturnedNull[field as BriefField] = true;
      // «Реши сама»: человек отдал поле модели, и её же первый вариант
      // становится ответом — переспрашивать про отданное значило бы не
      // услышать сказанного.
      const own = options[field as BriefField]?.[0];
      if (own && plan.decide.includes(field as BriefField)) {
        origins[field as keyof BriefFilledV1['origins']] = 'model';
        return own;
      }
      return null;
    };

    const goal = settleText('goal');
    const thesis = settleText('thesis');
    const position = settleText('position');
    const disagreement = settleText('disagreement');
    let audience = settleText('audience');
    if (!audience && avatar.audience) {
      // Аватар знает, для кого пишет эта область: спрашивать об этом человека
      // — спрашивать о том, что продукт уже записал.
      audience = avatar.audience;
      origins.audience = 'avatar';
      modelReturnedNull.audience = true;
    }

    const facts: BriefFilledFactV1[] = [];
    for (const fact of (answer?.facts || []).slice(0, MEMORY_FACTS_LIMIT)) {
      const statement = trimmed(fact?.statement);
      if (!statement) continue;
      const factId =
        trimmed(fact?.factId) && knownFacts.has(trimmed(fact.factId))
          ? trimmed(fact.factId)
          : null;
      const evidenceId =
        trimmed(fact?.evidenceId) && evidence.has(trimmed(fact.evidenceId))
          ? trimmed(fact.evidenceId)
          : null;
      facts.push({
        statement,
        sourceUrl: evidenceId ? evidence.get(evidenceId)!.url : null,
        factId,
        evidenceId,
        origin: evidenceId ? 'search' : factId ? 'memory' : 'input',
        verified: Boolean(evidenceId || factId),
      });
    }

    // Ответ человека про факты — его слово, и адрес внутри него становится
    // опорой. Без адреса опоры нет, и это честно видно в квитанции.
    const factsAnswer = person['facts'];
    if (factsAnswer) {
      const url = singleLinkOf(factsAnswer);
      facts.push({
        statement: url ? factsAnswer.replace(url, '').trim() || factsAnswer : factsAnswer,
        sourceUrl: url,
        factId: null,
        evidenceId: null,
        origin: 'person',
        verified: Boolean(url),
      });
    }

    /*
      Мысль без единого факта: продукт ищет опору сам, тем же путём, что и
      генератор с 05.09.2026, и не спрашивает человека о том, что может найти.
      Вопрос про факты остаётся на случай, когда не нашлось ничего.

      Сам поиск отсюда вынесен (`content-factory-next-tu3k.7`): он занимает
      секунды, а этот метод не генератор и сказать о них человеку не может.
      Здесь остаётся только решение «искать и о чём», а ищет `run`, объявив об
      этом событием `search-started`.
    */
    const pendingSearch =
      !facts.some((fact) => fact.verified) &&
      plan.options.searchEnrichment &&
      !input.extraction
        ? factsAnswer || thesis || plan.input
        : null;

    const brief: BriefFilledV1 = {
      inputKind: plan.inputKind,
      goal,
      thesis,
      position,
      disagreement,
      audience,
      format: this.settleFormat(person['format'] || answer?.format, origins),
      facts,
      origins,
      ungrounded: facts
        .filter((fact) => !fact.verified)
        .map((fact) => fact.statement),
    };

    return {
      ...this.settled(brief),
      options,
      modelReturnedNull,
      pendingSearch,
    };
  }

  /** Идентификаторы опоры пересчитываются по фактам, а не копятся рядом. */
  private settled(brief: BriefFilledV1): Omit<FilledBrief, 'options' | 'modelReturnedNull' | 'pendingSearch'> {
    return {
      brief,
      factIds: [
        ...new Set(
          brief.facts
            .map((fact) => fact.factId)
            .filter((id): id is string => Boolean(id))
        ),
      ],
      evidenceIds: [
        ...new Set(
          brief.facts
            .map((fact) => fact.evidenceId)
            .filter((id): id is string => Boolean(id))
        ),
      ],
    };
  }

  /**
   * Опора, найденная поиском, дописывается в уже собранный бриф.
   *
   * Отдельным шагом ровно потому, что о нём надо успеть сказать человеку:
   * событие `search-started` уходит до него, а не после
   * (`content-factory-next-tu3k.7`).
   */
  private async addSearchedFacts(
    organizationId: string,
    plan: IntakePlanV1,
    filled: FilledBrief,
    evidence: Map<string, AcceptedEvidence>
  ): Promise<FilledBrief> {
    if (!filled.pendingSearch) return filled;
    const found = await this.searchForFacts(
      organizationId,
      filled.pendingSearch,
      plan,
      evidence
    );
    if (!found.length) return { ...filled, pendingSearch: null };
    const brief: BriefFilledV1 = {
      ...filled.brief,
      facts: [...filled.brief.facts, ...found],
    };
    return {
      ...filled,
      ...this.settled(brief),
      pendingSearch: null,
    };
  }

  private settleFormat(
    value: unknown,
    origins: BriefFilledV1['origins']
  ): IntakeFormatV1 {
    const wanted = trimmed(value) as IntakeFormatV1;
    if (BRIEF_FORMATS.includes(wanted)) {
      origins.format = origins.format || 'model';
      return wanted;
    }
    return 'auto';
  }

  /** Опора для мысли, у которой её не было: один поиск, находки как факты. */
  private async searchForFacts(
    organizationId: string,
    subject: string,
    plan: IntakePlanV1,
    evidence: Map<string, AcceptedEvidence>
  ): Promise<BriefFilledFactV1[]> {
    let answer: WebResearchResult;
    try {
      answer = await this.research.research(organizationId, subject, {
        language: plan.language,
      });
    } catch (error) {
      if (!(error instanceof WebSearchNotConfigured)) {
        this.logger.warn(
          `Intake looked for material and found none: ${describeError(error)}`
        );
      }
      return [];
    }
    const sourceByUrl = new Map(
      (answer.sources || []).map((source) => [source.url, source])
    );
    const found: BriefFilledFactV1[] = [];
    for (const fact of (answer.facts || []).slice(
      0,
      CONTENT_CONTEXT_MAX_EVIDENCE_V1
    )) {
      const source = sourceByUrl.get(fact.sourceUrl);
      try {
        const accepted = await this.sources.acceptSearchResult(
          organizationId,
          {
            url: fact.sourceUrl,
            title: source?.title ?? null,
            excerpt: fact.text,
            publishedAt: source?.publishedAt ?? null,
            provider: source?.provider ?? answer.provider,
          },
          { reuseBy: 'url' }
        );
        evidence.set(accepted.evidenceId, {
          evidenceId: accepted.evidenceId,
          url: accepted.url,
          title: accepted.title,
          excerpt: accepted.excerpt,
        });
        found.push({
          statement: oneLine(accepted.excerpt).slice(0, 400),
          sourceUrl: accepted.url,
          factId: null,
          evidenceId: accepted.evidenceId,
          origin: 'search',
          verified: true,
        });
      } catch (error) {
        this.logger.warn(
          `A search result could not be kept as evidence: ${describeError(
            error
          )}`
        );
      }
    }
    return found;
  }

  /* -----------------------------------------------------------------------
   * Ворота и вопросы
   * -------------------------------------------------------------------- */

  /**
   * Не больше двух вопросов, и только о том, чего модель знать не может.
   *
   * Ворота брифа не тронуты: `evaluateBrief` считает то же самое, что и на
   * вкладке «Бриф». Разница в том, о чём спрашивают. Тезис и факты спрашивают
   * всегда, когда их нет, — это решение владельца: «вопросы только когда
   * непонятен тезис или нет ни одного факта». Позицию, возражение и адресата
   * модель предлагает сама, и спрашивают о них только тогда, когда она честно
   * вернула пустоту и человек не отдал поле ей же.
   *
   * Отсюда следствие, которое стоит сказать вслух: бриф без позиции может
   * дойти до генерации, а без тезиса или факта — нет. Это и есть разница между
   * «продукт предлагает» и «продукт допрашивает».
   */
  private questionsFor(
    filled: FilledBrief,
    plan: IntakePlanV1
  ): IntakeQuestionV1[] {
    const verdict = evaluateBrief(this.gateBrief(filled.brief));
    if (verdict.ready) return [];
    const asked = verdict.questions.filter((question) => {
      if (question.field === 'thesis' || question.field === 'facts') return true;
      return (
        filled.modelReturnedNull[question.field] === true &&
        !plan.decide.includes(question.field)
      );
    });
    return asked.slice(0, INTAKE_MAX_QUESTIONS).map((question) => ({
      field: question.field,
      question: question.question[plan.language],
      ...(filled.options[question.field]
        ? { options: filled.options[question.field] }
        : {}),
    }));
  }

  /** Заполненный бриф в том виде, в каком его читают ворота. */
  private gateBrief(brief: BriefFilledV1): Brief {
    return {
      goal: brief.goal ?? undefined,
      thesis: brief.thesis ?? undefined,
      format: brief.format ?? undefined,
      position: brief.position ?? undefined,
      disagreement: brief.disagreement ?? undefined,
      audience: brief.audience ?? undefined,
      facts: brief.facts.map((fact) => ({
        statement: fact.statement,
        sourceUrl: fact.sourceUrl ?? null,
        factId: fact.factId ?? null,
      })),
    };
  }

  /* -----------------------------------------------------------------------
   * Генерация и сохранение
   * -------------------------------------------------------------------- */

  /**
   * Один канал: генерация, пересылка событий и черновик.
   *
   * Отказ одного канала не забирает с собой остальные — человек выбрал три и
   * получает столько, сколько получилось, с названной причиной по каждому.
   * Возвращает идентификатор поста или `undefined`.
   */
  private async *writeChannel(
    organizationId: string,
    plan: IntakePlanV1,
    channel: IntakeChannelV1,
    filled: FilledBrief,
    extraction: IntakeExtractionV1 | null,
    foreignShingles: string[],
    core: ZagotovkaCoreV1,
    pieceId: string | null
  ): AsyncGenerator<IntakeEventWithPieceV1, string | undefined> {
    const hints: IntakeGenerationHintsV1 = {
      version: INTAKE_HINTS_VERSION,
      // Суть едет материалом, а не запросом: она уже написана и уже
      // нейтральна, и адаптация переносит её слова дословно.
      core: core.text,
      brief: {
        thesis: filled.brief.thesis ?? null,
        position: filled.brief.position ?? null,
        disagreement: filled.brief.disagreement ?? null,
        audience: filled.brief.audience ?? null,
        goal: filled.brief.goal ?? null,
      },
      borrowed: extraction
        ? {
            topic: trimmed(extraction.topic),
            angle: trimmed(extraction.angle),
            structure: (extraction.structure || []).slice(0, 8).map(trimmed),
          }
        : null,
      ...(foreignShingles.length ? { foreignShingles } : {}),
      channel: {
        integrationId: channel.id,
        providerIdentifier: channel.providerIdentifier,
        maxLength: channel.maxLength,
        maxCaptionLength: channel.maxCaptionLength,
        editor: channel.editor,
        writingProfile: channel.writingProfile ?? null,
      },
    };

    const request: GeneratorRunInput = {
      // Предмет генерации — тезис, а не вставленный текст. Чужой текст сюда
      // не попадает ни одним полем: это и есть граница «берём угол, а не
      // слова».
      research: filled.brief.thesis || plan.input,
      isPicture: plan.options.isPicture,
      format: 'one_long',
      language: plan.language,
      ...(plan.brandProfileSelection
        ? { brandProfileSelection: plan.brandProfileSelection as any }
        : {}),
      ...(filled.factIds.length ? { factIds: filled.factIds } : {}),
      ...(filled.evidenceIds.length
        ? { userMaterialEvidenceIds: filled.evidenceIds }
        : {}),
      intake: hints,
    };

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
            message: trimmed(raw.message) || 'The draft could not be written.',
            integrationId: channel.id,
          };
          failed = true;
          break;
        }
        if (raw?.name === 'content-context') {
          yield {
            name: 'content-context',
            integrationId: channel.id,
            data: raw.data,
          };
          continue;
        }
        const candidate = raw?.data?.output;
        if (candidate && Array.isArray(candidate.content)) output = candidate;
        yield { name: 'generator', integrationId: channel.id, event: raw };
      }
    } catch (error) {
      yield {
        name: 'error',
        error: true,
        code: (error as any)?.code || 'GENERATION_FAILED',
        message: describeError(error),
        integrationId: channel.id,
      };
      failed = true;
    }

    if (failed) return undefined;
    if (!output) {
      yield {
        name: 'error',
        error: true,
        code: 'GENERATION_FAILED',
        message: 'The generator finished without a draft.',
        integrationId: channel.id,
      };
      return undefined;
    }

    const draft = await this.persist(
      organizationId,
      plan,
      channel,
      output,
      pieceId
    );
    if (!draft) {
      yield {
        name: 'error',
        error: true,
        code: 'INTAKE_DRAFT_FAILED',
        message: 'The draft was written but could not be saved.',
        integrationId: channel.id,
      };
      return undefined;
    }
    yield draft.event;
    return draft.postId;
  }

  /**
   * Черновик в базе, строка адаптации и событие о них.
   *
   * Пишется тем же путём, что и любой другой пост: `createDraft` зовёт
   * `PostsRepository.createOrUpdatePost('draft', …)`, состояние `DRAFT`,
   * доставки нет. Вместе с текстом едут снимок контекста, версия голоса и
   * метки цитат — без них окно поста не сможет показать строку происхождения,
   * ради которой всё это и собиралось.
   *
   * `recordPiece` отсюда ушёл (`content-factory-next-tu3k.9`). Он заводил по
   * материалу на канал, и три канала давали три «текста» там, где текст один;
   * теперь заготовка записана один раз до цикла, а здесь пишется только
   * адаптация — с площадкой, видом и текстом простым текстом. Сам
   * `recordPiece` живёт: его зовёт перекройка материала.
   */
  private async persist(
    organizationId: string,
    plan: IntakePlanV1,
    channel: IntakeChannelV1,
    output: any,
    pieceId: string | null
  ) {
    const pieces = (output.content as any[])
      .filter((item) => trimmed(item?.content))
      .map((item) => ({
        content: trimmed(item.content),
        usedCitationIds: Array.isArray(item?.usedCitationIds)
          ? item.usedCitationIds.filter((id: unknown) => trimmed(id))
          : [],
      }));
    if (!pieces.length) return null;

    const plain = pieces.map((piece) => piece.content).join('\n\n');
    const html = editorHtml(plain, channel.editor);
    const usedCitationIds = [
      ...new Set(pieces.flatMap((piece) => piece.usedCitationIds)),
    ];
    const snapshotId = trimmed(output.contentContextSnapshotId) || null;
    const versionId = trimmed(output.brandProfileVersionId) || null;

    const postId = await this.briefRepository.createDraft(organizationId, {
      channelId: channel.id,
      providerIdentifier: channel.providerIdentifier,
      content: html,
      date: trimmed(output.date) || this.now().toISOString(),
      contentContextSnapshotId: snapshotId,
      brandProfileVersionId: versionId,
      usedCitationIds,
    });
    if (!postId) return null;

    const adaptation = pieceId
      ? await this.briefRepository.recordAdaptation(organizationId, {
          pieceId,
          postId,
          integrationId: channel.id,
          platform: channel.providerIdentifier,
          // Вид спрашивается у площадки, а не пишется словом: Instagram берёт
          // подпись, сайт — статью, и вход не должен знать этого списка сам.
          kind: kindsOfProvider(channel.providerIdentifier)[0],
          // Текст адаптации хранится простым текстом; разметку несёт пост.
          body: plain,
          format: materialFormat(plain, null, plan.language),
          brandProfileVersionId: versionId,
        })
      : null;

    const event: IntakeEventWithPieceV1 = {
      name: 'draft',
      integrationId: channel.id,
      postId,
      pieceId,
      adaptationId: adaptation?.id ?? null,
      content: pieces,
      provenance: {
        contentContextSnapshotId: snapshotId,
        brandProfileVersionId: versionId,
        brandProfileSelection: output.brandProfileSelection ?? null,
        contentContextStatus: output.contentContextStatus ?? null,
        generationPolicy: output.generationPolicy ?? null,
        selectionHash: output.selectionHash ?? null,
      },
      draftGaps: Array.isArray(output.draftGaps) ? output.draftGaps : [],
      checks: {
        // Антикопию считает граф (поток S2 волны); пока не считает — `null`,
        // и это честнее выдуманной единицы.
        antiCopy: output.antiCopy ?? null,
        slop:
          plan.options.slopCheck && this.slopCheck
            ? this.slopCheck(plain, channel.providerIdentifier, plan.language)
            : null,
      },
    };
    return { postId, event };
  }
}

export { IntakeError };
