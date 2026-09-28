'use strict';

const load = require('../../helpers/load-tsx.cjs').loadTypeScriptModule;

const { agentWordsFor } = load('apps/frontend/src/components/agents/agent.copy.ts');
const { startersFor } = load('apps/frontend/src/components/agents/agent.starters.ts');
const onboarding = load('apps/frontend/src/components/onboarding/onboarding.adapter.ts');

const STARTERS = agentWordsFor('ru').start.starters;

/**
 * A1, «с нуля до поста в плане» (spec §2, `kcxz.21`): a fresh workspace goes
 * avatar (the six lines by hand) → the Telegram connect card → a piece from
 * one thought → an adaptation for the channel → a reserve in the plan,
 * through the chat only, each step begun with the sentence its starter sends.
 *
 * Progress is not marked by the chat: every step closes because its record
 * exists, counted by the real `OnboardingRepository.progress` over the
 * world's rows (`world.cjs`) and judged by the same `stepIsDone` as «С чего
 * начать». The snapshot each request opens with says so, step by step, and
 * the empty thread's starters follow it.
 */
const AVATAR = '00000000-0000-4000-8000-000000000100';
const LINES = {
  WHO_SPEAKS: 'Я, Игорь, основатель студии',
  TONE: 'Спокойно и по делу',
  AUDIENCE: 'Руководители небольших команд',
  SENTENCE_LENGTH: 'Короткие фразы',
  NEVER_SAY: 'Без канцелярита и восклицаний',
  TOPICS: 'Практика команды; ошибки внедрения',
};
/** What the connect door saves once the page's polling finds the chat: no plan mode chosen yet. */
const CHANNEL = {
  id: 'c2',
  name: 'Заметки из цеха',
  providerIdentifier: 'telegram',
  disabled: false,
  refreshNeeded: false,
  planMode: null,
  posts: 0,
  profile: null,
};
const AT = '2026-10-01T10:00:00+03:00';

module.exports = {
  id: 'onboarding-zero-to-plan',
  title: 'A1 «с нуля до поста в плане» — аватар, Telegram, заготовка, адаптация, бронь; шаги закрыты по данным',
  role: 'ADMIN',
  timeZoneHeader: 'Europe/Moscow',
  covers: [
    'avatar.create',
    'avatar.manual',
    'avatar.manual.field',
    'avatar.activate',
    'channel.connect',
    'channel.open',
    'channel.plan',
    'piece.create',
    'piece.adapt',
    'plan.place',
    'plan.ahead',
  ],
  world: { pieces: [], channels: [], avatars: [], adaptations: [] },
  turns: [
    /* 1–3. Аватар: шесть строк словами человека, согласие. */
    {
      say: STARTERS.avatar,
      model: [
        [['tool', 'avatar_create', {}]],
        [['tool', 'avatar_manual', { avatarId: AVATAR }]],
        [['text', 'Аватар заведён. Напишите шесть строк: кто говорит, тон, для кого, длина фраз, чего не говорим, о чём пишем.']],
      ],
    },
    {
      say: Object.values(LINES).join('\n'),
      model: [
        // All the lines in one call (W3 walk P2-B): one step, not six.
        [
          [
            'tool',
            'avatar_manual_field',
            { avatarId: AVATAR, lines: Object.entries(LINES).map(([field, text]) => ({ field, text })) },
          ],
        ],
        [['tool', 'avatar_activate', { avatarId: AVATAR, mode: 'manual' }]],
      ],
    },
    { resume: { consentGiven: true }, model: [[['text', 'Аватар включён. Дальше — канал.']]] },
    /* 4–6. Канал: карточка с «Да», шаги онбординга, канал появился, режим «Бронь». */
    { say: STARTERS.channel, model: [[['tool', 'channel_connect', { provider: 'telegram' }]]] },
    {
      approve: true,
      model: [[['text', 'Добавьте бота администратором и отправьте в канал команду с карточки.']]],
    },
    {
      before: (rows) => {
        rows.channels.push({ ...CHANNEL });
      },
      say: 'Готово, отправил команду',
      model: [
        [
          ['tool', 'channel_open', { channelId: 'c2' }],
          ['tool', 'channel_plan', { channelId: 'c2', planMode: 'reserve' }],
        ],
        [['text', 'Канал «Заметки из цеха» подключён, посты будут вставать бронью.']],
      ],
    },
    /* 7–8. Заготовка из одной мысли. */
    { say: STARTERS.piece, model: [[['text', 'Какая мысль?']]] },
    {
      say: 'Созвоны без повестки съедают день',
      model: [
        [['tool', 'piece_create', { text: 'Созвоны без повестки съедают день' }]],
        [['text', 'Заготовка cnt-9 готова.']],
      ],
    },
    /* 9. Адаптация для канала. */
    {
      say: STARTERS.adaptation,
      model: [
        [['tool', 'piece_adapt', { pieceId: 'p9', channelId: 'c2' }]],
        [['text', 'Пост для «Заметки из цеха» готов.']],
      ],
    },
    /* 10. Бронь в плане. */
    {
      say: 'Поставь его в план на среду, 1 октября, 10:00',
      model: [
        [['tool', 'plan_place', { pieceId: 'p9', adaptationId: 'a1', at: AT }]],
        [['text', 'Поставили бронь на среду, 10:00.']],
      ],
    },
    /* 11. Дальше — обычная работа: что в плане. */
    {
      say: STARTERS.week,
      model: [[['tool', 'plan_ahead', {}]], [['text', 'Одна бронь в среду.']]],
    },
  ],
  check: (run) => {
    const t = run.turns;
    const opened = t.map((turn) => turn.opening);
    const stepsAt = (index) => opened[index]?.onboarding;
    // What «С чего начать» would tick from the same counts.
    const screenDone = (index) =>
      onboarding.ONBOARDING_STEP_KEYS.filter((step) => onboarding.stepIsDone(step, opened[index].counts));

    // A fresh workspace: nothing done, the avatar first, and the empty
    // thread's starters are the steps in menu order — without an adaptation
    // or a reserve before a channel exists (review W3-21 P3-3).
    expect(stepsAt(0)).toEqual({ done: [], next: 'avatar', channelByAdmin: false });
    expect(startersFor(opened[0].counts, 'ADMIN')).toEqual(['avatar', 'channel', 'piece']);

    // Avatar: the six lines verbatim through the manual door, then switched
    // on with the person's own consent — and only then is the step closed.
    expect(t[0].outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    expect(run.requests.filter(([name]) => name === 'voice.manual.field')).toEqual(
      Object.entries(LINES).map(([key, text]) => ['voice.manual.field', AVATAR, { key, text }])
    );
    expect(t[1].suspended[0].payload).toMatchObject({ avatarId: AVATAR, mode: 'manual' });
    expect(stepsAt(1)).toEqual({ done: [], next: 'avatar', channelByAdmin: false });
    expect(t[2].outputs[0].output).toMatchObject({ ok: true, summary: { avatarId: AVATAR, activated: true } });
    expect(stepsAt(3)).toEqual({ done: ['avatar'], next: 'channel', channelByAdmin: false });
    expect(startersFor(opened[3].counts, 'ADMIN')[0]).toBe('channel');

    // Channel: asked first, then the onboarding's own steps card; the chat
    // itself connects nothing.
    expect(t[3].approvals).toEqual([expect.objectContaining({ toolName: 'channel_connect' })]);
    expect(t[4].data.filter((part) => part.type === 'data-channel-connect')).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ provider: 'telegram', flow: 'telegram', known: [] }) }),
    ]);
    // The channel the connect door saved is in the next snapshot; no plan
    // mode chosen yet, so «План» is still open. It reads «Бронь» as the
    // service reads a NULL column (`planModeOf`), and says nobody chose it —
    // what the skill decides on (review W3-21 P2-1).
    expect(stepsAt(5)).toEqual({ done: ['avatar', 'channel'], next: 'piece', channelByAdmin: false });
    expect(opened[5].channels).toEqual([
      expect.objectContaining({ id: 'c2', planMode: 'reserve', planModeChosen: false }),
    ]);
    expect(t[5].outputs[0].output.summary.untrustedData.value).toMatchObject({
      channelId: 'c2',
      planMode: 'reserve',
      planModeChosen: false,
    });
    expect(t[5].outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    // Choosing «Бронь» for the channel is the decision «когда выйдет»: the
    // screens close «План» on it, so the chat's choice does too.
    expect(stepsAt(6)).toEqual({ done: ['avatar', 'channel', 'plan'], next: 'piece', channelByAdmin: false });
    expect(opened[6].channels).toEqual([
      expect.objectContaining({ id: 'c2', planMode: 'reserve', planModeChosen: true }),
    ]);
    // No adaptation starter before a piece exists (W3 walk P3-L).
    expect(startersFor(opened[6].counts, 'ADMIN')).toEqual(['piece']);

    // Piece from one thought: the intake door, its own paid operation.
    expect(t[7].outputs[0].output).toMatchObject({ ok: true, summary: { pieceId: 'p9', code: 'cnt-9' } });
    expect(t[7].admissions.map(([operation]) => operation)).toContain('intake');
    expect(stepsAt(8)).toEqual({ done: ['avatar', 'channel', 'piece', 'plan'], next: 'adaptation', channelByAdmin: false });

    // Adaptation for the new channel.
    expect(t[8].outputs[0].output).toMatchObject({ ok: true });
    expect(run.world.adaptations).toEqual([
      expect.objectContaining({ id: 'a1', pieceId: 'p9', integrationId: 'c2', state: 'draft' }),
    ]);
    expect(stepsAt(9)).toEqual({ done: ['avatar', 'channel', 'piece', 'adaptation', 'plan'], next: null, channelByAdmin: false });

    // The reserve: no card, the calendar picker's own body.
    expect(t[9].approvals).toEqual([]);
    expect(run.requests.filter(([door]) => door === 'plan.place')).toEqual([
      ['plan.place', 'p9', 'a1', { date: new Date(AT).toISOString() }],
    ]);
    expect(t[9].outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p9', adaptationId: 'a1', channelId: 'c2', state: 'reserve' },
      card: { kind: 'plan', id: 'a1' },
    });

    // All five done by the screens' own rule, on every opening; the empty
    // thread now offers the everyday two.
    for (const index of opened.keys()) expect(stepsAt(index).done).toEqual(screenDone(index));
    expect(stepsAt(10)).toEqual({ done: ['avatar', 'channel', 'piece', 'adaptation', 'plan'], next: null, channelByAdmin: false });
    expect(onboarding.allStepsDone(opened[10].counts)).toBe(true);
    expect(startersFor(opened[10].counts, 'ADMIN')).toEqual(['piece', 'week']);
    expect(t[10].outputs[0].output.summary.untrustedData.value).toMatchObject({ planned: 1, reserved: 1 });

    // The records are the ones the screens leave, in the order made.
    expect(run.writes).toEqual([
      ['avatar.created', AVATAR, 'PERSON'],
      ...Object.keys(LINES).map((key) => ['avatar.manual.field', AVATAR, key]),
      ['avatar.activated', AVATAR, 'manual'],
      ['channel.plan-mode', 'c2', 'reserve'],
      ['piece.created', 'p9'],
      ['adaptation.created', 'a1', 'c2'],
      ['plan.placed', 'a1', 'reserved', '2026-10-01T07:00:00.000Z'],
    ]);
  },
};
