'use strict';
const {
  IDS,
  SOURCE,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
module.exports = {
  id: 'native-clip-text-reuse',
  title:
    'Текстовый пилот привязан к авторскому сообщению и чату; открытие и продолжение сохраняют захваченный текст на границе модели',
  covers: [
    'video.preproduction',
    'video.preproduction_open',
    'video.preproduction_resume_review',
  ],
  world: journeyRows(),
  turns: [
    {
      say: 'Подготовь текстовый пилот по выбранному материалу. В этом сценарии нельзя вызывать модель или провайдер.',
      model: [
        [
          [
            'tool',
            'video_preproduction',
            {
              requestMessageId: 'msg-user-1',
              sourceArtifact: SOURCE,
              outputLocale: 'ru',
            },
          ],
        ],
        [
          [
            'text',
            'Сохранена привязка к исходнику и авторскому сообщению. Текст не прошёл независимую проверку; генерация не выполнялась.',
          ],
        ],
      ],
    },
    {
      say: 'Открой этот пилот и продолжи проверку уже сохранённого текста. Не создавай новый текст.',
      model: [
        [['tool', 'video_preproduction_open', { pilotId: IDS.text }]],
        [['tool', 'video_preproduction_resume_review', { pilotId: IDS.text }]],
      ],
    },
    {
      say: 'Проверь сохранённое состояние после остановки на границе модели; отдельно проверь, что чужой пилот недоступен.',
      model: [
        [['tool', 'video_preproduction_open', { pilotId: IDS.text }]],
        [['tool', 'video_preproduction_open', { pilotId: 'foreign-pilot' }]],
        [
          [
            'text',
            'Продолжение остановлено на границе модели. Сохранённый текст и исходное поручение остались прежними; чужой пилот закрыт.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const [first, second, third] = run.turns,
      data = run.world.nativeJourney;
    expect(summary(first, 'video_preproduction')).toMatchObject({
      pilotId: IDS.text,
      threadId: run.threadId,
      sourceArtifact: SOURCE,
      state: 'needs_input',
      independentReviewAccepted: false,
      blocker: 'OFFLINE_MODEL_BOUNDARY',
    });
    expect(summary(second, 'video_preproduction_open')).toEqual(
      summary(first, 'video_preproduction')
    );
    expect(second.outputs[1].output).toMatchObject({
      ok: false,
      code: 'OFFLINE_MODEL_BOUNDARY',
    });
    expect(summary(third, 'video_preproduction_open')).toEqual(
      summary(first, 'video_preproduction')
    );
    expect(third.outputs[1].output).toMatchObject({
      ok: false,
      code: 'CLIP_PREPRODUCTION_ACCESS_DENIED',
    });
    const pilot = data.pilots.find((p) => p.id === IDS.text);
    expect(pilot).toMatchObject({
      organizationId: 'org-1',
      actorId: 'user-1',
      threadId: run.threadId,
      originalSource: SOURCE,
      originalRequest: {
        messageId: 'msg-user-1',
        text: module.exports.turns[0].say,
      },
    });
    expect(data.pendingReviews).toEqual([
      { pilotId: IDS.text, capturedAuthor: pilot.capturedAuthor },
    ]);
    expect(
      run.requests
        .filter((r) => r[0].startsWith('journey.clip.'))
        .every(
          (r) => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId
        )
    ).toBe(true);
    expect(run.turns.flatMap((t) => t.approvals)).toEqual([]);
    expect(data.launchIntents).toEqual([]);
    expect(data.repairIntents).toEqual([]);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
