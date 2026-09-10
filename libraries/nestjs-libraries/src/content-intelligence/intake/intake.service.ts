import { selectedFactsBrief, type PieceFactV2 } from '../pieces/piece-facts.v2';
export { textOrNull } from './intake-content';
import { contentFromIntent, intakeDiscardDiagnostic, textOrNull } from './intake-content';
import type { IntakeEventV2, BriefFilledV2 } from '../brand-voice/intake-v2.contract';
/**
 * Neutral intake: read the submitted material, fill the brief and save one core.
 * Channel adaptation belongs exclusively to PieceService. Legacy integrationIds
 * are ignored, so an older client cannot trigger the removed paid shortcut.
 * Questions are saved with the core and answered on the piece page.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentGraphService } from '@contentfactory/nestjs-libraries/agent/agent.graph.service';
import { slopCheck as runSlopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
/*
  Вердикт голоса — портом, а не голосовым сервисом: имя, а не класс. То же
  устройство, что у мерки отбора черновика в графе.
*/
import {
  VOICE_CHECK_PORT,
  type VoiceCheckPort,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-check.port';
import {
  WebResearchService,
  ResearchQuotaExceeded,
  WebSearchNotConfigured,
  WebSearchFallbackError,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import type { WebResearchResult } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { RESEARCH_LEVEL_PRESETS } from '@contentfactory/nestjs-libraries/openai/web.research.service';
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
import type { BriefField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import type {
  BriefFieldOriginV1,
  BriefFilledFactV1,
  BriefFilledV1,
  IntakeClaimV1,
  IntakeFormatV1,
  IntakeInputKindV1,
  PieceAnswerInputV1,
  PieceAnswerV1,
  PieceFieldAnswerV1,
  PieceOpenQuestionV1,
  PieceQuestionKeyV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  INTAKE_INPUT_MIN_CHARS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  CORE_QUESTION_FIELDS,
  briefForGate,
  coreQuestionText,
} from '../pieces/core-questions';
import { writeCore, type CoreBorrowedV1 } from '../pieces/core-write';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { ContentBriefRepository } from '../brief/content-brief.repository';
import { briefTitle } from '../brief/content-brief.compose';
import {
  INTAKE_LINK_UNREACHABLE_MESSAGES,
  IntakeError,
  PIECE_NOT_SAVED_MESSAGES,
  intakeError,
} from './intake.errors';
import { detectInputKind, singleLinkOf, linksOf, wordShingles } from './intake-kind';
import {
  briefFillPromptV2 as briefFillPrompt,
  briefFillSchemaV2 as briefFillSchema,
  extractionPromptV2 as extractionPrompt,
  extractionSchemaV2 as extractionSchema,
  type IntakeExtractionV2 as IntakeExtractionV1,
} from './intake.prompts.v2';
import { oneLine } from './intake.prompts';

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
    researchEnabled: boolean;
    researchLevel: 'quick' | 'standard' | 'deep';
    isPicture: boolean;
  };
  /** `null` means the paid research result still awaits the author's choice. */
  researchSelections: string[] | null;
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
  questions?: PieceOpenQuestionV1[];
  brief: BriefFilledV1;
  /** Поля, которые модель честно оставила пустыми, и её варианты для них. */
  options: Partial<Record<BriefField, string[]>>;
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
    @Optional() slopCheck: SlopCheckPort | null = null,
    /**
     * Вердикт голоса для квитанции черновика (`content-factory-next-k879.1`).
     *
     * Последним и необязательным: порядок параметров — часть договора с
     * наборами, которые собирают сервис руками. Без него квитанция говорит
     * `UNKNOWN` с причиной, а не выдаёт молчание за одобрение.
     *
     * `@Inject` рядом с `@Optional()`: тип параметра — объединение с `null`,
     * метаданные для объединения пишут `Object`, и Nest молча подставил бы
     * `undefined` при зелёных наборах.
     */
    @Optional()
    @Inject(VOICE_CHECK_PORT)
    private readonly voiceCheck: VoiceCheckPort | null = null
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
   * решаемое заранее: достаточна ли длина входа для создания заготовки.
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

    // Intake never adapts or validates channels, including requests from older clients.
    const channels: IntakeChannelV1[] = [];

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
      /*
        `slopCheck` здесь больше не читается (`content-factory-next-k879.1`):
        штампы считаются на каждом черновике сами. Клиент, который всё ещё
        присылает флаг, получает то же самое — проверяющий с `whitelist: true`
        снимает незнакомое поле молча, и отказа не случается.
      */
      options: {
        searchEnrichment: body?.options?.searchEnrichment !== false,
        researchEnabled: body?.options?.researchEnabled === true,
        researchLevel:
          body?.options?.researchLevel === 'quick' || body?.options?.researchLevel === 'deep'
            ? body.options.researchLevel
            : 'standard',
        isPicture: body?.options?.isPicture === true,
      },
      researchSelections: Array.isArray(body?.researchSelections)
        ? body.researchSelections
            .filter((statement: unknown): statement is string => typeof statement === 'string')
            .map((statement: string) => statement.trim().slice(0, 400))
            .filter(Boolean)
        : null,
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
  async *run(
    organizationId: string,
    plan: IntakePlanV1,
    actorUserId?: string
  ): AsyncGenerator<IntakeEventV2> {
    const language = plan.language;
    yield {
      name: 'intake-started',
      inputKind: plan.inputKind,
      sources: plan.inputKind === 'foreign_post' && linksOf(plan.input).length
        ? ['foreign_post', 'link'] : [plan.inputKind],
    };

    const evidence = new Map<string, AcceptedEvidence>();
    let borrowedText: string | null = null;

    const urls = plan.inputKind === 'link' || plan.inputKind === 'foreign_post'
      ? linksOf(plan.input) : [];
    const borrowedParts: string[] = plan.inputKind === 'foreign_post'
      ? [plan.input.slice(0, BORROWED_TEXT_LIMIT)] : [];
    for (const url of urls) {
      let accepted: AcceptedEvidence;
      try {
        accepted = await this.readLink(organizationId, url);
      } catch (error) {
        this.logger.warn(`Intake could not read the pasted link: ${describeError(error)}`);
        yield { name: 'error', error: true, code: 'INTAKE_LINK_UNREACHABLE',
          message: INTAKE_LINK_UNREACHABLE_MESSAGES[language] };
        return;
      }
      evidence.set(accepted.evidenceId, accepted);
      yield { name: 'link-fetched', url: accepted.url, title: accepted.title, evidenceId: accepted.evidenceId };
      borrowedParts.push(accepted.excerpt);
    }
    borrowedText = borrowedParts.length ? borrowedParts.join('\n\n') : null;

    let extraction: IntakeExtractionV1 | null = null;
    let foreignShingles: string[] = [];
    if (borrowedText) {
      extraction = await this.extract(organizationId, borrowedText, language);
      yield { name: 'claims', claims: this.skippedClaims(extraction) };
      foreignShingles = wordShingles(borrowedText);
    }

    yield { name: 'brief-started' };
    let filled = await this.fillBrief(
      organizationId,
      plan,
      extraction,
      evidence
    );
    if (plan.options.researchEnabled) {
      const level = plan.options.researchLevel;
      yield {
        name: 'research-started',
        level,
        count: RESEARCH_LEVEL_PRESETS[level].maxSearchQueries,
      };
      // The explicit paid lane is fail-closed: a missing key, exhausted quota
      // or provider outage must be visible to the person and must not silently
      // turn an opted-in research run into an ordinary draft.
      const researched = await this.searchForFacts(
        organizationId,
        plan.input,
        plan,
        evidence,
        level,
        true
      );
      if (researched.length) {
        const selectedResearch =
          plan.researchSelections === null
            ? null
            : new Set(plan.researchSelections);
        const brief: BriefFilledV1 = {
          ...filled.brief,
          facts: [
            ...filled.brief.facts,
            ...researched.map((fact): PieceFactV2 => ({
              ...fact,
              kind: 'found',
              status: fact.verified ? 'confirmed' : 'unverified',
              selected: selectedResearch?.has(fact.statement) ?? false,
            })),
          ],
        };
        filled = { ...filled, ...this.settled(brief), pendingSearch: null };
      } else {
        // Do not fall through to the legacy optional search lane. That would
        // spend a second research call after a deliberate paid attempt.
        filled = { ...filled, pendingSearch: null };
      }
      yield {
        name: 'research-ready',
        level,
        facts: filled.brief.facts,
        sources: filled.brief.facts
          .filter((fact) => fact.kind === 'found' && fact.sourceUrl)
          .map((fact) => ({
            url: fact.sourceUrl!,
            title: evidence.get(fact.evidenceId ?? '')?.title || fact.sourceUrl!,
            status:
              fact.status === 'conflicting'
                ? 'conflicting' as const
                : fact.status === 'confirmed'
                ? 'confirmed' as const
                : 'not_found' as const,
          })),
      };
      if (actorUserId && plan.researchSelections === null && researched.length) {
        yield {
          name: 'research-selection-required',
          level,
          facts: filled.brief.facts,
        };
        yield { name: 'brief-filled', brief: filled.brief };
        yield { name: 'done', pieceId: null };
        return;
      }
    }
    if (filled.pendingSearch) {
      yield { name: 'search-started', reason: 'facts', count: 1 };
      filled = await this.addSearchedFacts(
        organizationId,
        plan,
        filled,
        evidence
      );
    }
    (filled.brief as BriefFilledV2).inputSources = [
      ...(plan.inputKind !== 'link' ? [{ kind: plan.inputKind }] : []),
      ...urls.map((url) => ({ kind: 'link' as const, url, evidenceId: [...evidence.values()].find((item) => item.url === url)?.evidenceId })),
    ];
    yield { name: 'brief-filled', brief: filled.brief };

    // The draft is deferred until the author resolves material-specific questions.
    if (!actorUserId) {
      yield { name: 'done', pieceId: null };
      return;
    }
    const open = this.openQuestions(filled, plan);
    const answers = this.interviewAnswers(plan);
    const personText = extraction ? '' : contentFromIntent(plan.input);
    const written: ZagotovkaCoreV1 = open.length ? {
      version: 'piece-core/v1', text: '', brief: filled.brief, answers,
      slop: null, writtenBy: 'fallback', authorNumbers: false,
    } : await writeCore(
      {
        organizationId,
        language,
        brief: selectedFactsBrief(filled.brief),
        answers,
        questionTextByKey: Object.fromEntries(
          answers.map((answer) => [
            answer.key,
            coreQuestionText(answer.key, language),
          ])
        ),
        // Чужой текст в суть не идёт ни одним полем: для вставленного поста
        // словами человека не располагаем вовсе, и блок остаётся пустым.
        personText,
        borrowed: extraction ? this.borrowedForCore(extraction) : null,
        foreignShingles,
      },
      {
        aiUsage: this.aiUsage,
        slopCheck: this.slopCheck,
        warn: (message) => this.logger.warn(message),
      }
    );
    const core: ZagotovkaCoreV1 = {
      ...written,
      brief: filled.brief,
      questions: {
        round: 0,
        items: open,
        answered: this.settledAnswers(plan),
      },
      personText,
      ...(extraction ? { borrowed: this.borrowedForCore(extraction) } : {}),
    };

    let piece: { id: string; code: string } | null = null;
    if (actorUserId) {
      try {
        piece = await this.briefRepository.recordCore(organizationId, {
          title: briefTitle({ thesis: textOrNull(filled.brief.thesis) || core.text }, plan.language),
          body: core.text,
          brief: {
            ...this.storedCore(core),
            ...(foreignShingles.length ? { foreignShingles } : {}),
          },
          language: plan.language,
          createdByUserId: actorUserId,
        });
      } catch (error) {
        // Заготовка — то, ради чего весь ход. Не записалась она — дальше идти
        // некуда: черновики без заготовки это та самая библиотека из трёх
        // «текстов» на один, от которой волна `tu3k.9` и уходила.
        this.logger.error(
          `The piece could not be recorded: ${describeError(error)}`
        );
        yield {
          name: 'error',
          error: true,
          code: 'PIECE_NOT_SAVED',
          message: PIECE_NOT_SAVED_MESSAGES[language],
        };
        return;
      }
    }
    const pieceId = piece?.id ?? null;
    if (piece) {
      yield { name: 'piece', pieceId: piece.id, code: piece.code, core };
    }
    /*
      Вопросы после заготовки и не вместо неё. Событие осталось прежним, чтобы
      старый читатель стрима не сломался, но терминальным быть перестало:
      человек уже на странице заготовки, и отвечает он там.
    */
    if (open.length) {
      yield { name: 'questions', questions: open, round: 0 };
    }

    yield { name: 'done', pieceId };
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
   * Разбор чужого текста
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
        const extracted = await model.invoke(extractionPrompt(text, language)) as IntakeExtractionV1;
        for (const field of ['topic', 'angle'] as const) {
          const raw = extracted[field];
          extracted[field] = textOrNull(raw);
          if (!extracted[field] && trimmed(raw)) this.logger.warn(intakeDiscardDiagnostic('intake-extract', field, raw));
        }
        extracted.claims = (extracted.claims ?? []).filter((claim) => textOrNull(claim.text));
        return extracted;
      },
      'extract'
    );
  }

  /**
   * Разбор перечисляет утверждения, но не запускает их автоматическую платную
   * проверку. `skipped` честно означает «не проверяли»; опора может появиться
   * позже только через отдельное обогащение недостающих фактов.
   */
  private skippedClaims(extraction: IntakeExtractionV1): IntakeClaimV1[] {
    return (extraction.claims || []).slice(0, 12).map((claim) => ({
      text: trimmed(claim?.text),
      hasNumber: Boolean(claim?.hasNumber),
      status: 'skipped',
      evidenceId: null,
      sourceUrl: null,
    }));
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
            channel: [],
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

  /**
   * Что осталось спросить у только что записанной заготовки.
   *
   * Ничего терминального: список едет вместе с заготовкой и живёт в её брифе,
   * а отвечают на него на её странице. `skipInterview` по-прежнему значит
   * «модель решает всё сама» — тогда не спрашивают вовсе.
   */
  private openQuestions(
    filled: FilledBrief,
    plan: IntakePlanV1
  ): PieceOpenQuestionV1[] {
    if (plan.skipInterview) return [];
    const settled = this.settledFields(plan);
    return (filled.questions ?? []).filter((question) => !settled.includes(question.field)).slice(0, 3);
  }

  /**
   * Поля, по которым решение уже принято: человек ответил, поправил квитанцию
   * или отдал поле модели. О них не спрашивают ни первым кругом, ни вторым.
   */
  private settledFields(plan: IntakePlanV1): BriefField[] {
    const fields = new Set<BriefField>(
      Object.keys(this.personFields(plan)) as BriefField[]
    );
    for (const field of plan.decide) fields.add(field);
    for (const key of plan.decideKeys) {
      const field = CORE_QUESTION_FIELDS[key];
      if (field) fields.add(field);
    }
    return [...fields];
  }

  /** Те же решения, записанные в бриф заготовки: ответы и «Реши сама». */
  private settledAnswers(plan: IntakePlanV1): PieceFieldAnswerV1[] {
    const answeredAt = this.now().toISOString();
    const person = this.personFields(plan);
    const answers: PieceFieldAnswerV1[] = Object.entries(person).map(
      ([field, text]) => ({
        field: field as BriefField,
        text,
        origin: 'person' as const,
        answeredAt,
      })
    );
    const decided = new Set<BriefField>(plan.decide);
    for (const key of plan.decideKeys) {
      const field = CORE_QUESTION_FIELDS[key];
      if (field) decided.add(field);
    }
    for (const field of decided) {
      if (person[field]) continue;
      answers.push({ field, text: '', origin: 'model', answeredAt });
    }
    return answers;
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
        undefined
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
      if (!proposed && trimmed(answer?.[field])) this.logger.warn(intakeDiscardDiagnostic('intake', field, answer[field]));
      if (proposed) {
        origins[field as keyof BriefFilledV1['origins']] =
          originOf(field) || 'model';
        return proposed;
      }
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
    }

    const facts: PieceFactV2[] = [];
    for (const fact of (answer?.facts || []).slice(0, MEMORY_FACTS_LIMIT)) {
      const statement = textOrNull(fact?.statement);
      if (!statement && trimmed(fact?.statement)) this.logger.warn(intakeDiscardDiagnostic('intake', 'facts.statement', fact.statement));
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
        kind: evidenceId || plan.inputKind !== 'thought' ? 'external' : 'own',
        status: evidenceId || factId ? 'confirmed' : 'unverified',
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
      questions: (Array.isArray(answer?.questions) ? answer.questions : [])
        .filter((question: any, index: number, all: any[]) =>
          ['thesis', 'position', 'facts'].includes(question?.field) &&
          textOrNull(question?.question) &&
          all.findIndex((other: any) => other?.field === question.field) === index
        )
        .slice(0, 3)
        .map((question: any) => ({
          field: question.field,
          question: textOrNull(question.question)!,
          options: (Array.isArray(question.options) ? question.options : [])
            .map(textOrNull).filter(Boolean).slice(0, 3),
          suggested: null as string | null,
        })),
      pendingSearch,
    };
  }

  /** Идентификаторы опоры пересчитываются по фактам, а не копятся рядом. */
  private settled(brief: BriefFilledV1): Omit<FilledBrief, 'options' | 'pendingSearch'> {
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
      facts: [...filled.brief.facts, ...found.map((fact): PieceFactV2 => ({ ...fact, kind: 'found', selected: false, status: fact.verified ? 'confirmed' : 'unverified' }))],
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
    evidence: Map<string, AcceptedEvidence>,
    level?: 'quick' | 'standard' | 'deep',
    required = false
  ): Promise<BriefFilledFactV1[]> {
    let answer: WebResearchResult;
    try {
      answer = await this.research.research(organizationId, subject, {
        language: plan.language,
        ...(level ? { level } : {}),
      });
    } catch (error) {
      if (
        required &&
        (error instanceof ResearchQuotaExceeded ||
          error instanceof WebSearchNotConfigured ||
          error instanceof WebSearchFallbackError)
      ) {
        throw error;
      }
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
          verified: false,
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

}

export { IntakeError };
