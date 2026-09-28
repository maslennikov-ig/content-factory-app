'use strict';

/**
 * The agent's adaptation cards (`content-factory-next-kcxz.16`, spec §6.2).
 *
 * Interview: `piece_adapt` pauses with the channel's questions
 * (`tests/fixtures/agent-scenarios/piece-adapt-interview.scenario.cjs`); the
 * chat draws the channel tab's own `SuggestedQuestionsCard` inside its card
 * frame and answers in the page's shape — `{ answers, decideKeys }` — or
 * «Решите всё за меня».
 *
 * Adaptation: the line says the channel and «вариант N»; the panel opens the
 * piece screen on that channel's tab (the channel preview), embedded.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/new',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen, waitFor, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const interview = loadTypeScriptModule('apps/frontend/src/components/agents/agent.interview-card.tsx');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const pieces = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts'
).piecesCopy;
const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

// The scenario's payload, as the contract will hand it to the card.
const QUESTION = {
  cardId: null,
  kind: 'interview',
  text: 'Пара вопросов, чтобы пост получился вашим.',
  canDecideForPerson: true,
  channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
  questions: [
    { key: 'hook', question: 'С чего начать пост?', suggested: 'С цифры про три часа', options: ['С цифры', 'С вопроса'] },
    { key: 'ask-1', question: 'Какой случай был у вас?', suggested: null, why: 'Пост читают руководители' },
  ],
};

const renderInterview = async (props = {}) => {
  const answers = [];
  await act(async () => {
    render(
      h(interview.InterviewCard, {
        question: QUESTION,
        busy: false,
        onAnswer: (data) => answers.push(data),
        words: ru,
        ...props,
      })
    );
  });
  // The first render suspends once on a lazily loaded control; wait it out.
  await waitFor(() =>
    expect(document.querySelector('[data-agent-card="interview"]')).not.toBeNull()
  );
  const card = document.querySelector('[data-agent-card="interview"]');
  const group = (key) => card.querySelector(`[data-piece-question="${key}"]`);
  return { answers, card, group };
};

describe('the adaptation interview card', () => {
  test('is the channel tab’s card in the chat frame, with the tab’s words', async () => {
    const { card } = await renderInterview();
    expect(card.getAttribute('aria-label')).toBe(
      `${pieces.ru.interviewBadge}: ${pieces.ru.interviewTitle(2)}`
    );
    expect(card.textContent).toContain('Канал про работу');
    expect(card.textContent).toContain(QUESTION.text);
    expect(card.textContent).toContain('Пост читают руководители');
    expect(card.textContent).toContain(pieces.ru.suggestedLead);
    // One frame: the tab's panel and header are not drawn inside the card.
    expect(card.querySelectorAll('section, [data-piece-questions] header')).toHaveLength(0);
    expect(ru.interview.send).toBe(pieces.ru.interviewSend);
    expect(en.interview.skipAll).toBe(pieces.en.answerDecideAll);
  });

  test('answers the scenario’s way: own words for one, the other given to us', async () => {
    const { answers, card, group } = await renderInterview();
    await act(async () =>
      fireEvent.click(within(group('hook')).getByRole('radio', { name: pieces.ru.answerDecide }))
    );
    await act(async () =>
      fireEvent.change(within(group('ask-1')).getByLabelText(pieces.ru.ownAnswerLabel), {
        target: { value: 'Созвон на 40 минут без итога' },
      })
    );
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.interviewSend }))
    );
    expect(answers).toEqual([
      {
        answers: [{ key: 'ask-1', text: 'Созвон на 40 минут без итога', origin: 'person' }],
        decideKeys: ['hook'],
      },
    ]);
    // One answer: the card locks while it goes.
    expect(within(card).getByRole('button', { name: pieces.ru.interviewSend }).disabled).toBe(true);
  });

  test('«Так и есть» confirms the suggested text', async () => {
    const { answers, card, group } = await renderInterview();
    await act(async () =>
      fireEvent.click(within(group('hook')).getByRole('radio', { name: pieces.ru.answerYes }))
    );
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.interviewSend }))
    );
    expect(answers).toEqual([
      {
        answers: [{ key: 'hook', text: 'С цифры про три часа', origin: 'confirmed' }],
        decideKeys: ['ask-1'],
      },
    ]);
  });

  test('«Решите всё за меня» leaves every question to the product', async () => {
    const { answers, card } = await renderInterview();
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.answerDecideAll }))
    );
    expect(answers).toEqual([{ decideForPerson: true }]);
  });

  test('a busy chat holds the answer back', async () => {
    const { card } = await renderInterview({ busy: true });
    for (const button of within(card).getAllByRole('button')) expect(button.disabled).toBe(true);
  });

  test('the contract reads the capability’s payload as the interview, and the conversation draws it', () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    // As `piece_adapt` suspends (`piece-adapt-interview.scenario.cjs`).
    const payload = {
      kind: 'interview',
      question: QUESTION.text,
      questions: QUESTION.questions,
      canDecideForPerson: true,
      channel: QUESTION.channel,
    };
    expect(contract.readQuestion('piece_adapt', payload, null)).toEqual(QUESTION);
    expect(source('apps/frontend/src/components/agents/agent.conversation.tsx')).toMatch(
      /const interview = block\.question;\s*if \(interview\.kind === 'interview' && block\.runId\)/
    );
  });

  test('the autopilot consent (kcxz.14): the channel in the server’s words, «Да» or «Нет», no «Решите за меня»', async () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    const question = contract.readQuestion(
      'piece_adapt',
      {
        kind: 'consent',
        subject: 'autopilot',
        question: 'Канал «Канал про работу» на автопилоте: адаптация сразу встанет в очередь и выйдет сама. Писать?',
        answerKey: 'consentGiven',
        canDecideForPerson: false,
        channel: QUESTION.channel,
      },
      null
    );
    expect(question).toEqual({
      kind: 'consent',
      subject: 'autopilot',
      text: expect.stringContaining('выйдет сама'),
      consentKey: 'consentGiven',
      nameKey: null,
      presetName: null,
      brand: false,
      cardId: null,
    });
    const answers = [];
    await act(async () => {
      render(
        h(cards.QuestionCard, {
          title: 'Адаптировать под канал',
          question,
          answered: false,
          busy: false,
          onAnswer: (data) => answers.push(data),
          words: ru,
        })
      );
    });
    const card = document.querySelector('[data-agent-card="question"]');
    expect(card.textContent).toContain('Канал про работу');
    expect(within(card).queryByRole('button', { name: /Решите за меня/ })).toBeNull();
    expect(within(card).queryByRole('checkbox')).toBeNull();
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: ru.question.autopilotWrite }))
    );
    expect(answers).toEqual([{ consentGiven: true }]);
  });

  test('the panel and «Открыть на экране» read the channel of an adaptation one way', () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    expect(contract.artifactChannelId({ data: { channel: { id: 'c1' } } })).toBe('c1');
    expect(contract.artifactChannelId({ data: { channelId: 'c2' } })).toBe('c2');
    expect(contract.artifactChannelId({ data: {} })).toBeNull();
    expect(source('apps/frontend/src/components/agents/agent.panel.tsx')).toContain('artifactChannelId(artifact)');
  });

  describe('review W2 F3: the answer goes to the card that waits now', () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    const CONSENT_ID = 'c'.repeat(32);
    const INTERVIEW_ID = 'd'.repeat(32);
    const consent = {
      kind: 'consent',
      subject: 'autopilot',
      question: 'Канал на автопилоте. Писать?',
      answerKey: 'consentGiven',
      canDecideForPerson: false,
      channel: null,
      cardId: CONSENT_ID,
    };
    const interviewPayload = {
      kind: 'interview',
      question: 'Пара вопросов',
      questions: [{ key: 'ask-1', question: 'Для кого?', suggested: null }],
      canDecideForPerson: true,
      channel: null,
      cardId: INTERVIEW_ID,
    };
    // The stored message after a reload: the call's first card, as stored.
    const message = (data = {}) => ({
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'tool-piece_adapt', toolCallId: 'call-1', state: 'input-available', title: 'Адаптировать под канал', input: {} },
        {
          type: 'data-tool-call-suspended',
          id: 'call-1',
          data: { runId: 'run-1', toolCallId: 'call-1', toolName: 'piece_adapt', suspendPayload: consent, ...data },
        },
      ],
    });
    const questionOf = (blocks) => blocks.find((block) => block.type === 'question');
    const pending = [
      { runId: 'run-1', toolCallId: 'call-1', toolName: 'piece_adapt', kind: 'question', suspendPayload: interviewPayload, summary: null },
    ];

    test('the server’s pending card wins over an older stored card of the same call, with its id', () => {
      const block = questionOf(contract.readMessageBlocks(message(), pending));
      expect(block.question).toMatchObject({ kind: 'interview', cardId: INTERVIEW_ID });
      expect(contract.pendingCardId(pending[0])).toBe(INTERVIEW_ID);
    });

    test('live, the streamed card shows with its id; a card Mastra marked answered does not', () => {
      expect(questionOf(contract.readMessageBlocks(message())).question).toMatchObject({
        kind: 'consent',
        cardId: CONSENT_ID,
      });
      const answered = contract.readMessageBlocks(message({ resumed: true }));
      expect(questionOf(answered)).toBeUndefined();
      expect(answered.map((block) => block.type)).toEqual(['working']);
    });

    test('the resume body names the card; the conversation sends the block’s card id', () => {
      expect(
        contract.buildChatBody({
          threadId: 'thread-1',
          messages: [],
          resume: { runId: 'run-1', toolCallId: 'call-1', cardId: INTERVIEW_ID, resumeData: { decideForPerson: true } },
        })
      ).toEqual({
        threadId: 'thread-1',
        messages: [],
        runId: 'run-1',
        toolCallId: 'call-1',
        cardId: INTERVIEW_ID,
        resumeData: { decideForPerson: true },
      });
      expect(
        contract.readResumeOption({ resume: { runId: 'run-1', cardId: INTERVIEW_ID, resumeData: {} } })
      ).toMatchObject({ cardId: INTERVIEW_ID });
      const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
      expect(conversation.match(/answerQuestion\([^)]*block\.question\.cardId, resumeData\)/g)).toHaveLength(3);
      // A pending card answered here stops winning over what the stream brings next.
      expect(conversation).toContain('readMessageBlocks(message, openPending, removed, goneQuestions)');
    });
  });

  test('the page still frames the same card itself', () => {
    const container = source('apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx');
    expect(container).toContain('<SuggestedQuestionsCard');
    expect(container).not.toContain('framed={false}');
  });
});

const ADAPTATION = {
  kind: 'adaptation',
  id: 'a1',
  title: null,
  code: null,
  data: {
    kind: 'adaptation',
    id: 'a1',
    pieceId: 'p1',
    channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
    variant: 2,
  },
};

describe('the adaptation line and panel', () => {
  test('the line names the channel and the variant in the piece page’s word', async () => {
    await act(async () => {
      render(h(cards.ArtifactLine, { artifact: ADAPTATION, open: false, onOpen: () => {}, words: ru }));
    });
    expect(document.body.textContent).toContain('Канал про работу · вариант 2');
    expect(ru.card.variant(2)).toBe(pieces.ru.variant(2).toLowerCase());
    expect(cards.artifactName({ ...ADAPTATION, data: { pieceId: 'p1' } }, en)).toBe(en.card.kinds.adaptation);
  });

  test('the panel opens the piece screen on the channel’s tab and leads to it', async () => {
    const panel = loadWithMocks('apps/frontend/src/components/agents/agent.panel.tsx', {
      react: React,
      'next/link': {
        __esModule: true,
        default: ({ href, prefetch: _prefetch, children, ...rest }) => h('a', { href, ...rest }, children),
      },
      'next/dynamic': () => (props) =>
        h('div', {
          'data-piece-stub': props.pieceId,
          'data-tab': props.initialTab,
          'data-embedded': String(props.embedded),
        }),
      '@contentfactory/react/translation/use-interface-language': {
        useInterfaceLanguage: () => 'ru',
      },
      '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
        useOnboardingProgress: () => ({ progress: null, answered: false, error: null }),
      },
    });
    await act(async () => {
      render(h(panel.ArtifactColumn, { artifact: ADAPTATION, onClose: () => {}, empty: null, words: ru }));
    });
    const stub = document.querySelector('[data-piece-stub]');
    expect([stub.dataset.pieceStub, stub.dataset.tab, stub.dataset.embedded]).toEqual(['p1', 'c1', 'true']);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Канал про работу · вариант 2');
    expect(screen.getByRole('link', { name: /Открыть на экране/ }).getAttribute('href')).toBe(
      '/content/pieces/p1?tab=c1'
    );
  });
});
