'use strict';
const { IDS, digest, approval, productionRow, videoRows } = require('./social-factory-video-world.cjs');
module.exports = {
  id: 'social-factory-video-launch-declined',
  title: 'Отказ на карточке видеопроекта сохраняет проверку и не создаёт платных заданий',
  covers: ['video.production_launch'],
  world: videoRows({ productions: [productionRow({ state: 'preflight', approval: approval() })] }),
  turns: [
    { say: 'Покажи согласие, пока не запускай.', model: [[['tool', 'video_production_launch', { productionId: IDS.production, approvalId: approval().id, digest }]]] },
    { approve: false, model: [[['text', 'Запуск отменён. Видеоверсия осталась без новых заданий.']]] },
  ],
  check(run) {
    expect(run.turns[0].approvals).toHaveLength(1);
    expect(run.turns[1].types).toContain('tool-output-denied'); expect(run.turns[1].outputs).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'production.launch')).toEqual([]); expect(run.writes).toEqual([]);
    expect(run.world.socialFactoryVideo.productions[0]).toMatchObject({ state: 'preflight', jobs: [], approval: { id: approval().id } });
    expect(run.world.socialFactoryVideo.launches).toBe(0);
  },
};
