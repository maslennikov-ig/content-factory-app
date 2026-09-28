'use strict';

/**
 * The P3 defects of the kcxz W3 final live recheck (28.09.2026,
 * `.codex/stages/content-factory-next-kcxz/evidence/live-stand-w3-2026-09-28/final-recheck-2026-09-28/README.md`).
 * Behaviour, not source text. Elsewhere: scenario
 * `channel-writing-max-only-unsaved-card` (F-2a), `piece-answer-decide-all`
 * (F-3b note); `brand-voice.routes.test.cjs` (F-4a and F-6a at the door).
 * No paid calls.
 */

require('reflect-metadata');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence';

describe('F-3a: the audience is a brief line, never a sentence of the core or the post', () => {
  const remark = loadTypeScriptModule(`${base}/text-quality/audience-remark.ts`);
  const meta = loadTypeScriptModule(`${base}/text-quality/meta-speech.ts`);

  /** The core of cnt-03 after «Решите за меня», as the recheck stored it. */
  const RECHECK_CORE =
    'Я считаю, что утренней смене в кофейне нужен короткий чек-лист на десять минут, а не толстая инструкция.\n\n' +
    'Я обращаюсь к сотрудникам, которые открывают кофейню и начинают утреннюю смену: короткий список помогает быстро увидеть, что нужно сделать перед началом работы.\n\n' +
    'Какой формат помогает вам сориентироваться в начале смены?';

  test('the recheck’s address loses its lead-in and keeps its substance', () => {
    expect(remark.withoutAudienceRemarks(RECHECK_CORE)).toBe(
      'Я считаю, что утренней смене в кофейне нужен короткий чек-лист на десять минут, а не толстая инструкция.\n\n' +
        'Короткий список помогает быстро увидеть, что нужно сделать перед началом работы.\n\n' +
        'Какой формат помогает вам сориентироваться в начале смены?'
    );
  });

  test('an address to a group goes, in both languages', () => {
    expect(remark.withoutAudienceRemarks('Первая мысль. Я обращаюсь к руководителям небольших команд. Вторая мысль.')).toBe(
      'Первая мысль. Вторая мысль.'
    );
    expect(remark.withoutAudienceRemarks('Первая. Обращаюсь к владельцам небольших кофеен — список важнее инструкции.')).toBe(
      'Первая. Список важнее инструкции.'
    );
    expect(remark.withoutAudienceRemarks('Intro. I’m writing this for managers who run small teams: keep the list short.')).toBe(
      'Intro. Keep the list short.'
    );
    expect(remark.withoutAudienceRemarks('Intro. We are addressing small teams. Outro.')).toBe('Intro. Outro.');
  });

  test('first-person sentences that are not an address to the post’s readers stay, byte for byte', () => {
    for (const text of [
      'Я обращаюсь к коллегам за советом.',
      'Я обращаюсь к коллегам за советом: они видят то, чего не вижу я.',
      'Я обращаюсь к коллегам, когда застреваю.',
      'Я обращаюсь к коллегам, которые знают тему, за советом.',
      'Я обращаюсь к коллегам, которые знают тему лучше меня.',
      'Когда застреваю, я обращаюсь к коллегам.',
      'Я обращаюсь к врачу раз в год.',
      'Обращаюсь к вам с просьбой: прочитайте до конца.',
      'Мы обращаемся к клиентам по имени.',
      'Мы обращаемся к клиентам лично.',
      "I'm talking to founders who raised last year.",
      "I'm writing this for anyone who ships on Fridays.",
      'I address letters to customers by name.',
    ]) {
      expect(remark.withoutAudienceRemarks(`Первая мысль. ${text}`)).toBe(`Первая мысль. ${text}`);
      expect(remark.audienceRemarksIn(text)).toEqual([]);
      expect(meta.metaSpeechIn(text)).toEqual([]);
    }
  });

  describe('the core written by the model passes through it (writeCoreWithDecisions)', () => {
    let responses = [];
    const modelCalls = [];
    const coreWrite = loadWithMocks(`${base}/pieces/core-write.ts`, {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getChatModel: async () => ({
          withStructuredOutput: () => ({
            invoke: async (prompt) => {
              modelCalls.push(prompt);
              const value = responses.shift();
              if (!value) throw new Error('Unexpected model call');
              return value;
            },
          }),
        }),
      },
    });
    const input = {
      organizationId: 'org',
      language: 'ru',
      brief: {
        inputKind: 'thought',
        thesis: 'Утренней смене нужен короткий чек-лист.',
        position: null,
        disagreement: null,
        audience: null,
        origins: {},
        ungrounded: [],
        facts: [],
      },
      answers: [],
      questionTextByKey: {},
      personText: 'Утренней смене в кофейне нужен короткий чек-лист на десять минут, а не толстая инструкция.',
      borrowed: null,
      foreignShingles: [],
      delegated: [{ key: 'audience', question: 'Для кого этот текст?', authorMaterial: false }],
    };

    beforeEach(() => {
      responses = [];
      modelCalls.length = 0;
    });

    test('«Решите за меня» decided the audience: it is a decision, not a sentence, and costs no rewrite', async () => {
      const warn = jest.fn();
      responses = [
        {
          text: RECHECK_CORE,
          decisions: [{ key: 'audience', text: 'Сотрудники, которые открывают кофейню и начинают утреннюю смену.' }],
        },
      ];
      const { core, decisions } = await coreWrite.writeCoreWithDecisions(input, {
        aiUsage: { executeAiOperation: async (_org, _op, run) => run() },
        slopCheck: null,
        warn,
      });
      expect(modelCalls).toHaveLength(1);
      expect(core.text).not.toMatch(/обращаюсь/iu);
      expect(core.text).toContain('\n\nКороткий список помогает быстро увидеть');
      expect(decisions).toEqual([
        { key: 'audience', text: 'Сотрудники, которые открывают кофейню и начинают утреннюю смену.' },
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('removed without the model'));
    });
  });
});

describe('F-3b: questions the agent quotes are carried whole and quoted as given', () => {
  const selection = loadCapabilityModule('catalogue/selection.ts');
  const admission = loadCapabilityModule('capability.admission.ts');

  test('a long question survives whole up to the bound; a runaway one is cut', () => {
    const question =
      'Какой конкретный эпизод на утренней смене показал вам, что толстой инструкции недостаточно, и что именно пошло не так в тот день, когда её никто не открыл?';
    expect(question.length).toBeGreaterThan(120);
    expect(selection.shortQuestion(question, selection.QUOTED_QUESTION_MAX)).toBe(question);
    const runaway = 'слово '.repeat(100).trim();
    expect(selection.shortQuestion(runaway, selection.QUOTED_QUESTION_MAX).length).toBeLessThanOrEqual(
      selection.QUOTED_QUESTION_MAX + 1
    );
  });

  test('the paid-limit line asks for the questions word for word, not short', () => {
    const reason = admission.paidCapReason(1, 'ru');
    expect(reason).toContain('quote any questions left to the person in «», word for word as the tool gave them');
    expect(reason).not.toMatch(/short/u);
  });
});

describe('F-4a: a stored line of a voice in force is shown in words', () => {
  const words = loadTypeScriptModule(`${base}/brand-voice/metric-words.ts`);

  test('the recheck’s lines of «Олег» v1', () => {
    expect(
      words.voiceLineInWords(
        'Средняя длина предложения по корпусу — 7,8 слова; короткие предложения составляют 53,7%, а разброс длины — 54,6. Примеры коротких фраз: «Не потерял.» и «Спокойно.»'
      )
    ).toBe('В предложении в среднем по 8 слов; коротких предложений — больше половины. Примеры коротких фраз: «Не потерял.» и «Спокойно.»');
    const plain = 'Спокойно и по делу, короткими фразами, без восклицаний и громких слов';
    expect(words.voiceLineInWords(plain)).toBe(plain);
  });
});

describe('F-6a: the passport shows and edits all six lines', () => {
  const brandVoice = 'apps/frontend/src/components/brand-voice';
  const copy = loadTypeScriptModule(`${brandVoice}/voice-copy.ts`).voiceCopy;
  const { VoicePassportScreen } = loadTypeScriptModule(`${brandVoice}/voice-passport.screen.tsx`);
  const adapter = loadTypeScriptModule(`${brandVoice}/voice-profile.adapter.ts`);
  afterEach(cleanup);

  const voice = {
    whoSpeaks: 'Шеф мастерской, от себя.',
    tone: 'Спокойно и по делу.',
    audience: 'Повара и бариста.',
    neverSay: ['уникальный'],
    sentenceStyle: 'Короткие фразы.',
    topics: 'практика команды; ошибки внедрения',
    versionLabel: 'v1',
    activeSince: '28.09.2026',
  };

  test('«О чём говорим» is shown with «Изменить», and saving it names TOPICS', () => {
    const edits = [];
    render(
      React.createElement(VoicePassportScreen, {
        locale: 'ru',
        voice,
        onEditField: (key, text) => edits.push([key, text]),
      })
    );
    expect(screen.getByText(copy.ru.passportTopics)).toBeTruthy();
    expect(screen.getByText(voice.topics)).toBeTruthy();
    const edit = screen.getByRole('button', { name: `${copy.ru.passportEdit}: ${copy.ru.passportTopics}` });
    expect(screen.getAllByRole('button', { name: new RegExp(`^${copy.ru.passportEdit}: `) })).toHaveLength(6);
    fireEvent.click(edit);
    const field = screen.getByDisplayValue(voice.topics);
    fireEvent.change(field, { target: { value: 'разбор результатов' } });
    fireEvent.click(screen.getByRole('button', { name: copy.ru.passportEditSave }));
    expect(edits).toEqual([['TOPICS', 'разбор результатов']]);
  });

  test('an unwritten sixth line is not a row for a reader who cannot edit', () => {
    const { topics, ...five } = voice;
    render(React.createElement(VoicePassportScreen, { locale: 'ru', voice: five }));
    expect(screen.queryByText(copy.ru.passportTopics)).toBeNull();
  });

  test('the adapter carries the line from the door', () => {
    expect(adapter.mapPassport({ state: 'default', voice }).voice.topics).toBe(voice.topics);
    const { topics, ...five } = voice;
    expect(adapter.mapPassport({ state: 'default', voice: five }).voice.topics).toBeUndefined();
  });
});
