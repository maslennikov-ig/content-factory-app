'use strict';

/**
 * W3 live walk 28.09.2026, P2-B (a) and P3-F/G: «second avatar by the lines
 * in one message». The walk's model created the brand avatar and wrote five
 * lines one call each: six steps, the cap, and the turn ended with no words
 * and no consent card. Now all lines go in one `avatar.manual.field` call and
 * the same turn reaches the consent card — which names the brand's avatar
 * (its name field starts with «Кухня команды») and asks a brand's tick.
 */
const LINES = {
  WHO_SPEAKS: 'Команда продукта, от лица «мы»',
  TONE: 'Дружелюбно и конкретно, без рекламных оборотов',
  AUDIENCE: 'Небольшие продуктовые команды, на «вы»',
  SENTENCE_LENGTH: 'Короткие фразы, абзацы по две-три строки',
  NEVER_SAY: '«уникальный», «инновационный», «синергия»',
  TOPICS: 'Как мы работаем; ошибки и выводы',
};

module.exports = {
  id: 'avatar-manual-brand-one-turn',
  title: 'Аватар бренда вручную одним сообщением — все строки одним вызовом, карточка согласия с именем',
  covers: ['avatar.create', 'avatar.manual.field', 'avatar.activate'],
  world: { avatars: [] },
  endsPending: true,
  turns: [
    {
      say: `Сделай аватар бренда «Кухня команды», вот строки:\n${Object.values(LINES).join('\n')}`,
      model: [
        [['tool', 'avatar_create', { kind: 'brand', name: 'Кухня команды' }]],
        [
          [
            'tool',
            'avatar_manual_field',
            { lines: Object.entries(LINES).map(([field, text]) => ({ field, text })) },
          ],
        ],
        [['tool', 'avatar_activate', { mode: 'manual' }]],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    // Three steps: create, the lines, the consent card — the cap is far.
    expect(turn.modelCalls).toBe(3);
    expect(turn.steps.every((step) => step.toolChoice !== 'none')).toBe(true);
    const created = run.world.avatars[0];
    expect(run.requests.filter(([name]) => name === 'voice.manual.field')).toEqual(
      Object.entries(LINES).map(([key, text]) => ['voice.manual.field', created.id, { key, text }])
    );
    const lines = turn.outputs.find(({ toolName }) => toolName === 'avatar_manual_field').output;
    expect(lines.summary.untrustedData.value).toMatchObject({ filled: 6, total: 6 });
    // The consent card: the avatar's name as it is now, and a brand's voice.
    expect(turn.suspended).toHaveLength(1);
    expect(turn.suspended[0].payload).toMatchObject({
      mode: 'manual',
      avatarName: 'Кухня команды',
      avatarKind: 'brand',
      canDecideForPerson: false,
    });
    expect(turn.suspended[0].payload.question).not.toMatch(/дайте аватару имя/);
  },
};
