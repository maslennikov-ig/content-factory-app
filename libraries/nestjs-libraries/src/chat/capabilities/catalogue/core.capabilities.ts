import { z } from 'zod';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import {
  PIECE_CORE_EDIT_MAX,
  PIECE_CORE_REVISIONS_MAX,
  PIECE_MATERIAL_APPEND_MAX,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/core-edit';
import {
  defineCapability,
  door,
  type CapabilityEmit,
  type CapabilityRunContext,
} from '../capability.types';
import { proposalTarget } from '../capability.context';
import {
  RESEARCH_LEVELS,
  chosenIds,
  codedFailure,
  factAnswer,
  factOptions,
  factSelection,
  hostOf,
  needsPerson,
  selectionAnswer,
  selectionQuestion,
  type ResearchLevel,
  type SelectionOption,
} from './selection';

/**
 * The core of a piece (spec §5.2 «Контент», `kcxz.13`): hand edit, added
 * material, rebuild, versions, research, «Проверить факты», «Переписать…».
 * Each calls the method its door calls, with the body the piece page sends
 * (`piece-core-tab.tsx`, `adaptation-review.tsx`).
 *
 * Accepting what a paid step proposed — found facts, fact-check or rewrite
 * changes — is the person's choice on a selection card: the paid capability
 * pauses after the proposal (`suspend`) and the answer resumes the same call,
 * which then posts the accept door's body. The proposal's texts, its snapshot
 * key and its signed token stay in the payload Mastra keeps on the server;
 * the model reads counts only and never names a row. Over MCP there is no
 * card, so these refuse before anything is spent.
 */

const pieceId = z.string().min(1).max(128).describe('Piece id from workspace.snapshot or piece.list');

/** The current core, which the edit doors take as `expected`. */
const currentCore = async (ctx: CapabilityRunContext, id: string) => {
  const detail = await ctx.service(PieceService).detail(ctx.organizationId, id, ctx.language);
  if (!detail.core) {
    throw codedFailure(
      'PIECE_CORE_MISSING',
      ctx.language === 'ru' ? 'У заготовки ещё нет сути.' : 'The piece has no core yet.'
    );
  }
  return detail.core;
};

const progress = (emit: CapabilityEmit, capability: string, stage: string) =>
  emit({ kind: 'progress', data: { capability, stage }, transient: true });

const pieceCard = (output: { pieceId: string }) => ({ kind: 'piece' as const, id: output.pieceId });

/* ---- Hand edit, material, rebuild, versions ------------------------------- */

export const pieceCoreEdit = defineCapability({
  id: 'piece.core.edit',
  group: 'content',
  label: { ru: 'Заменить текст сути', en: 'Replace the core text' },
  description:
    'Replace the core of a piece with a text the person gave, verbatim — the hand edit of the piece page. Not for writing: to change the core with AI use piece.rewrite or piece.core.rebuild. The old text is kept as a version.',
  input: z.object({
    pieceId,
    text: z.string().min(1).max(PIECE_CORE_EDIT_MAX).describe('The new core, the person’s words verbatim'),
  }),
  risk: 'write',
  card: 'piece',
  door: door(ContentPieceController, 'editCore'),
  untrusted: [],
  run: async (ctx, input) => {
    const core = await currentCore(ctx, input.pieceId);
    const saved = await ctx
      .service(PieceService)
      .editCore(ctx.organizationId, input.pieceId, { text: input.text, expected: core.text }, ctx.language);
    return { pieceId: input.pieceId, versions: saved.revisions };
  },
  summarize: (output) => ({ pieceId: output.pieceId, versions: output.versions }),
  cardOf: pieceCard,
});

export const pieceMaterialAdd = defineCapability({
  id: 'piece.material.add',
  group: 'content',
  label: { ru: 'Дописать материал', en: 'Add material' },
  description:
    'Add the person’s new material to a piece, verbatim («Дописать материал»). The core does not change until it is rebuilt: offer piece.core.rebuild afterwards, or run it when the person asked for the core to use the material.',
  input: z.object({
    pieceId,
    text: z.string().min(1).max(PIECE_MATERIAL_APPEND_MAX).describe('The material, verbatim'),
  }),
  risk: 'write',
  card: 'piece',
  door: door(ContentPieceController, 'appendMaterial'),
  untrusted: [],
  run: async (ctx, input) => {
    const added = await ctx
      .service(PieceService)
      .appendMaterial(ctx.organizationId, input.pieceId, { text: input.text }, ctx.language);
    return { pieceId: input.pieceId, materialAdded: added.addedMaterial.length, rebuildPending: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: pieceCard,
});

export const pieceCoreRebuild = defineCapability({
  id: 'piece.core.rebuild',
  group: 'content',
  label: { ru: 'Пересобрать суть', en: 'Rebuild the core' },
  description:
    'Rewrite the core from all the piece’s material, including what was added («Пересобрать суть»). Paid. The old text is kept as a version.',
  input: z.object({ pieceId }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentPieceController, 'rebuildCore'),
  untrusted: [],
  run: async (ctx, input, emit) => {
    await progress(emit, 'piece.core.rebuild', 'rebuild-started');
    const rebuilt = await ctx
      .service(PieceService)
      .rebuildCore(ctx.organizationId, input.pieceId, ctx.language);
    return { pieceId: input.pieceId, versions: rebuilt.revisions };
  },
  summarize: (output) => ({ pieceId: output.pieceId, versions: output.versions }),
  cardOf: pieceCard,
});

export const pieceCoreRestore = defineCapability({
  id: 'piece.core.restore',
  group: 'content',
  label: { ru: 'Вернуть версию сути', en: 'Restore a core version' },
  description:
    'Make an earlier version of the core current again («Вернуть эту версию»). Take `index` and `replacedAt` from piece.open `versions`. The text being replaced is kept as a version too, so this is reversible.',
  input: z.object({
    pieceId,
    index: z.number().int().min(0).max(PIECE_CORE_REVISIONS_MAX - 1).describe('`versions[].index` from piece.open'),
    replacedAt: z.string().min(1).max(40).describe('`versions[].replacedAt` from piece.open'),
  }),
  risk: 'write',
  card: 'piece',
  door: door(ContentPieceController, 'restoreCore'),
  untrusted: [],
  run: async (ctx, input) => {
    const core = await currentCore(ctx, input.pieceId);
    const restored = await ctx.service(PieceService).restoreCore(
      ctx.organizationId,
      input.pieceId,
      { index: input.index, replacedAt: input.replacedAt, expected: core.text },
      ctx.language
    );
    return { pieceId: input.pieceId, versions: restored.revisions };
  },
  summarize: (output) => ({ pieceId: output.pieceId, versions: output.versions }),
  cardOf: pieceCard,
});

/* ---- Research with the facts card ---------------------------------------- */

const RESEARCH_QUESTION = {
  ru: 'Поиск нашёл опоры. Отметьте, что добавить в суть.',
  en: 'The search found facts. Mark the ones to add to the core.',
};

type Researched = {
  pieceId: string;
  level: ResearchLevel;
  /** Rows the search offered; 0 means nothing to add and nothing changed. */
  offered: number;
  kept: number;
  applied: boolean;
};

export const pieceResearch = defineCapability({
  id: 'piece.research',
  group: 'content',
  label: { ru: 'Дополнить ресерчем', en: 'Research the core' },
  description:
    'Search the web for facts for a piece’s core («Дополнить ресерчем»). Paid; run it without asking when the person wants facts. The person then marks the facts to add on a card (or says «Решите за меня») and the core is rewritten with them; you never choose the facts. Returns counts only.',
  input: z.object({
    pieceId,
    level: z.enum(RESEARCH_LEVELS).optional().describe('quick, standard (default) or deep'),
    direction: z.string().max(300).optional().describe('What to look for, in the person’s words, when they said'),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentPieceController, 'researchCore'),
  // Counts only; the found rows go to the person's card.
  untrusted: [],
  suspendSchema: factSelection,
  resumeSchema: factAnswer,
  run: async (ctx, input, emit): Promise<Researched | undefined> => {
    const pieces = ctx.service(PieceService);
    if (ctx.resumeData !== undefined) {
      const answer = factAnswer.safeParse(ctx.resumeData);
      const stored = factSelection.safeParse(ctx.suspendPayload);
      if (!answer.success || !stored.success || !stored.data.snapshotKey) {
        throw codedFailure('PIECE_RESEARCH_EXPIRED', 'The research result is no longer known; run the research again.');
      }
      const card = stored.data;
      const kept = chosenIds(card.options, answer.data as Record<string, unknown>, 'factKeys');
      const done = { pieceId: input.pieceId, level: card.level, offered: card.options.length, kept: kept.length };
      // Nothing kept: the core stays as it is, and nothing more is spent.
      if (!kept.length) return { ...done, applied: false };
      await progress(emit, 'piece.research', 'accept-started');
      // The accept door's body (`adaptation-review.tsx` `acceptResearch`).
      await pieces.acceptCoreResearch(ctx.organizationId, input.pieceId, ctx.userId, {
        snapshotKey: card.snapshotKey!,
        selectedKeys: kept,
      });
      return { ...done, applied: true };
    }
    if (!ctx.suspend) throw needsPerson();
    await progress(emit, 'piece.research', 'research-started');
    const direction = input.direction?.trim();
    // The research door's body: the agent confirms the web spend itself — a
    // paid step runs without asking (owner, 26.09, «почти всё сам»).
    const preview = await pieces.researchCore(
      ctx.organizationId,
      input.pieceId,
      ctx.userId,
      { confirmWebSpend: true, level: input.level ?? 'standard', ...(direction ? { direction } : {}) },
      ctx.language
    );
    // Only keyed rows can be accepted (the accept door refuses the rest).
    const options = factOptions(preview.facts, { keyed: true });
    if (!options.length) {
      return { pieceId: input.pieceId, level: preview.level, offered: 0, kept: 0, applied: false };
    }
    await ctx.suspend({
      kind: 'selection',
      question: RESEARCH_QUESTION[ctx.language],
      answerKey: 'factKeys',
      options,
      canDecideForPerson: true,
      snapshotKey: preview.snapshotKey,
      level: preview.level,
    });
    return undefined;
  },
  summarize: (output) => ({ ...output }),
  cardOf: (output) => (output.applied ? pieceCard(output) : null),
});

/* ---- «Проверить факты» and «Переписать…» with the changes card ------------ */

/** A proposal of `reviewV2` — the part this card reads. */
type ReviewProposal = {
  token: string;
  verdict: string;
  changes: Array<{
    id: string;
    excerpt: string;
    replacement: string;
    why?: string;
    basket: 'silent' | 'show' | 'ask';
    variants?: string[];
    sourceUrls?: string[];
    target?: 'title' | 'body';
  }>;
  slopBefore?: number;
  slopAfter?: number;
};

/**
 * What a change does, in words (`kcxz.35`, F7): a pure deletion reads
 * «Убрать: «…»», not «…» → «» with an empty quote for the new text.
 */
const changeWords = (
  change: ReviewProposal['changes'][number],
  language: 'ru' | 'en'
): string =>
  change.replacement.trim() || change.variants?.length
    ? `«${change.excerpt}» → «${change.replacement}»`
    : `${language === 'ru' ? 'Убрать' : 'Remove'}: «${change.excerpt}»`;

/**
 * The screen's own rule (`isEditableReviewChange`): a question never
 * mutates, and a change that changes nothing is a note, not a row to pick.
 * Every editable change is preselected, as `setSelected` does on the page.
 */
const changeOptions = (proposal: ReviewProposal, language: 'ru' | 'en'): SelectionOption[] =>
  proposal.changes
    .filter(
      (change) =>
        change.basket !== 'ask' &&
        (change.excerpt !== change.replacement ||
          !!change.variants?.some((variant) => variant !== change.excerpt))
    )
    .map((change) => {
      const where = change.target === 'title' ? (language === 'ru' ? 'Заголовок: ' : 'Title: ') : '';
      const why = change.why?.trim() ? ` — ${change.why.trim()}` : '';
      return {
        id: change.id,
        label: `${where}${changeWords(change, language)}${why}`.slice(0, 400),
        selected: true,
        status: change.basket,
        source: hostOf(change.sourceUrls?.[0]),
      };
    });

/**
 * Spots the check flagged but left as they are (`kcxz.38`): a notes row keeps
 * the text (no safe rewrite, a replacement that would repeat the post, a
 * never-say word the model did not cover). The page shows them; the chat card
 * offers only what can be accepted, so the agent says these in words.
 */
const NOTES_MAX = 5;
const reviewNotes = (proposal: ReviewProposal): string[] =>
  proposal.changes
    .filter(
      (change) =>
        change.basket !== 'ask' &&
        change.excerpt === change.replacement &&
        !change.variants?.some((variant) => variant !== change.excerpt)
    )
    .slice(0, NOTES_MAX)
    .map((change) => {
      const why = change.why?.trim() ? ` — ${change.why.trim()}` : '';
      return `«${change.excerpt}»${why}`.slice(0, 300);
    });

/**
 * The changes card: `changeIds`, the signed proposal the accept door takes,
 * and the text it is for (`proposalTarget`, `kcxz.32`, N2) — server-only, like
 * the token: the door reads it from the stored card to refuse a second
 * proposal for the same text while this one waits.
 */
export const changeSelection = selectionQuestion('changeIds', {
  token: z.string(),
  verdict: z.string(),
  target: z.string().optional(),
  notes: z.array(z.string()).optional(),
});
export const changeAnswer = selectionAnswer('changeIds', 40);

const CHANGES_QUESTION = {
  ru: 'Вот что предлагаем поправить. Отметьте, что принять.',
  en: 'Here is what we suggest changing. Mark what to accept.',
};

export type Reviewed = {
  pieceId: string;
  verdict: string;
  offered: number;
  applied: number;
  /**
   * The text changed after the proposal (`kcxz.32`, N2): the accept door's
   * compare-and-swap refused it, nothing was applied and nothing more spent.
   */
  stale?: boolean;
  /** Flagged spots left as they are (`reviewNotes`), said by the agent. */
  notes?: string[];
};

/**
 * The accept doors' refusals of a proposal made for another text: the text
 * changed since (`reviewConflict`, compare-and-swap) or the signed proposal
 * expired (`readReview`). Nothing was written.
 */
const STALE_PROPOSAL_CODES: readonly string[] = ['ADAPTATION_REVIEW_STALE', 'REVIEW_STALE'];
const staleProposal = (error: unknown) =>
  STALE_PROPOSAL_CODES.includes(String((error as { code?: unknown })?.code ?? ''));

/**
 * What the model reads after a check or a rewrite (`kcxz.31`, D10): the
 * final counts of this call, with nothing left to decide. Live stand
 * 27.09.2026: `{ verdict: 'review', offered: 1, applied: 1 }` was told as
 * «ещё одно изменение ждёт вашего решения». The call's card is answered by
 * the time a summary exists, so `waitingOnCard` is always 0; the check's own
 * verdict is said only when it offered nothing (then it is the whole answer).
 */
export const reviewSummary = (output: Reviewed & { adaptationId?: string }) =>
  output.stale
    ? {
        pieceId: output.pieceId,
        ...(output.adaptationId ? { adaptationId: output.adaptationId } : {}),
        // `kcxz.32`, N2: said as it is — the proposal was for a text that is
        // no longer there; nothing applied, nothing declined by the person.
        outcome: 'stale',
        offered: output.offered,
        applied: 0,
        declined: 0,
        waitingOnCard: 0,
        note: 'The text changed after this proposal was made, so none of it was applied and nothing more was spent. Say exactly that; offer a new check or rewrite of the current text only if the person wants one.',
      }
    : {
        pieceId: output.pieceId,
        ...(output.adaptationId ? { adaptationId: output.adaptationId } : {}),
        outcome: !output.offered ? 'nothing-to-change' : output.applied ? 'applied' : 'kept-as-is',
        offered: output.offered,
        applied: output.applied,
        declined: Math.max(0, output.offered - output.applied),
        waitingOnCard: 0,
        ...(!output.offered ? { verdict: output.verdict } : {}),
        ...(output.notes?.length
          ? {
              leftAsIs: output.notes,
              leftAsIsNote:
                'These spots were flagged but left unchanged (no safe rewrite). In your reply, quote each left-as-is phrase verbatim in «» (the part before « — »), so the person can find it; then say they can rewrite it in their own words or ask for another rewrite. Do not paraphrase them as "one phrase" and do not claim they were fixed.',
            }
          : {}),
      };

/**
 * One pause for a check and a rewrite: propose (paid), ask, accept. The core
 * accepts through `/:id/rewrite/accept`, an adaptation through
 * `/:id/adaptations/:aid/review/accept` — both `acceptReviewV2`, as the page
 * posts them (`adaptation-review.tsx` `accept`).
 */
export const proposeThenAccept =
  (
    capability: string,
    body: (input: any) => Record<string, unknown>,
    adaptationOf: (input: any) => string | undefined = () => undefined
  ) =>
  async (ctx: CapabilityRunContext, input: any, emit: CapabilityEmit): Promise<Reviewed | undefined> => {
    const pieces = ctx.service(PieceService);
    if (ctx.resumeData !== undefined) {
      const answer = changeAnswer.safeParse(ctx.resumeData);
      const stored = changeSelection.safeParse(ctx.suspendPayload);
      if (!answer.success || !stored.success) {
        throw codedFailure('REVIEW_SELECTION', 'The proposal is no longer known; run it again.');
      }
      const card = stored.data;
      const kept = chosenIds(card.options, answer.data as Record<string, unknown>, 'changeIds');
      const done = {
        pieceId: input.pieceId,
        verdict: card.verdict,
        offered: card.options.length,
        ...(card.notes?.length ? { notes: card.notes } : {}),
      };
      if (!kept.length) return { ...done, applied: 0 };
      await progress(emit, capability, 'accept-started');
      try {
        await pieces.acceptReviewV2(ctx.organizationId, input.pieceId, adaptationOf(input), {
          token: card.token,
          selectedIds: kept,
        });
      } catch (error) {
        // A card answered after its text changed — a later proposal applied,
        // a hand edit — applies nothing and says so (`kcxz.32`, N2). The
        // accept door is free: nothing more was spent.
        if (staleProposal(error)) return { ...done, applied: 0, stale: true };
        throw error;
      }
      return { ...done, applied: kept.length };
    }
    if (!ctx.suspend) throw needsPerson();
    await progress(emit, capability, 'review-started');
    const proposal = (await pieces.reviewV2(
      ctx.organizationId,
      input.pieceId,
      adaptationOf(input),
      body(input),
      ctx.language
    )) as unknown as ReviewProposal;
    const options = changeOptions(proposal, ctx.language);
    const notes = reviewNotes(proposal);
    if (!options.length) {
      return {
        pieceId: input.pieceId,
        verdict: proposal.verdict,
        offered: 0,
        applied: 0,
        ...(notes.length ? { notes } : {}),
      };
    }
    await ctx.suspend({
      kind: 'selection',
      question: CHANGES_QUESTION[ctx.language],
      answerKey: 'changeIds',
      options,
      canDecideForPerson: true,
      token: proposal.token,
      verdict: proposal.verdict,
      target: proposalTarget(input.pieceId, adaptationOf(input)),
      ...(notes.length ? { notes } : {}),
    });
    return undefined;
  };

export const pieceCheckFacts = defineCapability({
  id: 'piece.check_facts',
  group: 'content',
  label: { ru: 'Проверить факты', en: 'Check the facts' },
  description:
    'Check the facts of a piece’s core against sources on the web («Проверить факты»). Paid; runs without asking. The person accepts the proposed changes on a card (or says «Решите за меня»); you never choose them. Returns the verdict and counts.',
  input: z.object({ pieceId }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentPieceController, 'reviewCore'),
  untrusted: [],
  suspendSchema: changeSelection,
  resumeSchema: changeAnswer,
  // The page's body for «Проверить факты»: the web check, spend confirmed.
  run: proposeThenAccept('piece.check_facts', () => ({ mode: 'web', confirmWebSpend: true })),
  proposes: (input) => proposalTarget(input.pieceId),
  summarize: reviewSummary,
  cardOf: (output) => (output.applied ? pieceCard(output) : null),
});

export const pieceRewrite = defineCapability({
  id: 'piece.rewrite',
  group: 'content',
  label: { ru: 'Переписать суть', en: 'Rewrite the core' },
  description:
    'Rewrite a piece’s core by the person’s instruction («Переписать…»), e.g. «короче», «убери канцелярит». Paid; runs without asking. Pass the instruction in the person’s words. The person accepts the proposed changes on a card (or says «Решите за меня»); you never choose them.',
  input: z.object({
    pieceId,
    instruction: z.string().min(1).max(2000).describe('What to change, in the person’s words'),
  }),
  risk: 'paid',
  card: 'piece',
  door: door(ContentPieceController, 'rewriteCore'),
  untrusted: [],
  suspendSchema: changeSelection,
  resumeSchema: changeAnswer,
  run: proposeThenAccept('piece.rewrite', (input) => ({ instruction: input.instruction.trim() })),
  proposes: (input) => proposalTarget(input.pieceId),
  summarize: reviewSummary,
  cardOf: (output) => (output.applied ? pieceCard(output) : null),
});
