'use strict';

/**
 * The fixes of the W3 live-model stand walk (28.09.2026,
 * `.codex/stages/content-factory-next-kcxz/evidence/live-stand-w3-2026-09-28/`),
 * one block per finding. The conversation-level proofs are recorded
 * scenarios (`tests/fixtures/agent-scenarios/*`): `avatar-manual-brand-one-turn`,
 * `turn-step-cap-last-step-speaks`, `turn-step-cap-closing-line`,
 * `channel-writing-max-only`, `piece-chain-across-paid-cap`, and the
 * `avatar-samples-delete-declined` decline check. The wizard following the
 * chat is rendered in `brand-voice.wizard.test.cjs`. No paid calls.
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

const { act, cleanup, render, waitFor, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

const assistant = (parts) => ({ id: `m-${Math.random()}`, role: 'assistant', parts });
const done = (toolName, output) => ({
  type: `tool-${toolName}`,
  toolCallId: `call-${toolName}-${Math.random()}`,
  state: 'output-available',
  input: {},
  output,
});

describe('P2-A: the avatar panel reads the avatars again after an avatar action', () => {
  test('finished avatar actions are counted; refusals and other groups are not', () => {
    const messages = [
      assistant([
        done('avatar_create', { ok: true, card: { kind: 'avatar', id: 'a1' } }),
        done('avatar_analyse', { ok: true, summary: { outcome: 'proposal' } }),
        done('avatar_activate', { ok: false, code: 'VOICE_FIELDS_INCOMPLETE' }),
        done('channel_open', { ok: true }),
      ]),
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'дальше' }] },
      assistant([done('avatar_proposal_field', { ok: true })]),
    ];
    expect(contract.avatarCallsOf(messages)).toBe(3);
    expect(contract.avatarCallsOf([])).toBe(0);
  });

  test('the conversation re-reads every voice route, as channels do; the panel follows the chat', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    expect(conversation).toContain('avatarCallsOf(messages)');
    // Re-read without clearing: behaviour in agent-w3-review-fixes (F2).
    expect(conversation).toContain('useRevalidateWhenCountGrows(avatarCalls, VOICE_API_BASE)');
    expect(source('apps/frontend/src/components/agents/agent.panel.tsx')).toContain(
      '<VoiceAvatarScreen key={artifact.id} avatarId={artifact.id} followChat />'
    );
    expect(source('apps/frontend/src/components/brand-voice/voice-avatar.screen.tsx')).toContain(
      'openReady={followChat && !rebuilding}'
    );
  });
});

describe('P2-B: a turn never ends in silence at the step cap', () => {
  const steps = loadCapabilityModule('../conductor/conductor.steps.ts');
  const context = loadCapabilityModule('../conductor/conductor.context.ts');

  test('seven steps, the last one text-only with its note appended to the instructions', () => {
    expect(context.CONDUCTOR_MAX_STEPS).toBe(7);
    const prepare = steps.lastStepSpeaks(7);
    const instructions = [{ role: 'system', content: 'instructions' }];
    expect(prepare({ stepNumber: 0, systemMessages: instructions })).toBeUndefined();
    expect(prepare({ stepNumber: 5, systemMessages: instructions })).toBeUndefined();
    expect(prepare({ stepNumber: 6, systemMessages: instructions })).toEqual({
      toolChoice: 'none',
      systemMessages: [...instructions, { role: 'system', content: steps.LAST_STEP_NOTE }],
    });
    // Without the list nothing is replaced, only the tools are off.
    expect(prepare({ stepNumber: 6 })).toEqual({ toolChoice: 'none' });
    // An approval request splits the cap: its own last step speaks.
    expect(steps.lastStepSpeaks(3)({ stepNumber: 2, systemMessages: [] })).toMatchObject({ toolChoice: 'none' });
    expect(steps.LAST_STEP_NOTE).toContain('«Напишите «дальше» — продолжим.»');
    expect(steps.LAST_STEP_NOTE).toContain('“Write “next” — we\'ll continue.”');
  });

  test('the door writes its own closing line only for a silent end (behaviour: agent-w3-review-fixes)', () => {
    const watch = steps.closingLineWatch();
    const parts = [
      { type: 'tool-input-available', toolCallId: 'c1' },
      { type: 'tool-output-available', toolCallId: 'c1', output: { ok: true } },
      { type: 'finish', finishReason: 'tool-calls' },
    ];
    expect(parts.map((part) => watch.before(part))).toEqual([false, false, true]);
    expect(steps.STEP_CAP_CLOSING.ru).toContain('Напишите «дальше» — продолжим.');
  });

  test('the lines by hand are one call of several lines, each once', async () => {
    const { avatarManualField } = loadCapabilityModule('catalogue/avatar.capabilities.ts');
    const lines = [
      { field: 'WHO_SPEAKS', text: 'Мы' },
      { field: 'TOPICS', text: 'Практика' },
    ];
    expect(avatarManualField.input.safeParse({ lines }).success).toBe(true);
    expect(avatarManualField.input.safeParse({ lines: [...lines, lines[0]] }).success).toBe(false);
    expect(avatarManualField.input.safeParse({ lines: [] }).success).toBe(false);
    // The older one-line shape is still taken (correctness review F4).
    expect(avatarManualField.input.safeParse({ field: 'TONE', text: 'Спокойно' }).success).toBe(true);
  });
});

describe('P2-C: «до 800 знаков» needs no minimum', () => {
  test('the tool says so, and a minimum is optional', () => {
    const { channelWriting } = loadCapabilityModule('catalogue/channel.capabilities.ts');
    expect(channelWriting.description).toContain('«до 800 знаков» is `lengthMax: 800` alone');
    expect(channelWriting.input.safeParse({ channelId: 'c1', lengthMax: 800 }).success).toBe(true);
  });
});

describe('P2-D: a chain in one message is not asked about', () => {
  test('the instructions and the paid limit say «дальше», never «Продолжить?»', () => {
    const { conductorInstructions } = loadCapabilityModule('../conductor/conductor.instructions.ts');
    const text = conductorInstructions({ language: 'ru', now: new Date('2026-09-28T10:00:00Z'), snapshot: null });
    expect(text).toContain('without asking «Продолжить?»');
    expect(text).toContain('and end with «Напишите «дальше» — продолжим.» — a statement, not a question');
    const { paidCapReason } = loadCapabilityModule('capability.admission.ts');
    expect(paidCapReason(1)).toContain('do not ask whether to continue');
    const skills = loadCapabilityModule('../conductor/conductor.skills.ts').CONDUCTOR_SKILL_SPECS;
    const content = skills.find((skill) => skill.name === 'content').instructions;
    expect(content).toContain('is one request: answer, then adapt, then the reserve');
  });
});

describe('P3-F, P3-G: the consent card knows the avatar', () => {
  const payload = (over) => ({
    question: 'Включить этот аватар? Подтвердите, что у вас есть право писать этим голосом.',
    avatarId: 'a1',
    mode: 'manual',
    canDecideForPerson: false,
    ...over,
  });
  const renderConsent = async (question, words = ru) => {
    const answers = [];
    await act(async () => {
      render(
        h(cards.QuestionCard, {
          title: 'Включить аватар',
          question,
          answered: false,
          busy: false,
          onAnswer: (data) => answers.push(data),
          words,
        })
      );
    });
    // The first render may suspend once on a lazily loaded control.
    await waitFor(() => expect(document.querySelector('[data-agent-card="question"]')).not.toBeNull());
    return { card: document.querySelector('[data-agent-card="question"]'), answers };
  };

  test('the name field starts with the avatar’s name; a person ticks «моя манера»', async () => {
    const question = contract.readQuestion('avatar_activate', payload({ avatarName: 'Олег', avatarKind: 'person' }), null);
    expect(question).toMatchObject({ kind: 'consent', subject: 'avatar', presetName: 'Олег', brand: false });
    const { card } = await renderConsent(question);
    expect(within(card).getByRole('textbox').value).toBe('Олег');
    expect(card.textContent).toContain(ru.question.consentLabel);
  });

  test('a brand’s avatar is not «моя манера»', async () => {
    const question = contract.readQuestion(
      'avatar_activate',
      payload({ avatarName: 'Кухня команды', avatarKind: 'brand' }),
      null
    );
    expect(question.brand).toBe(true);
    const { card } = await renderConsent(question);
    expect(within(card).getByRole('textbox').value).toBe('Кухня команды');
    expect(card.textContent).toContain(ru.question.consentLabelBrand);
    expect(card.textContent).not.toContain(ru.question.consentLabel);
    expect(en.question.consentLabelBrand).toMatch(/brand/);
  });

  test('a card from before (no name, no kind) asks as it did', () => {
    expect(contract.readQuestion('avatar_activate', payload({}), null)).toMatchObject({
      presetName: null,
      brand: false,
    });
  });
});

describe('P3-H: the lines by hand are six, everywhere a person reads it', () => {
  const voiceCopy = loadTypeScriptModule('apps/frontend/src/components/brand-voice/voice-copy.ts');

  test('the path card counts the form’s own list, and the prose says six', () => {
    expect(voiceCopy.VOICE_LINE_KEYS).toHaveLength(6);
    expect(voiceCopy.voiceCopy.ru.manualFields).toBe(String(voiceCopy.VOICE_LINE_KEYS.length));
    expect(voiceCopy.voiceCopy.en.manualFields).toBe(String(voiceCopy.VOICE_LINE_KEYS.length));
    for (const file of [
      'apps/frontend/src/components/onboarding/onboarding.copy.ts',
      // The help answers themselves (`kcxz.24`: moved beside the server so
      // the agent's «help» skill reads the same ones).
      'libraries/nestjs-libraries/src/help/help-faq.questions.ts',
    ]) {
      const text = source(file);
      expect(text).not.toMatch(/пять строк|five lines/);
      expect(text).toMatch(/шесть строк/);
      expect(text).toMatch(/six lines/);
    }
    const skills = source('libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts');
    expect(skills).not.toMatch(/five lines/);
  });

  test('the refusal card asks for the missing lines in the chat too', () => {
    expect(ru.error.codes.VOICE_FIELDS_INCOMPLETE.next).toContain('здесь, в чате');
  });
});

describe('P3-I: no metric identifier reaches the person', () => {
  const words = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/brand-voice/metric-words.ts'
  );

  test('the walk’s line, in words', () => {
    expect(
      words.metricKeysInWords(
        'В корпусе часто встречаются конструкции со связкой через тире: показатель dashCopula — 59.'
      )
    ).toBe(
      'В корпусе часто встречаются конструкции со связкой через тире: показатель «ставит тире вместо связки» — 59.'
    );
    expect(words.metricKeysInWords('Часто: «opensWithQuestion», softBreakRate 12.')).toBe(
      'Часто: «начинает с вопроса», «мягкий перенос строки внутри абзаца» 12.'
    );
    expect(words.metricKeysInWords('The dashCopula share is 59.')).toBe(
      'The “a dash instead of a copula” share is 59.'
    );
  });

  test('plain words stay words, and a clean text is the same string', () => {
    const english = 'She questions every plan.';
    expect(words.metricKeysInWords(english)).toBe(english);
    const clean = 'Спокойно и по делу, короткими фразами.';
    expect(words.metricKeysInWords(clean)).toBe(clean);
    expect(words.metricKeysInWords('Много questions и nominalisation.')).toBe(
      'Много «задаёт ли вопросы читателю» и «канцелярские слова на «-ение»».'
    );
  });

  test('a proposal is said in words where it is written and where it is read', () => {
    const proposal = words.proposalInWords({
      fields: [{ key: 'TONE', text: 'показатель dashCopula — 59', status: 'ACCEPTED' }],
      portrait: { text: 'Пишет с emojiRate 2.', observationRefs: [] },
    });
    // The figure goes too since the recheck (R-7, `proposal-plain-words.ts`).
    expect(proposal.fields[0]).toEqual({ key: 'TONE', text: 'показатель «ставит тире вместо связки»', status: 'ACCEPTED' });
    expect(proposal.portrait.text).toBe('Пишет с «эмодзи» 2.');
    // Display only (review F6): the behaviour — shown in words, stored as
    // written, within the limits — is in `brand-voice.routes.test.cjs`.
    const pipeline = source('libraries/nestjs-libraries/src/content-intelligence/brand-voice/assist.pipeline.ts');
    expect(pipeline).not.toContain('proposalInWords(');
  });
});

describe('P3-E: a post does not say whom it is for', () => {
  const remark = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/text-quality/audience-remark.ts'
  );
  const meta = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/text-quality/meta-speech.ts'
  );
  const WALK =
    'Я считаю, что маленькой команде не нужен отдельный менеджер задач.\n\nЭта мысль адресована небольшим командам, которые решают, нужен ли им отдельный человек для координации задач.\n\nКогда проблему приносит тот, кто за неё отвечает, у него уже есть контекст.\nОтветственность остаётся у того, кто знает проблему изнутри.';

  test('the walk’s adaptation loses the sentence and nothing else', () => {
    expect(remark.withoutAudienceRemarks(WALK)).toBe(
      'Я считаю, что маленькой команде не нужен отдельный менеджер задач.\n\nКогда проблему приносит тот, кто за неё отвечает, у него уже есть контекст.\nОтветственность остаётся у того, кто знает проблему изнутри.'
    );
    expect(
      remark.withoutAudienceRemarks('Короткий абзац. Этот пост написан для руководителей. И ещё мысль.')
    ).toBe('Короткий абзац. И ещё мысль.');
    expect(remark.withoutAudienceRemarks('Intro line. This post is aimed at small teams. Outro.')).toBe(
      'Intro line. Outro.'
    );
  });

  test('ordinary sentences about readers stay, byte for byte', () => {
    for (const text of [
      'Пост для тех, кто устал от созвонов.',
      'Этот текст я писал ночью, после релиза.',
      'Руководителям небольших команд это знакомо.',
      'This post took me a week.',
    ]) {
      expect(remark.withoutAudienceRemarks(text)).toBe(text);
      expect(remark.audienceRemarksIn(text)).toEqual([]);
    }
  });

  test('the core’s meta-speech check recognizes the address for a model repair', () => {
    expect(meta.metaSpeechIn(WALK)).toEqual(['Эта мысль адресована небольшим командам']);
  });
});

describe('P3-J: «Да» on connecting says where the steps are, not «сделали»', () => {
  const renderSettled = async (toolName) => {
    await act(async () => {
      render(
        h(cards.ApprovalCard, {
          title: 'Подключить канал',
          reason: null,
          irreversible: false,
          toolName,
          state: 'approved',
          busy: false,
          onAnswer: () => undefined,
          words: ru,
        })
      );
    });
    return document.querySelector('[data-agent-card="approval"]').textContent;
  };

  test('connect: the card below; anything else: done', async () => {
    expect(await renderSettled('channel_connect')).toBe(`Подключить канал — ${ru.approval.approvedConnect}`);
    cleanup();
    expect(await renderSettled('channel_delete')).toBe(`Подключить канал — ${ru.approval.approved}`);
    expect(ru.approval.approvedConnect).not.toMatch(/сделали/);
  });

  test('the agent does not send the person to a card already open', () => {
    const skills = loadCapabilityModule('../conductor/conductor.skills.ts').CONDUCTOR_SKILL_SPECS;
    const channels = skills.find((skill) => skill.name === 'channels').instructions;
    expect(channels).toContain('do not tell the person to open it, do not say the channel is connected');
  });
});

describe('P3-K: after «Нет» the model reads what it means', () => {
  test('the server’s words go in place of Mastra’s default, the person’s words after them as data', () => {
    const request = loadCapabilityModule('../conductor/agent-chat.request.ts');
    expect(request.DECLINED_ON_CARD).toMatch(/nothing changed, and that card is closed/);
    expect(request.DECLINED_ON_CARD).toMatch(/do not say an approval is missing/);
    const { conductorInstructions } = loadCapabilityModule('../conductor/conductor.instructions.ts');
    expect(
      conductorInstructions({ language: 'ru', now: new Date('2026-09-28T10:00:00Z'), snapshot: null })
    ).toContain('never say an approval was missing, never send the person back to that card');
  });
});

describe('P3-L: no adaptation starter without a piece', () => {
  const steps = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.steps.ts');
  const NONE = {
    channels: 0, avatars: 0, facts: 0, pieceFacts: 0, pieces: 0,
    drafts: 0, scheduled: 0, adaptations: 0, planModes: 0,
  };

  test('offered only once there is a piece; the done-rules and the order are the screens’', () => {
    expect(steps.stepOffered('adaptation', { ...NONE, channels: 1 }, 'ADMIN')).toBe(false);
    expect(steps.stepOffered('adaptation', { ...NONE, channels: 1, pieces: 1 }, 'ADMIN')).toBe(true);
    // Unchanged: what closes a step, and the menu order.
    expect(steps.stepIsDone('adaptation', { ...NONE, channels: 1 })).toBe(false);
    expect(steps.currentStep({ ...NONE, avatars: 1, channels: 1, pieces: 1 })).toBe('adaptation');
    expect(steps.ONBOARDING_STEP_KEYS).toEqual(['avatar', 'channel', 'piece', 'adaptation', 'plan']);
    // The snapshot's next step already led to the piece first.
    expect(steps.nextStepFor({ ...NONE, avatars: 1, channels: 1 }, 'EDITOR')).toBe('piece');
  });
});

describe('P3-M: the AI-mode card asks an action', () => {
  test('its title is «Сменить ключи ИИ?», a yes-or-no', () => {
    const { aiMode } = loadCapabilityModule('catalogue/ai-settings.capabilities.ts');
    expect(aiMode.label).toEqual({ ru: 'Сменить ключи ИИ', en: 'Switch the AI keys' });
    expect(ru.approval.ask(aiMode.label.ru)).toBe('Сменить ключи ИИ?');
    expect(aiMode.label.ru).not.toMatch(/\?|или/);
  });
});
