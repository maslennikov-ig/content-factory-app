import { z } from 'zod';
import type { AgentDomainQuestionAnswer, AgentDomainQuestionPayload } from './agent-parts.contract';
import { approvalFingerprint } from './approval-fingerprint';

const answer = z.object({
  key: z.string().min(1).max(128),
  mode: z.enum(['choice', 'custom', 'confirmed', 'delegate']),
  text: z.string().max(2_000).optional(),
  optionIds: z.array(z.string().min(1).max(128)).max(200).optional(),
}).strict();

export const domainQuestionAnswer = z.object({
  answers: z.array(answer).max(200).optional(),
  decideForPerson: z.boolean().optional(),
}).strict();

export const domainQuestionSchema = z.object({
  kind: z.literal('domain-questions'),
  batchId: z.string(),
  question: z.string(),
  source: z.object({
    kind: z.enum(['piece', 'adaptation']), pieceId: z.string(),
    channelId: z.string().optional(), revision: z.string(),
  }),
  questions: z.array(z.object({
    key: z.string(), question: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string(), recommended: z.boolean().optional() })).optional(),
    ownOption: z.string().optional(), suggested: z.string().nullable().optional(), why: z.string().optional(),
    selectionMode: z.enum(['single', 'multiple']), canDecideForPerson: z.literal(true),
  })),
  answers: z.array(answer), activeKey: z.string(), canDecideForPerson: z.literal(true),
  // Native checkpoint only; never serialized into a card, model summary or transcript.
  continuation: z.record(z.unknown()).optional(),
  afterConsent: z.literal(true).optional(),
  authorReferenceUrls: z.array(z.string()).optional(),
});
export type DomainQuestionCard = AgentDomainQuestionPayload & {
  continuation?: Record<string, unknown>;
  afterConsent?: true;
  authorReferenceUrls?: string[];
};

export type ManualDomainQuestion = {
  key?: string; field?: string; question: string; options?: string[];
  ownOption?: string; suggested?: string | null; why?: string;
  selectionMode?: 'single' | 'multiple';
};

export const isDomainQuestionCard = (payload: unknown): payload is DomainQuestionCard =>
  !!payload && typeof payload === 'object' && (payload as any).kind === 'domain-questions';

/** Only domain state participates; display dates and preview budgets do not. */
const withoutAnswerDates = (value: any): any => Array.isArray(value) ? value.map(withoutAnswerDates)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'answeredAt').map(([key, one]) => [key, withoutAnswerDates(one)])) : value;

export const domainQuestionRevision = (
  detail: any,
  source: Pick<AgentDomainQuestionPayload['source'], 'kind' | 'channelId'>
) => approvalFingerprint('domain-questions-revision', {
  // Old records may synthesize an answeredAt while reading a retired question.
  core: withoutAnswerDates(detail?.core ?? null),
  archived: !!detail?.piece?.archivedAt,
  ...(source.kind === 'adaptation' ? {
    adaptations: (detail?.adaptations ?? []).filter((one: any) =>
      !source.channelId || one.integrationId === source.channelId || one.channelId === source.channelId)
      .map((one: any) => ({id: one.id, body: one.body, integrationId: one.integrationId, state: one.state})),
    channel: (detail?.channels ?? []).filter((one: any) => one.integrationId === source.channelId)
      .map((one: any) => ({integrationId: one.integrationId, name: one.name, settings: one.settings,
        planMode: one.planMode, materialAsk: one.materialAsk})),
  } : {}),
});

export const createDomainQuestionCard = (
  source: AgentDomainQuestionPayload['source'],
  questions: readonly ManualDomainQuestion[],
  question: string,
  internal?: Pick<DomainQuestionCard, 'continuation' | 'afterConsent' | 'authorReferenceUrls'>
): DomainQuestionCard => {
  const exact: AgentDomainQuestionPayload['questions'] = questions.map(one => ({
    key: String(one.key ?? one.field ?? ''), question: one.question,
    ...(one.options ? { options: one.options.map((label, index) => ({
      id: `option-${index + 1}`, label,
      ...(label === one.suggested ? { recommended: true } : {}),
    })) } : {}),
    ...(one.ownOption !== undefined ? { ownOption: one.ownOption } : {}),
    ...(one.suggested !== undefined ? { suggested: one.suggested } : {}),
    ...(one.why !== undefined ? { why: one.why } : {}),
    selectionMode: one.selectionMode ?? 'single', canDecideForPerson: true,
  }));
  if (exact.some(one => !one.key) || new Set(exact.map(one => one.key)).size !== exact.length) {
    throw invalidAnswer('The saved questions do not have unique identities.');
  }
  return {
    kind: 'domain-questions', source, questions: exact, question,
    batchId: approvalFingerprint('domain-question-batch', { source, questions: exact }).slice(0, 32),
    answers: [], activeKey: exact[0]?.key ?? '', canDecideForPerson: true, ...internal,
  };
};

const invalidAnswer = (message: string) => Object.assign(new Error(message), { code: 'INPUT_NEEDS_PERSON' });
const isOwnOption = (text: string, ownOption?: string) => !!ownOption &&
  text.trim().toLowerCase() === ownOption.trim().toLowerCase();

export const domainQuestionsComplete = (card: DomainQuestionCard) =>
  card.questions.every(question => card.answers.some(answer => answer.key === question.key));

/** Human input is canonicalized against the exact server-held options, never model text. */
export const mergeDomainQuestionAnswers = (card: DomainQuestionCard, input: unknown): DomainQuestionCard => {
  const parsed = domainQuestionAnswer.safeParse(input);
  if (!parsed.success) throw invalidAnswer('The answer does not fit the saved questions.');
  const byKey = new Map(card.questions.map(question => [question.key, question]));
  const accepted = new Map(card.answers.map(answer => [answer.key, answer]));
  const incoming = parsed.data.answers ?? [];
  if (new Set(incoming.map(one => one.key)).size !== incoming.length ||
    (parsed.data.decideForPerson === true && incoming.length)) {
    throw invalidAnswer('Answer each question once, or explicitly delegate the remaining questions.');
  }
  if (!incoming.length && parsed.data.decideForPerson !== true) {
    throw invalidAnswer('An unanswered question is not delegated.');
  }
  for (const received of incoming) {
    const question = byKey.get(received.key);
    if (!question || accepted.has(received.key)) throw invalidAnswer('This question is not open on the saved card.');
    let normalized: AgentDomainQuestionAnswer;
    switch (received.mode) {
      case 'delegate':
        if (received.text !== undefined || received.optionIds !== undefined) throw invalidAnswer('Delegation does not contain a human answer.');
        normalized = { key: received.key, mode: 'delegate' };
        break;
      case 'choice': {
        const ids = received.optionIds ?? [];
        const options = question.options ?? [];
        if (!ids.length || new Set(ids).size !== ids.length ||
          (question.selectionMode === 'single' && ids.length !== 1) ||
          ids.some(id => !options.some(option => option.id === id && !isOwnOption(option.label, question.ownOption)))) {
          throw invalidAnswer('Choose an offered answer, or enter your own words.');
        }
        const chosen = options.filter(option => ids.includes(option.id));
        normalized = { key: received.key, mode: 'choice', optionIds: chosen.map(option => option.id), text: chosen.map(option => option.label).join('\n') };
        break;
      }
      case 'confirmed':
        if (!question.suggested?.trim() || isOwnOption(question.suggested, question.ownOption) || received.optionIds !== undefined) throw invalidAnswer('This question has no suggested answer to confirm.');
        normalized = { key: received.key, mode: 'confirmed', text: question.suggested };
        break;
      case 'custom':
        if (!received.text?.trim() || received.optionIds !== undefined || isOwnOption(received.text, question.ownOption)) throw invalidAnswer('Enter your own answer in words.');
        normalized = { key: received.key, mode: 'custom', text: received.text };
        break;
    }
    accepted.set(normalized.key, normalized);
  }
  if (parsed.data.decideForPerson === true) {
    for (const question of card.questions) {
      if (!accepted.has(question.key)) accepted.set(question.key, { key: question.key, mode: 'delegate' });
    }
  }
  return { ...card, answers: card.questions.flatMap(question => accepted.has(question.key) ? [accepted.get(question.key)!] : []),
    activeKey: card.questions.find(question => !accepted.has(question.key))?.key ?? '' };
};
