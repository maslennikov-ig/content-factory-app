'use strict';

/**
 * Correctness review of the W3 walk fixes, F4: several lines by hand in one
 * call, one of them refused (the panel's form changed the draft meanwhile).
 * The lines before and after it are saved, and the answer names both lists,
 * so the model says which lines were kept instead of «nothing saved». The
 * older one-line shape (`field` + `text`, MCP clients and old threads) still
 * writes its line.
 */
module.exports = {
  id: 'avatar-manual-lines-partial',
  title: 'Строки вручную — одна не сохранилась: ответ говорит, какие сохранены, а какие нет',
  covers: ['avatar.manual.field'],
  world: { manualFieldConflicts: ['TONE'] },
  turns: [
    {
      say: 'Кто говорит: я, Игорь. Тон: спокойно. Темы: практика.',
      model: [
        [
          [
            'tool',
            'avatar_manual_field',
            {
              lines: [
                { field: 'WHO_SPEAKS', text: 'Я, Игорь' },
                { field: 'TONE', text: 'Спокойно' },
                { field: 'TOPICS', text: 'Практика' },
              ],
            },
          ],
        ],
        [['text', 'Сохранили «Кто говорит» и «Темы»; «Тон» не сохранился — черновик изменился. Повторим его?']],
      ],
    },
    {
      say: 'Аудитория: руководители небольших команд',
      model: [
        [['tool', 'avatar_manual_field', { field: 'AUDIENCE', text: 'Руководители небольших команд' }]],
        [['text', 'Записали аудиторию.']],
      ],
    },
  ],
  check: (run) => {
    const [partial, single] = run.turns;
    const output = partial.outputs[0].output;
    expect(output.ok).toBe(true);
    expect(output.summary.untrustedData.value).toMatchObject({
      written: ['WHO_SPEAKS', 'TOPICS'],
      refused: [{ field: 'TONE', code: 'VOICE_REVISION_CONFLICT' }],
    });
    expect(run.writes.filter(([name]) => name === 'avatar.manual.field').map(([, , key]) => key)).toEqual([
      'WHO_SPEAKS',
      'TOPICS',
      'AUDIENCE',
    ]);
    expect(single.outputs[0].output).toMatchObject({ ok: true });
    expect(single.outputs[0].output.summary.untrustedData.value.written).toEqual(['AUDIENCE']);
  },
};
