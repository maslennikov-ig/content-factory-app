import { z } from 'zod';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { ContentIntakeController } from '@contentfactory/backend/api/routes/content-intake.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { IntakeService } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service';
import { INTAKE_SNAPSHOT_TTL_SECONDS } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake-snapshot.store';
import {
  INTAKE_INPUT_MAX_CHARS,
  INTERVIEW_ASK_KEYS,
  type PieceAnswerRequestV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PIECE_BRIEF_FIELDS } from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-piece.dto';
import {
  defineCapability,
  door,
  type CapabilityEmit,
  type CapabilityRunContext,
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
} from './selection';
import { slotStateOf } from './plan.capabilities';
import type { PlanSlotState } from '../agent-parts.contract';

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
const MAX_SELECTIONS = 50;

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
};

type IntakePass =
  | { kind: 'piece'; pieceId: string; code: string | null; questions: number }
  | { kind: 'selection'; selection: FactSelection };

/**
 * One request of the door: the same generator, its events forwarded as
 * transient progress. Ends at the piece, or at the research pause.
 */
const intakePass = async (
  ctx: CapabilityRunContext,
  body: Record<string, unknown>,
  emit: CapabilityEmit
): Promise<IntakePass> => {
  const intake = ctx.service(IntakeService);
  const plan = await intake.prepare(ctx.organizationId, body);
  let created: Extract<IntakePass, { kind: 'piece' }> | null = null;
  let selection: FactSelection | null = null;
  for await (const event of intake.run(ctx.organizationId, plan, ctx.userId)) {
    const named = event as { name: string } & Record<string, any>;
    await emit({
      kind: 'progress',
      data: { capability: 'piece.create', stage: named.name },
      transient: true,
    });
    if (named.name === 'piece') {
      created = { kind: 'piece', pieceId: named.pieceId, code: named.code ?? null, questions: 0 };
    }
    // The service yields `questions` after the piece (`intake.service.ts`);
    // `piece-questions` is the name the wire contract also declares. Either
    // one is the open questions the person answers on the piece — counted,
    // not left at 0 (kcxz.29, D4).
    if ((named.name === 'questions' || named.name === 'piece-questions') && created) {
      created.questions = Array.isArray(named.questions) ? named.questions.length : 0;
    }
    // The research pause: the screen stops here and shows the rows to keep.
    if (named.name === 'research-selection-required') {
      const facts: any[] = Array.isArray(named.facts) ? named.facts : [];
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
      throw eventFailure(named.code, named.message, 'INTAKE_FAILED', 'The piece could not be written.');
    }
  }
  if (created) return created;
  if (selection) return { kind: 'selection', selection };
  throw intakeFailure('INTAKE_FAILED', 'The piece could not be written.');
};

/** What the product keeps by itself — the screen's «Продолжить» untouched. */
const defaultSelection = (selection: FactSelection) => defaultIds(selection.options);

export const pieceCreate = defineCapability({
  id: 'piece.create',
  group: 'content',
  label: { ru: 'Написать заготовку', en: 'Write a piece' },
  description:
    'Write a new piece (заготовка) — the intake of «Новый материал». Paid. Pass the person\'s words verbatim and the kind: thought («Свой текст», default), foreign_post («Чужой пост» — somebody else\'s text to rework) or instruction («Задание» — a task: what to write about). A message that is only a link is read as a link. Search the web (`research`) only when the person asks for it; with search, the person may be shown the found facts to keep, and the call continues with their choice. Returns the piece id, its code and how many open questions it has; the text is on the card, do not retype it. `factsKept` with `factsCard` means the facts are already chosen and the piece stands on them: never ask the person to look at or mark facts again.',
  input: z.object({
    text: z
      .string()
      .min(1)
      .max(INTAKE_INPUT_MAX_CHARS)
      .describe('The person\'s words, verbatim'),
    inputKind: z
      .enum(INTAKE_KINDS)
      .optional()
      .describe('thought — «Свой текст» (default); foreign_post — «Чужой пост»; instruction — «Задание»'),
    research: z
      .enum(RESEARCH_LEVELS)
      .optional()
      .describe('Web search for facts, only on request: quick, standard or deep. Absent — no search'),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentIntakeController, 'intakeRun'),
  // The summary is ids and counts; the pasted text never comes back, and the
  // found facts go to the person's card, not to the model.
  untrusted: [],
  suspendSchema: factSelection,
  resumeSchema: factAnswer,
  run: async (ctx, input, emit): Promise<PieceCreated | undefined> => {
    const level: ResearchLevel | null = input.research ?? null;
    // Exactly what the screen sends (`buildIntakePayload`): the trimmed text,
    // the kind, the interface language and both research options.
    const body = {
      input: input.text.trim(),
      inputKind: screenInputKind(input.text, input.inputKind),
      language: ctx.language,
      options: { researchEnabled: level !== null, researchLevel: level ?? 'standard' },
    };
    const finished = (
      pass: IntakePass,
      kept?: number,
      card?: PieceCreated['factsCard']
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
          emit
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

    const pass = await intakePass(ctx, body, emit);
    if (pass.kind === 'piece') return finished(pass);
    // Nothing to choose, or no card to ask on (MCP): the product decides, with
    // the defaults the screen would send untouched.
    if (!pass.selection.options.length || !ctx.suspend) {
      return continueWith(pass.selection, defaultSelection(pass.selection), 'not_shown');
    }
    // When the card was asked: the first pass it continues lives an hour.
    await ctx.suspend({ ...pass.selection, askedAt: Date.now() });
    return undefined;
  },
  // Its open questions are the person's to answer: piece.answer is refused
  // for this piece in the same request (kcxz.31, D1).
  personQuestions: {
    opens: (summary) =>
      Number(summary.questions) > 0 && typeof summary.pieceId === 'string' ? summary.pieceId : null,
  },
  summarize: (output) => ({
    pieceId: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.research ? { research: output.research } : {}),
    ...(output.factsKept !== undefined ? { factsKept: output.factsKept } : {}),
    ...(output.factsCard ? { factsCard: output.factsCard } : {}),
  }),
  cardOf: (output) => ({
    kind: 'piece',
    id: output.pieceId,
    code: output.code,
    questions: output.questions,
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
const isMaterialQuestion = (id: string) => id.startsWith('ask-');

type PieceAnswered = {
  pieceId: string;
  code: string | null;
  questions: number;
  /**
   * Questions about the author's own experience that nobody answered (`wffi`):
   * under the default policy we never invent them, the core goes around the
   * gap. The agent must not say they were decided.
   */
  leftToAuthor?: string[];
  /**
   * «Какую ссылку поставить в пост?» was closed by this call as «Без ссылки»
   * (`kcxz.37`, F9): everything was handed over and a link is never invented.
   */
  postLink?: 'none';
};

export const pieceAnswer = defineCapability({
  id: 'piece.answer',
  group: 'content',
  label: { ru: 'Ответить на вопросы заготовки', en: 'Answer the piece\'s questions' },
  description:
    'Answer the open questions of a piece and rewrite its core — the piece page\'s «Ответить». Paid. Only after the person replied: pass their answers verbatim by question id (from piece.open). A question left out is decided by us («Решите за меня»); pass `decide` when the person said so. Calling with no answers decides every open question. Never in the same answer that wrote the piece — the person has not seen its questions yet; that call is refused. Returns how many questions are still open.',
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
  personQuestions: { answers: (input) => input.pieceId },
  run: async (ctx, input, emit): Promise<PieceAnswered> => {
    // The body the piece page sends (`piece.container.tsx`): answers by field,
    // a material question by its key on `facts`; «Решите за меня» by field.
    const given = (input.answers ?? []).map((answer) =>
      isMaterialQuestion(answer.questionId)
        ? { field: 'facts', key: answer.questionId, text: answer.text }
        : { field: answer.questionId, text: answer.text }
    );
    // A material question left unanswered is delegated by the service itself.
    const decide = [
      ...new Set((input.decide ?? []).filter((id) => !isMaterialQuestion(id))),
    ];
    const request = {
      ...(given.length ? { answers: given } : {}),
      ...(decide.length ? { decide } : {}),
    } as PieceAnswerRequestV1;
    const pieces = ctx.service(PieceService);
    const plan = await pieces.prepareAnswer(
      ctx.organizationId,
      input.pieceId,
      request,
      ctx.language
    );
    const toldKeys = new Set(given.flatMap((answer) => ('key' in answer ? [answer.key] : [])));
    const linkBefore = plan.core?.postLink;
    const openMaterial = (plan.core?.questions?.items ?? []).filter(
      (question) => question.key && !toldKeys.has(question.key)
    );
    let answered: PieceAnswered | null = null;
    for await (const event of pieces.answer(ctx.organizationId, plan, ctx.userId)) {
      const named = event as { name: string } & Record<string, any>;
      await emit({
        kind: 'progress',
        data: { capability: 'piece.answer', stage: named.name },
        transient: true,
      });
      if (named.name === 'piece') {
        answered = { pieceId: named.pieceId, code: named.code ?? null, questions: 0 };
        // What the service stored for them: an empty model answer is a gap.
        const stored: Array<{ key?: string; origin?: string; text?: string }> =
          named.core?.questions?.answered ?? [];
        const gaps = openMaterial.filter((question) =>
          stored.some(
            (one) => one.key === question.key && one.origin === 'model' && !one.text?.trim()
          )
        );
        if (gaps.length) {
          answered.leftToAuthor = gaps.map((question) =>
            shortQuestion(question.question, QUOTED_QUESTION_MAX)
          );
        }
        const link = named.core?.postLink;
        if (!linkBefore && link && link.url === null) answered.postLink = 'none';
      }
      if (named.name === 'questions' && answered) {
        answered.questions = Array.isArray(named.questions) ? named.questions.length : 0;
      }
      if (named.name === 'error') {
        throw eventFailure(named.code, named.message, 'PIECE_NOT_SAVED', 'The answers could not be saved.');
      }
    }
    if (!answered) {
      throw intakeFailure('PIECE_NOT_SAVED', 'The answers could not be saved.');
    }
    return answered;
  },
  summarize: (output) => ({
    pieceId: output.pieceId,
    code: output.code,
    questions: output.questions,
    ...(output.leftToAuthor?.length
      ? {
          leftToAuthor: output.leftToAuthor,
          leftToAuthorCount: output.leftToAuthor.length,
          note: `These ${output.leftToAuthor.length} ask for the author’s own experience; nothing was invented for them and the core goes around them. Do not say they were decided. Your reply quotes each question in «» word for word as given here — not shortened, not retold and says the person can add their own experience there in their own words — also when a limit stops the turn right after this; the core stays general until then.`,
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
    'Open one piece: shows it on the card beside the chat and returns its code, title, its adaptations (`adaptationList`: id, channel name, state — draft, reserve, scheduled, published or error; the id is what adaptation.* and plan.* take, so find «the adaptation for channel X» here, never send the person to the card for it), its open questions (id, question, suggested options) — what piece.answer takes —, whether added material waits for a rebuild, and its earlier core versions (index, date, who wrote it) — what piece.core.restore takes. The core text stays on the card; do not ask for it.',
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
    'Move a piece to the archive (hidden from the list, kept with its adaptations), or bring it back with `archived: false`. Reversible; use it instead of deleting when the person only wants a piece out of the way.',
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
