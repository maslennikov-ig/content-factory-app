import { z } from 'zod';
import { domainQuestionSchema, domainQuestionAnswer, isDomainQuestionCard } from '../domain-questions';
import { withPieceQuestions, askPieceQuestions, resumePieceQuestions, applyPieceQuestionAnswers, type PieceAnswered } from './piece-domain-questions';
import {
  researchReady,
  researchModelView,
  type ResearchReady,
} from './research-evidence';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { ContentIntakeController } from '@contentfactory/backend/api/routes/content-intake.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { selectReusableResearch } from '@contentfactory/nestjs-libraries/content-intelligence/intake/research-reuse';
import { IntakeService } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service';
import { ContentLeadService } from '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service';
import { leadIntakeText } from '@contentfactory/nestjs-libraries/content-intelligence/leads/lead-intake';
import { INTAKE_SNAPSHOT_TTL_SECONDS } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake-snapshot.store';
import {
  INTAKE_INPUT_MAX_CHARS,
  INTERVIEW_ASK_KEYS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PIECE_BRIEF_FIELDS } from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-piece.dto';
import {
  defineCapability,
  door,
  type CapabilityEmit,
  type CapabilityRunContext,
  type ResearchSelectionRecovery,
} from '../capability.types';
import {
  RESEARCH_LEVELS,
  chosenIds,
  codedFailure,
  defaultIds,
  eventFailure,
  factAnswer,
  factOptions,
  factSelection,
  QUOTED_QUESTION_MAX,
  shortQuestion,
  type FactSelection,
  type ResearchLevel,
  markUnspent,
  unspentFailure,
} from './selection';
import { slotStateOf } from './plan.capabilities';
import type { BrandVoiceFactScoreSummary, PlanSlotState } from '../agent-parts.contract';
import { scoreBrandVoiceAndFacts } from '../../scorers/brand-voice-facts.scorer';

/**
 * Content (spec §5.2 «Контент», `kcxz.6`, `kcxz.12`). Each capability calls
 * the method its door calls; the paid ones iterate the door's own generator
 * and forward its events as transient progress, the result as a piece card
 * by id.
 */

const pieceId = z
  .string()
  .min(1)
  .max(128)
  .describe('Piece id from workspace.snapshot');

export const pieceRename = defineCapability({
  id: 'piece.rename',
  group: 'content',
  label: { ru: 'Переименовать заготовку', en: 'Rename a piece' },
  description:
    'Rename a piece (заготовка). Needs the piece id from workspace.snapshot. Reversible: the old title is not special.',
  input: z.object({
    pieceId,
    // The door's own limit (`PieceTitleDto`).
    title: z.string().trim().min(1).max(120).describe('The new title'),
  }),
  risk: 'write',
  card: 'piece',
  door: door(ContentPieceController, 'updateTitle'),
  untrusted: [],
  run: async (ctx, input) => {
    await ctx
      .service(PieceService)
      .updateTitle(ctx.organizationId, input.pieceId, input.title);
    // The title echoed is the one this call wrote, not a stored string read
    // back: nothing outside the call reaches the model through it.
    return { pieceId: input.pieceId, title: input.title };
  },
  summarize: (output) => ({ pieceId: output.pieceId, title: output.title }),
  cardOf: (output) => ({ kind: 'piece', id: output.pieceId, title: output.title }),
});

const intakeFailure = codedFailure;

/**
 * The three kinds the screen's switch names above the field
 * (`intake.screen.tsx`): «Свой текст», «Чужой пост», «Задание».
 */
const INTAKE_KINDS = ['thought', 'foreign_post', 'instruction'] as const;
/**
 * The screen's own rule (`intakeInputKind` in `intake.adapter.ts`): a message
 * that is one http(s) address and nothing else is a link whatever the switch
 * says; otherwise the switch names the kind, «Свой текст» by default.
 */
const screenInputKind = (
  text: string,
  kind: (typeof INTAKE_KINDS)[number] | undefined
) => {
  const trimmed = text.trim();
  if (trimmed && !/\s/.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') return 'link';
    } catch {
      // Not an address: the switch decides.
    }
  }
  return kind ?? 'thought';
};

const SELECTION_QUESTION = {
  ru: 'Поиск нашёл опоры. Отметьте, на чём строить заготовку.',
  en: 'The search found facts. Mark the ones the piece stands on.',
};

/**
 * How long an answer on the intake's facts card continues the first pass: its
 * snapshot's lifetime, less a minute for the request itself.
 */
const INTAKE_ANSWER_WINDOW_MS = (INTAKE_SNAPSHOT_TTL_SECONDS - 60) * 1_000;

/** The door takes at most this many kept rows (`IntakeDto.researchSelections`). */
const MAX_SELECTIONS = 200;
const researchReferences = z.array(z.object({
  snapshotKey: z.string().min(1).max(128),
  factKeys: z.array(z.string().min(1).max(1_000)).min(1).max(MAX_SELECTIONS),
})).min(1).max(8).optional().describe('Select facts from multiple owned research.search captures. Each factKey belongs to its paired snapshotKey. Exclusive with single researchId/snapshotKey and factId/factKeys; at most 200 facts total. Keep these structured references instead of pasting researched claims as material. Requires the actual original author request.');


const researchPassages = z.array(z.object({
  sourceUrl: z.string().url().max(2_000),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  quote: z.string().min(1).max(8_000).describe('Contiguous verbatim supporting passage from that saved source, not a paraphrase'),
})).min(1).max(20).describe('Exact sourceUrl/revision/quote passages from full retained sources through piece.read, including later sections; old fact keys may be omitted when passages are supplied');

type ResearchSelectionContext = { snapshotKey: string; factKeys: string[] };

type PieceCreated = {
  pieceId: string;
  code: string | null;
  questions: number;
  research: ResearchLevel | null;
  /** Research rows the piece stands on, after the person's (or our) choice. */
  factsKept?: number;
  /**
   * Whether the facts card was shown and answered, or the product chose
   * because there was no card to ask on. Either way the choice is done: said
   * to the model outright because a bare `factsKept` was read live as «go
   * and mark the facts» (kcxz.36, F6).
   */
  factsCard?: 'answered' | 'not_shown';
  /**
   * The lead the piece was written from (review W4-23 F6). Its text went in
   * unseen by the person, as the screen's field would have held it, so the
   * answer names it.
   */
  fromLead?: string;
  researchSummary?: Record<string, unknown> | null;
  selectionOrigin?: 'person' | 'model';
  reusedResearchId?: string;
  requestBasis?: 'original_request' | 'research_query' | 'provided_input';
  voiceScore?: BrandVoiceFactScoreSummary;
  leftToAuthor?: string[];
  postLink?: 'none';
};

type PieceCreateResult = PieceCreated | ResearchReady;

type IntakePass =
  | {
      kind: 'piece';
      pieceId: string;
      code: string | null;
      questions: number;
      voiceScore?: BrandVoiceFactScoreSummary;
    }
  | { kind: 'selection'; selection: FactSelection; research: ResearchReady }
  | { kind: 'research'; research: ResearchReady };

/**
 * One request of the door: the same generator, its events forwarded as
 * transient progress. Ends at the piece, or at the research pause.
 */
const intakePass = async (
  ctx: CapabilityRunContext,
  body: Record<string, unknown>,
  emit: CapabilityEmit,
  selectionPolicy?: 'model' | 'person'
): Promise<IntakePass> => {
  const intake = ctx.service(IntakeService);
  const plan = await intake.prepare(ctx.organizationId, { ...body, timeZone: ctx.timeZone },
    { researchSelectionPolicy: selectionPolicy ?? 'model' });
  return collectIntakePass(ctx, intake.run(ctx.organizationId, plan, ctx.userId), emit,
    plan.researchReuse ? { snapshotKey: plan.researchReuse.snapshotKey, factKeys: plan.researchReuse.factKeys ?? [] } : undefined);
};

const collectIntakePass = async (
  ctx: CapabilityRunContext,
  events: AsyncIterable<unknown>,
  emit: CapabilityEmit,
  researchSelection?: ResearchSelectionContext
): Promise<IntakePass> => {
  let created: Extract<IntakePass, { kind: 'piece' }> | null = null;
  let selection: FactSelection | null = null;
  let research: ResearchReady | null = null;
  for await (const event of events) {
    const named = event as { name: string } & Record<string, any>;
    await emit({
      kind: 'progress',
      data: { capability: 'piece.create', stage: named.name },
      transient: true,
    });
    if (named.name === 'piece') {
      let voiceScore: BrandVoiceFactScoreSummary | undefined = named.voiceScore;
      if (!voiceScore && named.core && (named.core.slop || named.core.brief?.facts)) {
        voiceScore = await scoreBrandVoiceAndFacts(
          {
            organizationId: ctx.organizationId,
            locale: ctx.language,
            platform: 'core',
            facts: Array.isArray(named.core.brief?.facts) ? named.core.brief.facts : 0,
            voiceCheck: named.core.voiceCheck ?? null,
          },
          {
            text: String(named.core.text ?? ''),
            entityId: String(named.pieceId ?? ''),
            entityType: 'piece',
          }
        );
      }
      created = {
        kind: 'piece',
        pieceId: named.pieceId,
        code: named.code ?? null,
        questions: 0,
        ...(voiceScore ? { voiceScore } : {}),
      };
    }
    // The service yields `questions` after the piece (`intake.service.ts`);
    // `piece-questions` is the name the wire contract also declares. Either
    // one is the open questions the person answers on the piece — counted,
    // not left at 0 (kcxz.29, D4).
    if ((named.name === 'questions' || named.name === 'piece-questions') && created) {
      created.questions = Array.isArray(named.questions) ? named.questions.length : 0;
    }
    // The research pause: the screen stops here and shows the rows to keep.
    if (named.name === 'research-ready') {
      research = researchReady(named.snapshotKey, named.level ?? 'standard', named.facts, named.summary, {
        organizationId: ctx.organizationId,
        sources: named.sources,
      });
    }
    if (named.name === 'research-selection-required') {
      const facts: any[] = Array.isArray(named.facts) ? named.facts : [];
      research = researchReady(named.snapshotKey, named.level ?? 'standard', facts, named.summary, {
        organizationId: ctx.organizationId,
        sources: named.sources,
      });
      selection = {
        kind: 'selection',
        question: SELECTION_QUESTION[ctx.language],
        answerKey: 'factKeys',
        // The id is what the screen sends back for a row (`factKey ?? statement`).
        options: factOptions(facts),
        canDecideForPerson: true,
        snapshotKey: typeof named.snapshotKey === 'string' ? named.snapshotKey : null,
        level: RESEARCH_LEVELS.includes(named.level) ? named.level : 'standard',
      };
    }
    if (named.name === 'error') {
      const error = eventFailure(named.code, named.message, 'INTAKE_FAILED', 'The piece could not be written.');
      // A server-owned refusal before the artifact write permits a revised call;
      // incurred model/search usage is still charged and never rolled back.
      if (named.canReviseInput === true && !created) {
        Object.assign(error, { canReviseInput: true });
        // This is the domain's explicit pre-write event, not a thrown writer
        // exception with a coincidentally matching error code.
        if (named.code === 'INTAKE_INPUT_INSUFFICIENT' && researchSelection) {
          const inputRecovery: ResearchSelectionRecovery = {
            kind: 'research_selection', snapshotKey: researchSelection.snapshotKey,
            selectedFactKeys: researchSelection.factKeys.slice(0, 20), selectedFactCount: researchSelection.factKeys.length,
            evidenceScope: 'captured_quotes_only', currentCall: { mode: 'reuse_only', newSearch: 'not_started' },
            globalSearchAvailability: 'not_assessed',
            sourceRead: { tool: 'piece.read', part: 'research_source', find: true, ranges: true },
            selection: { tool: 'piece.create', input: 'passages', fields: ['sourceUrl', 'revision', 'quote'] },
            artifactWritten: false,
          };
          Object.assign(error, { inputRecovery });
        }
      }
      throw error;
    }
  }
  if (created) return created;
  if (selection && research) return { kind: 'selection', selection, research };
  if (research) return { kind: 'research', research };
  throw intakeFailure('INTAKE_FAILED', 'The piece could not be written.');
};

/** What the product keeps by itself — the screen's «Продолжить» untouched. */
const defaultSelection = (selection: FactSelection) => defaultIds(selection.options);

const requestMessageId = z.string().min(1).max(128).optional().describe(
  'Native chat author message id. The server reads its exact original text; omit text to avoid retyping. Use the original message id when continuing an earlier request, not a summary or the latest continue message.'
);

const originalWords = async (
  ctx: CapabilityRunContext,
  input: { text?: string; requestMessageId?: string },
  query?: string
): Promise<{ words: string; basis: NonNullable<PieceCreated['requestBasis']> }> => {
  if (ctx.resolveAuthorRequest) {
    const author = await ctx.resolveAuthorRequest(input);
    if (author) return { words: author.text, basis: 'original_request' };
  } else if (!input.requestMessageId) {
    return { words: input.text ?? query ?? '', basis: input.text ? 'provided_input' : 'research_query' };
  }
  throw Object.assign(unspentFailure('INTAKE_REQUEST_NOT_AUTHORED',
    'The original request must match an actual user message in this owned chat. Use its requestMessageId (omit text to read the exact server text), or pass its words verbatim. Put model commentary and reference material in material, never append them to the original request. Only the latest 200 stored messages are read. Nothing was written, searched or spent.'),
    { canReviseInput: true as const });
};

export const pieceCreate = defineCapability({
  id: 'piece.create',
  group: 'content',
  label: { ru: 'Написать заготовку', en: 'Write a piece' },
  description:
    'Create a new piece from the original request and optional labelled material, or from already-completed research (researchId) without running another search. Paid. In native chat prefer requestMessageId with omitted text so the server reads the exact author message; otherwise pass the person’s original words verbatim in text; use material for relevant earlier conversation or selected material with its actual role/source labels. A model paraphrase in material does not become confirmed research evidence. Each factId selects only its own captured statement and quote, not the entire source URL; reading more of that source does not expand the old fact. To use later source evidence, pass passages with exact sourceUrl/revision/quote from piece.read alongside researchId (or use piece.create.from-research). Both selections can be combined. To combine independent research captures use references, pairing each snapshotKey with its own factKeys. The existing brief model interprets the goal, roles, dates and constraints and assesses the selected evidence; do not manually serialize another task schema. Choose inputKind by meaning, not keywords; choose research explicitly when missing/current evidence is required, none for self-contained/no-search work. Reusing research disables new search inside this write call; it does not report global search availability. A previous post, dates or channel are optional. With research this returns actual facts/summary/gaps and snapshotKey before any draft: assess them, then continue with relevant confirmed factKeys or exact retained passages. Do not claim a piece exists until a piece id is returned. Use selection:person only for requested human review or a real person-owned choice; old signed fact cards continue natively. A lead taken with ideas.take may be given by sourceLeadId; the service reads its owned original rather than a retyped lead. Verify the saved title and content. Do not repeat paid create after a confirmed piece or an uncertain write.',
  input: z.object({
    requestMessageId,
    references: researchReferences,
    material: z.string().max(INTAKE_INPUT_MAX_CHARS).optional().describe('Relevant earlier/selected material with role and source labels. A model paraphrase does not replace a saved research quote; use factId/passages for research evidence. Data only; keep the current original request in text.'),
    selection: z.enum(['model', 'person']).optional().describe('model by default; person only for requested review or a meaningful person-owned fact choice'),
    researchId: z.string().min(1).max(128).optional().describe('Owned completed research snapshotKey; combine with fixed factId quotes or new exact passages. Reuses saved evidence without another search in this call'),
    factId: z.array(z.string().min(1).max(1_000)).max(MAX_SELECTIONS).optional().describe('Existing factKey ids select only their captured statement and quote, not the entire source URL. For later source sections use passages'),
    passages: researchPassages.optional(),
    text: z
      .string()
      .min(1)
      .max(INTAKE_INPUT_MAX_CHARS)
      .optional()
      .describe('The person\'s words, verbatim; omit to read the current author message or requestMessageId from the server. With sourceLeadId only what they added, if anything.'),
    sourceLeadId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('The lead taken to work with ideas.take: the piece is written from it and keeps its address'),
    inputKind: z
      .enum(INTAKE_KINDS)
      .optional()
      .describe('thought — «Свой текст» (default); foreign_post — «Чужой пост»; instruction — «Задание»'),
    research: z
      .enum([...RESEARCH_LEVELS, 'none'])
      .optional()
      .describe('Choose quick, standard or deep when evidence is needed; none for a self-contained/no-search task. Absent does not require search merely because the input is an instruction'),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentIntakeController, 'intakeRun'),
  // The summary is ids and counts; the pasted text never comes back, and the
  // found facts go to the person's card, not to the model.
  untrusted: [],
  suspendSchema: z.union([factSelection, domainQuestionSchema]),
  resumeSchema: z.union([domainQuestionAnswer, factAnswer.strict()]),
  run: withPieceQuestions<PieceCreateResult>(async (ctx, input, emit): Promise<PieceCreateResult | undefined> => {
    const rawAny = input as Record<string, unknown>;
    let snapshotKey =
      input.researchId ??
      (typeof rawAny.snapshotKey === 'string' ? rawAny.snapshotKey : undefined);
    let factKeys = Array.isArray(input.factId)
      ? input.factId
      : Array.isArray(rawAny.factKeys)
        ? (rawAny.factKeys as string[])
        : undefined;
    if (input.references && (snapshotKey || factKeys || input.passages?.length)) throw unspentFailure('INTAKE_RESEARCH_SELECTION_INVALID', 'Use references or the single-capture selection, not both.');
    const intake = ctx.service(IntakeService);
    const resolvedOriginal = input.references ? await originalWords(ctx, input) : null;
    if (resolvedOriginal && !resolvedOriginal.words.trim()) throw unspentFailure('INTAKE_TEXT_MISSING', 'Multiple captures require the actual original author request; search queries cannot replace it.');
    if (input.passages?.length) {
      if (!snapshotKey) throw Object.assign(unspentFailure('INTAKE_RESEARCH_SNAPSHOT_REQUIRED',
        'Exact passages need their owned researchId snapshot; no search or write was started.'), { canReviseInput: true });
      const selected = await intake.selectStoredResearchPassages(ctx.organizationId, ctx.userId, snapshotKey,
        input.passages.map((passage: {sourceUrl: string; revision: string; quote: string}) => ({ sourceUrl: passage.sourceUrl, revision: passage.revision, quote: passage.quote })), factKeys);
      return pieceCreate.run(ctx, { ...input, passages: undefined, researchId: selected.snapshotKey,
        factId: selected.facts.filter(fact => fact.verified && fact.status === 'confirmed').map(fact => fact.factKey!) }, emit);
    }
    const standaloneResearch = snapshotKey?.startsWith('res_') === true;
    let storedEvidence = standaloneResearch
      ? await intake.readStoredResearchEvidence(ctx.organizationId, ctx.userId, snapshotKey!)
      : null;
    if (standaloneResearch && !storedEvidence) {
      throw unspentFailure('INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE', 'The saved research is unavailable to this person; nothing was written or searched.');
    }
    if (input.references) {
      const merged = await intake.mergeStoredResearchEvidence(ctx.organizationId, ctx.userId, input.references);
      storedEvidence = merged.snapshot;
      snapshotKey = merged.snapshot.snapshotKey;
      factKeys = merged.factKeys;
    }
    const selectedResearch = storedEvidence ? selectReusableResearch(storedEvidence, factKeys) : null;
    if (storedEvidence?.sourceSnapshotKey && !storedEvidence.sourceSnapshotKey.startsWith('res_')) {
      const pass = await collectIntakePass(ctx, intake.runStoredResearchForModel(ctx.organizationId, ctx.userId,
        storedEvidence.snapshotKey, selectedResearch!.map(fact => fact.factKey!)), emit,
        { snapshotKey: storedEvidence.snapshotKey, factKeys: selectedResearch!.map(fact => fact.factKey!) });
      if (pass.kind !== 'piece') throw intakeFailure('INTAKE_RESEARCH_INCOMPLETE', 'The original intake still needs sufficient input before writing.');
      return { pieceId: pass.pieceId, code: pass.code, questions: pass.questions, research: null,
        factsKept: selectedResearch!.length, factsCard: 'not_shown', selectionOrigin: 'model',
        reusedResearchId: storedEvidence.snapshotKey, requestBasis: 'original_request',
        ...(pass.voiceScore ? { voiceScore: pass.voiceScore } : {}) };
    }
    if (snapshotKey && !snapshotKey.startsWith('res_')) {
      if (!factKeys?.length) throw unspentFailure('INTAKE_RESEARCH_SELECTION_INVALID', 'Select confirmed fact keys from the saved intake result.');
      const pass = await collectIntakePass(ctx,
        intake.selectResearchForModel(ctx.organizationId, ctx.userId, snapshotKey, factKeys), emit);
      if (pass.kind !== 'piece') throw intakeFailure('INTAKE_RESEARCH_INCOMPLETE', 'The investigation needs assessment before a piece can be written.');
      return { pieceId: pass.pieceId, code: pass.code, questions: pass.questions,
        research: null, factsKept: factKeys.length, factsCard: 'not_shown',
        selectionOrigin: 'model', reusedResearchId: snapshotKey,
        ...(pass.voiceScore ? { voiceScore: pass.voiceScore } : {}) };
    }

    const level: ResearchLevel | null =
      snapshotKey || input.research === 'none'
        ? null
        : input.research ?? null;
    const { words, basis } = resolvedOriginal ?? await originalWords(ctx, input, storedEvidence?.members ? undefined : storedEvidence?.query);
    // A lead is read by the server, by id, in the caller's workspace — never
    // taken from words the model retyped — and only once it was taken to
    // work, as the screen takes it before the intake opens (kcxz.23).
    let text = words;
    if (input.sourceLeadId) {
      // Every refusal here comes before anything is spent, so it gives the
      // message's paid step back (review W4-23 F2): «take it first» must
      // leave room for this call again after ideas.take, in this turn.
      let lead: { title: string; excerpt: string | null; sourceUrl: string; status: string };
      try {
        lead = (await ctx
          .service(ContentLeadService)
          .getLead(ctx.organizationId, input.sourceLeadId)) as typeof lead;
      } catch (error) {
        throw markUnspent(error);
      }
      if (lead.status !== 'ACCEPTED') {
        throw unspentFailure(
          'IDEAS_LEAD_NOT_TAKEN',
          'This lead was not taken to work; take it with ideas.take, then call piece.create again — in this turn. Nothing was written or spent.'
        );
      }
      // The screen's first text of the intake (`leadToIntakePrefill`), then
      // what the person added.
      text = [leadIntakeText(lead), words].filter(Boolean).join('\n\n');
    }
    if (!text) {
      throw unspentFailure('INTAKE_TEXT_MISSING', 'There is nothing to write from: no words and no lead. Nothing was spent.');
    }
    // The door's own limit (`content-intake.dto.ts`) on what the intake reads,
    // which the lead and the added words could pass together (review W4-23 F8).
    if (text.length > INTAKE_INPUT_MAX_CHARS) {
      throw unspentFailure(
        'INTAKE_TEXT_TOO_LONG',
        `Together with the lead the text is longer than the intake reads (${INTAKE_INPUT_MAX_CHARS} characters); nothing was written or spent. Ask the person to shorten what they added.`
      );
    }
    // Keep the submitted request verbatim; attach only the owned research reference,
    // the kind, the interface language, both research options and the lead.
    const body = {
      input: text,
      inputKind: screenInputKind(text, input.inputKind),
      language: ctx.language,
      ...(input.material ? { contextMaterial: input.material } : {}),
      ...(storedEvidence ? { researchReuse: { snapshotKey, factKeys: selectedResearch!.map(fact => fact.factKey!) } } : {}),
      ...(snapshotKey ? { researchDepth: 'none' as const } : {}),
      options: { researchEnabled: level !== null, researchLevel: level ?? 'standard' },
      ...(input.sourceLeadId ? { sourceLeadId: input.sourceLeadId } : {}),
    };
    const finished = (
      pass: IntakePass,
      kept?: number,
      card?: PieceCreated['factsCard'],
      origin?: PieceCreated['selectionOrigin']
    ): PieceCreated => {
      if (pass.kind !== 'piece') {
        throw intakeFailure('INTAKE_FAILED', 'The piece could not be written.');
      }
      return {
        pieceId: pass.pieceId,
        code: pass.code,
        questions: pass.questions,
        research: level,
        ...(kept !== undefined ? { factsKept: kept } : {}),
        ...(kept !== undefined && card ? { factsCard: card } : {}),
        ...(origin ? { selectionOrigin: origin } : {}),
        ...(snapshotKey ? { reusedResearchId: snapshotKey } : {}),
        ...(storedEvidence ? { requestBasis: basis } : {}),
        ...(input.sourceLeadId ? { fromLead: input.sourceLeadId } : {}),
        ...(pass.voiceScore ? { voiceScore: pass.voiceScore } : {}),
      };
    };
    // The second request of the screen: the same body, the rows kept and the
    // first pass's snapshot, so the service continues instead of repeating.
    const continueWith = async (
      selection: FactSelection | null,
      keys: string[],
      card: NonNullable<PieceCreated['factsCard']>
    ) =>
      finished(
        await intakePass(
          ctx,
          {
            ...body,
            researchSelections: keys.slice(0, MAX_SELECTIONS),
            ...(selection?.snapshotKey ? { snapshotKey: selection.snapshotKey } : {}),
          },
          emit,
          input.selection === 'person' ? 'person' : 'model'
        ),
        Math.min(keys.length, MAX_SELECTIONS),
        card
      );

    if (ctx.resumeData !== undefined) {
      const answer = factAnswer.safeParse(ctx.resumeData);
      if (!answer.success) {
        throw intakeFailure('INPUT_NEEDS_PERSON', 'The answer on the facts card was not understood.');
      }
      // The payload Mastra kept on the server, never the browser's copy. No
      // stored card, no answer: rows the browser names were never offered,
      // and a repeat would pay for the search again (review W2 F8).
      const stored = factSelection.safeParse(ctx.suspendPayload);
      if (!stored.success) {
        throw intakeFailure('INPUT_NEEDS_PERSON', 'The facts to choose from are no longer known; nothing was spent. Run the intake again if the person wants it.');
      }
      // The first pass is kept for an hour (`INTAKE_SNAPSHOT_TTL_SECONDS`);
      // after that the service would silently search again under this one
      // paid slot. Say so instead, before anything is spent.
      const askedAt = stored.data.askedAt;
      if (typeof askedAt === 'number' && Date.now() - askedAt > INTAKE_ANSWER_WINDOW_MS) {
        throw intakeFailure(
          'INTAKE_SELECTION_EXPIRED',
          'The found facts are kept for an hour and that hour has passed; nothing was written or spent. Writing the piece now would search the web again and be paid again — ask the person first.'
        );
      }
      return continueWith(
        stored.data,
        chosenIds(stored.data.options, answer.data as Record<string, unknown>, 'factKeys'),
        'answered'
      );
    }

    const pass = await intakePass(ctx, body, emit,
      input.selection === 'person' ? 'person' : 'model');
    if (pass.kind === 'piece') {
      return finished(
        pass,
        selectedResearch?.length,
        selectedResearch ? 'not_shown' : undefined,
        selectedResearch ? 'model' : undefined
      );
    }
    if (pass.kind === 'research') return pass.research;
    // Return actual evidence before any model assessment or routine choice.
    // An empty/partial investigation is not a draft or a successful facts card.
    if (input.selection !== 'person') return pass.research;
    if (!pass.selection.options.length || ['empty', 'failed', 'needs_clarification'].includes(pass.research.summary?.status) || pass.research.summary?.periodStatus === 'empty') return pass.research;
    if (!ctx.suspend) return pass.research;
    // When the card was asked: the first pass it continues lives an hour.
    await ctx.suspend({ ...pass.selection, askedAt: Date.now() });
    return undefined;
  }),
  // Its open questions are the person's to answer: piece.answer is refused
  // for this piece in the same request (kcxz.31, D1).
  personQuestions: {
    opens: (summary) =>
      Number(summary.questions) > 0 && typeof summary.pieceId === 'string' ? summary.pieceId : null,
  },
  summarize: (output) => ('outcome' in output ? { ...researchModelView(output), ...('pieceId' in output ? { pieceId: output.pieceId } : {}), note: 'Research ran; no piece was written. Assess the evidence and gaps. Read later retained source sections through piece.read using find/ranges, then use confirmed factKeys or exact sourceUrl/revision/quote passages with piece.create.from-research without another search. Refine search only for still-missing evidence. No human card is waiting.' } : {
    ...(output.selectionOrigin || output.reusedResearchId ? { outcome: 'created' as const } : {}),
    pieceId: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.research ? { research: output.research } : {}),
    ...(output.factsKept !== undefined ? { factsKept: output.factsKept } : {}),
    ...(output.factsCard ? { factsCard: output.factsCard } : {}),
    ...(output.selectionOrigin ? { selectionOrigin: output.selectionOrigin } : {}),
    ...(output.reusedResearchId ? { reusedResearchId: output.reusedResearchId } : {}),
    ...(output.requestBasis ? { requestBasis: output.requestBasis } : {}),
    ...(output.leftToAuthor?.length ? {leftToAuthor: output.leftToAuthor,
      note: 'These personal facts were explicitly delegated but cannot be invented. The saved core uses a neutral formulation around the gaps; say what remains unknown and continue the original requested steps.'} : {}),
    ...(output.postLink ? {postLink: output.postLink} : {}),
    ...(output.fromLead
      ? {
          fromLead: {
            leadId: output.fromLead,
            wentIn: 'the lead’s title, excerpt and address, as stored, then the words the person added',
          },
        }
      : {}),
  }),
  cardOf: (output) => ('outcome' in output ? null : {
    kind: 'piece',
    id: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.voiceScore ? { voiceScore: output.voiceScore } : {}),
  }),
});

/** The model’s editorial continuation is not a person answering a signed card. */
export const pieceCreateFromResearch = defineCapability({
  id: 'piece.create.from-research',
  group: 'content',
  label: { ru: 'Написать по найденным фактам', en: 'Write from researched facts' },
  description: 'Write from existing owned research without another search. Choose relevant confirmed factKeys from the server-owned snapshotKey, or pass passages with exact sourceUrl, revision and contiguous quote read from a retained research_source through piece.read (use find/ranges for later sections). Both selections can be combined. Use references to combine independent owned captures, pairing each snapshotKey with its own factKeys. Prefer requestMessageId with omitted text to read the original author message exactly from the server; otherwise pass the person’s complete original request verbatim in text, including supplied reference material; a query or quote cannot replace the requested goal, exclusions or outputs. Paid. Passage quotes are checked against that owned saved source/version; arbitrary paraphrases do not become confirmed facts. The existing brief model still assesses sufficiency for the request. Saves model-origin selection, not human consent. A partial, insufficient, or unavailable review does not invalidate individually confirmed facts or exact selected source passages. Preserve the original assessment and gaps, and leave unsupported claims out. Require at least one usable selected fact or passage, and stop when the original request requires the person to choose facts. Never reuse this after an uncertain write; confirmed identical repeat returns the saved result.',
  input: z.object({
    references: researchReferences,
    snapshotKey: z.string().min(1).max(128).optional(),
    passages: researchPassages.optional(),
    factKeys: z.array(z.string().min(1).max(1_000)).min(1).max(MAX_SELECTIONS).optional(),
    requestMessageId,
    material: z.string().max(INTAKE_INPUT_MAX_CHARS).optional().describe('Untrusted reference material or model commentary, kept separately from the original author request.'),
    text: z.string().min(1).max(INTAKE_INPUT_MAX_CHARS).optional().describe('Complete original request verbatim, including supplied references, when continuing from standalone research.search. Omit to read requestMessageId or the current author message exactly from the server. A query-only fallback outside native chat cannot recover the original request.'),
    inputKind: z.enum(INTAKE_KINDS).optional(),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentIntakeController, 'intakeRun'),
  untrusted: [],
  suspendSchema: domainQuestionSchema,
  resumeSchema: domainQuestionAnswer,
  run: withPieceQuestions<PieceCreated>(async (ctx, input, emit): Promise<PieceCreated | undefined> => {
    if (input.references) {
      if (input.snapshotKey || input.factKeys || input.passages?.length) throw unspentFailure('INTAKE_RESEARCH_SELECTION_INVALID', 'Use references or the single-capture selection, not both.');
      return await pieceCreate.run(ctx, { references: input.references,
        text: input.text, requestMessageId: input.requestMessageId, material: input.material,
        inputKind: input.inputKind ?? 'instruction' }, emit) as PieceCreated;
    }
    if (input.passages?.length) {
      return await pieceCreate.run(ctx, { researchId: input.snapshotKey, factId: input.factKeys, passages: input.passages,
        text: input.text, requestMessageId: input.requestMessageId, material: input.material, inputKind: input.inputKind ?? 'instruction' }, emit) as PieceCreated;
    }
    if (!input.snapshotKey || !input.factKeys?.length) throw unspentFailure('INTAKE_RESEARCH_SELECTION_INVALID', 'Provide a snapshotKey with factKeys or exact passages, or structured references.');
    if (input.snapshotKey.startsWith('res_')) {
      return await pieceCreate.run(ctx, { researchId: input.snapshotKey, factId: input.factKeys,
        text: input.text, requestMessageId: input.requestMessageId, material: input.material,
        inputKind: input.inputKind ?? 'instruction' }, emit) as PieceCreated;
    }
    const intake = ctx.service(IntakeService);
    const pass = await collectIntakePass(ctx,
      intake.selectResearchForModel(ctx.organizationId, ctx.userId, input.snapshotKey, input.factKeys), emit);
    if (pass.kind !== 'piece') throw intakeFailure('INTAKE_RESEARCH_INCOMPLETE', 'The investigation needs assessment before a piece can be written.');
    return { pieceId: pass.pieceId, code: pass.code, questions: pass.questions,
      research: null, factsKept: input.factKeys.length, factsCard: 'not_shown', selectionOrigin: 'model', reusedResearchId: input.snapshotKey,
      ...(pass.voiceScore ? { voiceScore: pass.voiceScore } : {}) };
  }),
  personQuestions: { opens: (summary) => Number(summary.questions) > 0 && typeof summary.pieceId === 'string' ? summary.pieceId : null },
  summarize: (output) => ({ ...output, outcome: 'created', note: 'The requested piece is saved with model-origin fact selection. No facts card is waiting; continue other requested steps.' }),
  cardOf: (output) => ({
    kind: 'piece',
    id: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.voiceScore ? { voiceScore: output.voiceScore } : {}),
  }),
});

/** The id the screen gives a question: its material key, or its brief field. */
const QUESTION_IDS = [...PIECE_BRIEF_FIELDS, ...INTERVIEW_ASK_KEYS] as [
  string,
  ...string[],
];
const questionId = z
  .enum(QUESTION_IDS)
  .describe('Question id from piece.open (`questions[].id`)');


export const pieceAnswer = defineCapability({
  id: 'piece.answer',
  group: 'content',
  label: { ru: 'Ответить на вопросы заготовки', en: 'Answer the piece\'s questions' },
  description:
    'Open the piece’s exact saved manual questions in the conversation, then rewrite its core once after every question is answered or explicitly delegated. In native chat pass only pieceId; the human answers on the native card, never through model-generated answers. Choice, own words, confirmation and explicit delegation retain their provenance. Unanswered questions do not imply delegation. Over MCP the existing manual answers/decide request applies. Returns how many questions remain.',
  input: z.object({
    pieceId,
    answers: z
      .array(
        z.object({
          questionId,
          text: z.string().min(1).max(2000).describe('The person\'s answer, verbatim'),
        })
      )
      .max(QUESTION_IDS.length)
      .optional(),
    decide: z
      .array(questionId)
      .max(QUESTION_IDS.length)
      .optional()
      .describe('Questions the person gave to us: «Решите за меня»'),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentPieceController, 'answer'),
  untrusted: [],
  // Refused for a piece whose questions this request has just opened (kcxz.31, D1).
  suspendSchema: domainQuestionSchema,
  resumeSchema: domainQuestionAnswer,
  nativeDomainQuestions: true,
  personQuestions: { answers: (input) => input.pieceId },
  run: async (ctx, input, emit): Promise<PieceAnswered | undefined> => {
    if (ctx.suspend) {
      if (ctx.resumeData !== undefined && isDomainQuestionCard(ctx.suspendPayload)) return resumePieceQuestions<PieceAnswered>(ctx, emit);
      // Model arguments are never a person's reply to questions it has just opened.
      const detail = await ctx.service(PieceService).detail(ctx.organizationId, input.pieceId, ctx.language);
      return askPieceQuestions(ctx, { pieceId: input.pieceId, code: detail.piece.code ?? null,
        questions: detail.core?.questions?.items?.length ?? 0 }, emit);
    }
    return applyPieceQuestionAnswers(ctx, input, emit);
  },
  summarize: (output) => ({
    pieceId: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.leftToAuthor?.length
      ? {
          leftToAuthor: output.leftToAuthor,
          leftToAuthorCount: output.leftToAuthor.length,
          note: `These ${output.leftToAuthor.length} ask for the author’s own experience; nothing was invented for them and the core goes around them. Do not say they were decided. Say what remains unknown and continue the original requested steps. The person may add their experience in this conversation later; the saved core stays general until then.`,
        }
      : {}),
    ...(output.postLink
      ? {
          postLink: output.postLink,
          linkNote: 'The link question was closed with «Без ссылки»: we never invent a link, so the posts go without one. Say so in a few words; the person can add a link on the piece.',
        }
      : {}),
  }),
  cardOf: (output) => ({
    kind: 'piece',
    id: output.pieceId,
    code: output.code,
    questions: output.questions,
  }),
});

/** Rows of the list the model reads; the rest is on the «Контент» screen. */
const PIECE_LIST_MAX = 20;

type PieceListed = {
  total: number;
  pieces: Array<{ id: string; code: string; title: string; date: string; archived: boolean }>;
};

export const pieceList = defineCapability({
  id: 'piece.list',
  group: 'content',
  label: { ru: 'Найти заготовки', en: 'Find pieces' },
  description:
    `List the workspace's pieces (заготовки), newest last, as the «Контент» table: id, code, title, date. Optional words to search in titles and cores, and archived ones on request. At most ${PIECE_LIST_MAX} rows; \`total\` says how many matched.`,
  input: z.object({
    search: z.string().max(200).optional().describe('Words to find in titles and cores'),
    includeArchived: z.boolean().optional().describe('Also list archived pieces'),
  }),
  risk: 'read',
  door: door(ContentPieceController, 'list'),
  // Titles come from what people wrote or pasted.
  untrusted: ['workspace-text'],
  run: async (ctx, input): Promise<PieceListed> => {
    const listed = await ctx.service(PieceService).list(
      ctx.organizationId,
      {
        ...(input.search?.trim() ? { q: input.search.trim() } : {}),
        ...(input.includeArchived ? { includeArchived: true } : {}),
      },
      ctx.language
    );
    const rows = listed.pieces ?? [];
    return {
      total: rows.length,
      pieces: rows.slice(-PIECE_LIST_MAX).map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        date: row.date,
        archived: !!row.archivedAt,
      })),
    };
  },
  summarize: (output) => ({ total: output.total, pieces: output.pieces }),
});

/** Question texts the model reads, at most; the card shows them in full. */
const QUESTION_TEXT_MAX = 300;
/** Adaptations the model reads, at most (newest kept); the total is always given. */
const OPENED_ADAPTATIONS_MAX = 20;
const CHANNEL_NAME_MAX = 120;

type PieceOpened = {
  pieceId: string;
  code: string;
  title: string;
  archived: boolean;
  /** `false` for an old piece whose core was never extracted. */
  hasCore: boolean;
  /** How many adaptations the piece has; `adaptationList` may show fewer. */
  adaptations: number;
  /**
   * Which adaptation is which (`kcxz.38`, R1): the id every adaptation.* and
   * plan.* capability takes, the channel's name and where it stands — so «in
   * the adaptation for channel X» resolves here, not on the card.
   */
  adaptationList: Array<{ id: string; channel: string; state: PlanSlotState }>;
  questions: Array<{ id: string; question: string; options?: string[] }>;
  /** Added material the core has not read yet: offer piece.core.rebuild. */
  materialPending: boolean;
  /** Earlier cores, oldest first — what piece.core.restore takes. No texts. */
  versions: Array<{ index: number; replacedAt: string; writtenBy: string }>;
};

export const pieceOpen = defineCapability({
  id: 'piece.open',
  group: 'content',
  label: { ru: 'Открыть заготовку', en: 'Open a piece' },
  description:
    'Open one piece: shows its native editor and returns code/title, adaptation ids with channel/state, open questions, pending material and earlier core versions. For the actual full core, original material, task or adaptation text call piece.read, continuing ranges when needed. Do not ask the person to copy accessible text from the card.',
  input: z.object({ pieceId }),
  risk: 'read',
  card: 'piece',
  door: door(ContentPieceController, 'detail'),
  // The title and the questions are written from the person's or a foreign
  // text; both reach the model only as data.
  untrusted: ['workspace-text', 'foreign-post'],
  run: async (ctx, input): Promise<PieceOpened> => {
    const detail = await ctx
      .service(PieceService)
      .detail(ctx.organizationId, input.pieceId, ctx.language);
    const items = detail.core?.questions?.items ?? [];
    return {
      pieceId: detail.piece.id,
      code: detail.piece.code,
      title: detail.piece.title,
      archived: !!detail.piece.archivedAt,
      hasCore: !!detail.core,
      adaptations: detail.adaptations?.length ?? 0,
      adaptationList: (detail.adaptations ?? []).slice(-OPENED_ADAPTATIONS_MAX).map((row) => ({
        id: String(row.id),
        channel: String(row.integrationName ?? '').slice(0, CHANNEL_NAME_MAX),
        state: slotStateOf(row),
      })),
      questions: items.map((item) => ({
        id: item.key ?? item.field,
        question: String(item.question ?? '').slice(0, QUESTION_TEXT_MAX),
        ...(item.options?.length
          ? {
              options: item.options
                .filter((option) => option !== item.ownOption)
                .slice(0, 4)
                .map((option) => String(option).slice(0, QUESTION_TEXT_MAX)),
            }
          : {}),
      })),
      materialPending: detail.core?.materialPending === true,
      versions: (detail.core?.revisions ?? []).map((revision, index) => ({
        index,
        replacedAt: revision.replacedAt,
        writtenBy: revision.writtenBy,
      })),
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: (output) => ({
    kind: 'piece',
    id: output.pieceId,
    code: output.code,
    questions: output.questions.length,
  }),
});

export const pieceArchive = defineCapability({
  id: 'piece.archive',
  group: 'content',
  label: { ru: 'Убрать заготовку в архив', en: 'Archive a piece' },
  description:
    'Move a piece to the archive (hidden from the list, kept with its adaptations), or bring it back with `archived: false`. Reversible. Only when the person asked to archive or hide the piece. A request to delete is not a request to archive: where deleting is not offered, say it is done in Content Factory and offer the archive in one line — do not archive, unschedule or change anything by yourself.',
  input: z.object({
    pieceId,
    archived: z.boolean().describe('true — to the archive; false — back to the list'),
  }),
  risk: 'write',
  door: door(ContentPieceController, 'archive'),
  untrusted: [],
  run: async (ctx, input) => {
    await ctx
      .service(PieceService)
      .archive(ctx.organizationId, input.pieceId, input.archived);
    return { pieceId: input.pieceId, archived: input.archived };
  },
  summarize: (output) => ({ pieceId: output.pieceId, archived: output.archived }),
});

export const pieceDelete = defineCapability({
  id: 'piece.delete',
  group: 'content',
  label: { ru: 'Удалить заготовку', en: 'Delete a piece' },
  description:
    'Delete a piece (заготовка) for good, with its adaptations. The person approves it on a card first. To only hide a piece, archive it instead.',
  input: z.object({ pieceId }),
  risk: 'confirm',
  door: door(ContentPieceController, 'deletePiece'),
  untrusted: [],
  // Before parking an approval card, verify the piece exists in this workspace (A27).
  beforeApproval: async (ctx, input) => {
    const piece = await ctx
      .service(PieceService)
      .approvalSubject(ctx.organizationId, input.pieceId);
    if (!piece) {
      throw codedFailure(
        'PIECE_NOT_FOUND',
        `That piece (${input.pieceId}) is not in this workspace; check the id before trying again.`
      );
    }
    return null;
  },
  // The card names the piece by its code and title, read in the caller's
  // workspace for the stored id — not by what the model said it was.
  describeApproval: async (ctx, input) => {
    const piece = await ctx
      .service(PieceService)
      .approvalSubject(ctx.organizationId, input.pieceId);
    const ru = ctx.language === 'ru';
    if (!piece) {
      return ru
        ? `Удалить заготовку ${input.pieceId} — в этом пространстве её нет, удалять нечего`
        : `Delete piece ${input.pieceId} — there is no such piece in this workspace`;
    }
    const title = piece.title.trim() || (ru ? 'без названия' : 'untitled');
    return ru
      ? `Удалить заготовку ${piece.code} «${title}» вместе с её адаптациями`
      : `Delete piece ${piece.code} “${title}” with its adaptations`;
  },
  run: async (ctx, input) => {
    await ctx.service(PieceService).delete(ctx.organizationId, input.pieceId);
    return { pieceId: input.pieceId, deleted: true };
  },
  summarize: (output) => ({ pieceId: output.pieceId, deleted: output.deleted }),
});
