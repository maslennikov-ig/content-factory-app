import { z } from 'zod';
import { ContentContextController } from '@contentfactory/backend/api/routes/content-context.controller';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';
import { claimKeyFromStatement } from '@contentfactory/nestjs-libraries/content-intelligence/context/fact-claim-key';
import { factRecordAdmission } from '@contentfactory/nestjs-libraries/content-intelligence/context/fact-admission';
import { FACT_LIST_LIMIT } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.repository';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
  type CapabilityRunContext,
} from '../capability.types';
import { codedFailure } from './selection';
import {
  factDayProblem,
  factValidUntilDay,
  factValidUntilMoment,
} from '@contentfactory/nestjs-libraries/content-intelligence/context/fact-valid-until';

/**
 * Facts from the chat (spec §5.2 «Факты», §5.8, `content-factory-next-kcxz.24`).
 *
 * A fact is what the product holds true about the person's business — a
 * price, a date, a number a text stands on. «Откуда факты» shows them; the
 * chat reads them, adds one in the person's words, and takes one out of use
 * («Снять») or back («Вернуть»). Every capability calls the
 * `ContentFactService` step its `ContentContextController` door calls, so the
 * doors decide who may: reading is any member's, the rest an editor's (owner,
 * 05.09.2026, `fn33.90`).
 *
 * Risk by what really happens: adding is `write` — a fact typed by the person
 * is theirs and is retracted as easily; «Снять» is `confirm` (spec §5.2): from
 * that moment no new text stands on the fact, so the card quotes the fact
 * itself and «Да» is bound to it; «Вернуть» is `write`, the undo of «Снять».
 */

/** The facts card opens «Откуда факты» beside the chat; there is one. */
export const FACTS_CARD_ID = 'facts';
const factsCard = () => ({ kind: 'facts' as const, id: FACTS_CARD_ID });

const factId = z.string().min(1).max(128).describe('Fact id from facts.list');

/** The door's own limit on a statement (`CreateContentFactDto`). */
const STATEMENT_MAX = 4_000;
/** Facts the model is shown at most; the rest is on the screen beside it. */
const LIST_MAX = 30;

/** The three the brief refuses (`UNUSABLE_FACT_STATUSES`): not in work. */
const OUT_OF_WORK = new Set(['TOMBSTONED', 'RETRACTED', 'SUPERSEDED']);

type FactRecord = {
  status: string;
  verifiedAt?: Date | string | null;
  freshUntil?: Date | string | null;
};

/**
 * Why new texts will not stand on a fact, by the brief builder's own rule
 * (`factRecordAdmission`, review W4-24 F5), or `null` when they may: taken
 * out (`retracted`, `superseded`), in dispute (`conflicted`), waiting for a
 * confirmation (`unverified`) or past the day it held until (`expired`). A
 * fact grounded in material also needs that material still fresh when a
 * text is written; the person's own word needs nothing else.
 */
const outOfWork = (fact: FactRecord, now: Date): string | null => {
  if (OUT_OF_WORK.has(fact.status)) return fact.status.toLowerCase();
  const refused = factRecordAdmission(fact, now);
  if (!refused) return null;
  return refused === 'STALE' ? 'expired' : refused.toLowerCase();
};

type ServiceContext = Pick<CapabilityRunContext, 'organizationId' | 'service'>;

const factsOf = (ctx: Pick<CapabilityRunContext, 'service'>) => ctx.service(ContentFactService);

const FACT_MISSING = 'There is no such fact in this workspace; nothing was done.';

/** One fact of the caller's workspace by id, or the refusal. */
const factRow = async (ctx: ServiceContext, id: string) => {
  const row = await factsOf(ctx).fact(ctx.organizationId, id);
  if (!row) throw codedFailure('FACT_NOT_FOUND', FACT_MISSING);
  return row;
};

/** A fact the approval card names, or `null` — a failing read included. */
const factNamed = async (ctx: ApprovalDescribeContext, id: string) =>
  factsOf(ctx)
    .fact(ctx.organizationId, id)
    .then(
      (row) => row,
      () => null
    );

const cut = (text: string | null | undefined, max: number) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

const quoted = (text: string, ru: boolean) => (ru ? `«${text}»` : `“${text}”`);

/** A date column as the person's day it falls on (`YYYY-MM-DD`), or `null`. */
const dayOf = factValidUntilDay;

/**
 * The named last day, whole: the fact holds until the last moment of that
 * day in the person's time zone — the fact form's rule too
 * (`fact-valid-until.ts`, review W4-24 F4, `kcxz.43`). A day that is not a
 * day, or one already over, is refused before anything is written.
 */
const lastMomentOf = (day: string, zone: string): string => {
  const problem = factDayProblem(day, zone);
  if (problem === 'invalid') {
    throw codedFailure('FACT_DATE_INVALID', `${day} is not a calendar day; nothing was added.`);
  }
  if (problem === 'past') {
    throw codedFailure(
      'FACT_DATE_PAST',
      `${day} is already over, so the fact would be out of date at once; nothing was added.`
    );
  }
  return factValidUntilMoment(day, zone) as string;
};

/** How a fact stands, in the witness screen's three words. */
const GROUNDED = {
  OWN_WORD: 'own-word',
  OWN_MATERIAL: 'own-material',
  SEARCH_RESULT: 'search',
} as const;

type ListedFact = {
  id: string;
  statement: string;
  topicLabel: string;
  status: string;
  verifiedAt: string | Date | null;
  freshUntil: string | Date | null;
  createdAt: string | Date | null;
  grounding: { method: keyof typeof GROUNDED; sourceLabel?: string | null; sourceUrl?: string | null };
  needsLook: boolean;
};

/* ---- Reading ------------------------------------------------------------- */

export const factsList = defineCapability({
  id: 'facts.list',
  group: 'facts',
  label: { ru: 'Откуда факты', en: 'Facts' },
  description:
    'Read the workspace’s facts («Откуда факты»): what the product holds true about the business — prices, dates, numbers texts stand on. Each with its id, the statement, the topic, `status` (`verified`, `unverified`, `stale`, `conflicted`; with `retracted: true` also `retracted` and `superseded`), `inWork` (whether new texts may stand on it, by the brief’s own rule; when not, `notInWorkBecause`: `retracted`, `superseded`, `conflicted`, `unverified` — waits for a confirmation — or `expired`), how it stands (`own-word` — the person said so; `own-material` — their material; `search` — a search result, `needsLook` when it waits for confirmation) with the source, and `validUntil` — the last day it holds. Facts in work come first, newest first. `capped: true` means the workspace has more facts than one read returns — narrow by `q` before saying a fact is not there. `q` narrows by words. Retracted facts only with `retracted: true`. Free. «Откуда факты» opens beside the chat; name the few that matter, do not retype the list.',
  input: z.object({
    q: z.string().trim().min(1).max(200).optional().describe('Words to look for, when the person named a subject'),
    retracted: z.boolean().optional().describe('Also the facts taken out of use; only when the person asks about them'),
  }),
  risk: 'read',
  card: 'facts',
  door: door(ContentContextController, 'listFacts'),
  // Statements are typed by people or taken from their material and search results.
  untrusted: ['workspace-text', 'search-result'],
  run: async (ctx, input) => {
    const facts = (await factsOf(ctx).listFacts(ctx.organizationId, input.q)) as unknown as ListedFact[];
    const now = new Date();
    const time = (value: unknown) => (value ? new Date(value as string).getTime() || 0 : 0);
    // In work first, then the newest: a fact just added is among the ones
    // the model sees (review W4-24 F10).
    const shown = facts
      .filter((fact) => input.retracted || !OUT_OF_WORK.has(fact.status))
      .map((fact) => ({ fact, because: outOfWork(fact, now) }))
      .sort(
        (left, right) =>
          Number(!!left.because) - Number(!!right.because) ||
          time(right.fact.createdAt) - time(left.fact.createdAt)
      );
    return {
      total: shown.length,
      // The catalogue read stops at `FACT_LIST_LIMIT` rows.
      capped: facts.length >= FACT_LIST_LIMIT,
      facts: shown.slice(0, LIST_MAX).map(({ fact, because }) => ({
        id: fact.id,
        statement: cut(fact.statement, 400),
        topic: fact.topicLabel || null,
        status: String(fact.status || '').toLowerCase(),
        inWork: !because,
        ...(because ? { notInWorkBecause: because } : {}),
        grounded: GROUNDED[fact.grounding?.method] ?? 'own-word',
        source: fact.grounding?.sourceLabel ?? fact.grounding?.sourceUrl ?? null,
        needsLook: !!fact.needsLook,
        validUntil: dayOf(fact.freshUntil, ctx.timeZone),
      })),
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: factsCard,
});

/* ---- Changing ------------------------------------------------------------ */

type FactAnswer = { id: string; statement: string } & FactRecord;

export const factsAdd = defineCapability({
  id: 'facts.add',
  group: 'facts',
  label: { ru: 'Добавить факт', en: 'Add a fact' },
  description:
    'Add a fact in the person’s words — a price, a date, a number, a claim about their business that texts may stand on. Pass the statement verbatim, one fact per call; never a fact you inferred, found or read elsewhere. `validUntil` (YYYY-MM-DD) — the last day it still holds, that day included — only when the person said until when it holds («до конца года» → 12-31, a price «по 30 сентября» → 09-30); otherwise it holds until retracted. A day that is not a calendar day (`FACT_DATE_INVALID`) or is already over (`FACT_DATE_PAST`) is refused. A fact the person states is theirs: it is in work at once («ваше слово»). The same statement again is the same fact, not a second one: `existed: true`, and it keeps its own state — the answer gives it as stored. A new day for a known fact is this same call: when the person tells you the new day («скидка теперь до 31.10»), pass the statement and the new `validUntil`; a fact in work takes it (`redated: true`), a retracted or replaced one keeps its own. Free.',
  input: z.object({
    statement: z
      .string()
      .trim()
      .min(1)
      .max(STATEMENT_MAX)
      .describe('The fact, the person’s words verbatim'),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('The last day it holds (included), only when the person named one'),
  }),
  risk: 'write',
  card: 'facts',
  door: door(ContentContextController, 'createFact'),
  untrusted: [],
  run: async (ctx, input) => {
    const statement = input.statement.replace(/\s+/g, ' ').trim();
    // Filed as the fact form files it: the key from the words of the claim,
    // the value is the whole claim (`buildFactCreatePayload`, `fn33.57`).
    const claimKey = claimKeyFromStatement(statement);
    if (!claimKey) {
      throw codedFailure('FACT_STATEMENT_EMPTY', 'A fact needs words or numbers; nothing was added.');
    }
    const freshUntil = input.validUntil ? lastMomentOf(input.validUntil, ctx.timeZone) : undefined;
    const added = await factsOf(ctx).addFact(ctx.organizationId, ctx.userId, {
      claimKey,
      statement,
      language: ctx.language,
      valueText: statement,
      ...(freshUntil ? { temporalKind: 'CURRENT' as const, freshUntil } : { temporalKind: 'TIMELESS' as const }),
    });
    const row = added.fact as unknown as FactAnswer;
    // Removed for good: the form's add leaves such a row untouched too, so
    // nothing is added and the chat says so (review W4-24 F2).
    if (row.status === 'TOMBSTONED') {
      throw codedFailure(
        'FACT_REMOVED',
        'This statement was removed from the workspace for good and is not added again; nothing was changed.'
      );
    }
    // Read back, not echoed (review W4-24 F2): a known fact keeps its own
    // date and state.
    const validUntil = dayOf(row.freshUntil, ctx.timeZone);
    const because = outOfWork(row, new Date());
    return {
      factId: row.id,
      // The model's own words, not the stored row's: a known fact's row may
      // be worded by someone else (the same fact up to case), and this
      // answer carries no untrusted data.
      statement,
      existed: added.existed,
      // Set as asked; a fact grounded in material keeps its material's day.
      ...('redated' in added && added.redated && validUntil === (input.validUntil ?? null)
        ? { redated: true }
        : {}),
      validUntil,
      ...(added.existed && (input.validUntil ?? null) !== validUntil
        ? { validUntilAsked: input.validUntil ?? null }
        : {}),
      inWork: !because,
      ...(because ? { notInWorkBecause: because } : {}),
      // The same statement was retracted before: the add found that row.
      retracted: row.status === 'RETRACTED',
      superseded: row.status === 'SUPERSEDED',
    };
  },
  summarize: (output) => ({
    ...output,
    ...(output.retracted
      ? { note: 'This fact was added before and retracted; it stays retracted. facts.restore brings it back into work.' }
      : output.superseded
      ? { note: 'This fact was added before and later replaced by a corrected copy; the copy is the one in work, and the old one stays out.' }
      : 'validUntilAsked' in output
      ? {
          note:
            output.validUntilAsked === null
              ? `This fact was already there and keeps its own last day (${output.validUntil ?? 'none'}); no new day was asked.`
              : `This fact was already there and keeps its own last day (${output.validUntil ?? 'none'}); the day asked was not set — ${output.inWork ? 'its freshness comes from its material' : 'it is out of work'}.`,
        }
      : output.redated
      ? { note: `This fact was already there; its last day is now ${output.validUntil ?? 'none'}.` }
      : output.existed
      ? { note: 'This fact was already there; nothing new was added.' }
      : {}),
  }),
  cardOf: factsCard,
});

export const factsRetract = defineCapability({
  id: 'facts.retract',
  group: 'facts',
  label: { ru: 'Снять факт', en: 'Retract a fact' },
  description:
    'Take a fact out of use («Снять»): from now on no new text stands on it; texts already written keep their words, and the fact stays in «Откуда факты» as retracted — facts.restore brings it back. A fact already replaced by a corrected copy is out of use and is refused (`CONTENT_CONTEXT_FACT_SUPERSEDED`). The person approves it on a card that quotes the fact. Needs the id from facts.list.',
  input: z.object({ factId }),
  risk: 'confirm',
  card: 'facts',
  door: door(ContentContextController, 'retractFact'),
  untrusted: ['workspace-text'],
  // «Да» is for the fact the card quoted, as it stood then: a fact retracted
  // or restored meanwhile shows the card again.
  approvalContent: async (ctx, input) => {
    const row = await factNamed(ctx, input.factId);
    return row ? { factId: row.id, statement: row.statement, status: row.status } : null;
  },
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const row = await factNamed(ctx, input.factId);
    if (!row) {
      return ru
        ? `Факта ${input.factId} в этом пространстве нет — ничего не изменится`
        : `There is no fact ${input.factId} in this workspace — nothing will change`;
    }
    // The card is cut at `AGENT_APPROVAL_SUMMARY_MAX`: a long statement is
    // shortened here so the consequence is always said.
    const fact = quoted(cut(row.statement, 120), ru);
    if (row.status === 'RETRACTED') {
      return ru ? `Факт ${fact} уже снят — ничего не изменится` : `The fact ${fact} is already retracted — nothing will change`;
    }
    // Replaced by a corrected copy: already out of work, and «Снять» is
    // refused for it (review W4-24 F1).
    if (row.status === 'SUPERSEDED') {
      return ru
        ? `Факт ${fact} уже заменён исправленной копией и не в работе — ничего не изменится`
        : `The fact ${fact} was already replaced by a corrected copy and is out of work — nothing will change`;
    }
    return ru
      ? `Снять факт ${fact}: новые тексты больше не будут на него опираться, написанные останутся как есть. Вернуть можно в «Откуда факты»`
      : `Retract the fact ${fact}: new texts will no longer stand on it; texts already written stay as they are. It can be restored in Facts`;
  },
  run: async (ctx, input) => {
    const before = await factRow(ctx, input.factId);
    await factsOf(ctx).retractFact(ctx.organizationId, ctx.userId, before.id);
    return { factId: before.id, statement: cut(before.statement, 400), retracted: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: factsCard,
});

export const factsRestore = defineCapability({
  id: 'facts.restore',
  group: 'facts',
  label: { ru: 'Вернуть факт', en: 'Restore a fact' },
  description:
    'Bring a retracted fact back into work («Вернуть»), the undo of facts.retract: new texts may stand on it again. A fact replaced by a corrected copy cannot come back (`CONTENT_CONTEXT_FACT_SUPERSEDED`): the copy is the one in work. Needs the id from facts.list (`retracted: true`).',
  input: z.object({ factId }),
  risk: 'write',
  card: 'facts',
  door: door(ContentContextController, 'restoreFact'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const before = await factRow(ctx, input.factId);
    const now = new Date();
    if (before.status !== 'RETRACTED' && before.status !== 'SUPERSEDED') {
      const because = outOfWork(before, now);
      return {
        factId: before.id,
        statement: cut(before.statement, 400),
        inWork: !because,
        ...(because ? { notInWorkBecause: because } : {}),
        wasRetracted: false,
      };
    }
    const row = (await factsOf(ctx).restoreFact(ctx.organizationId, ctx.userId, before.id)) as unknown as FactAnswer;
    // Re-evaluated on return: back, but perhaps waiting for a confirmation
    // or past its day — said by the brief's rule (review W4-24 F5).
    const because = outOfWork(row, now);
    return {
      factId: before.id,
      statement: cut(before.statement, 400),
      inWork: !because,
      ...(because ? { notInWorkBecause: because } : {}),
      wasRetracted: true,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: factsCard,
});
