'use strict';
const { heygenScenario, message, approve, quotation } = require('./heygen-scenario.cjs');

module.exports = heygenScenario('heygen-delivery-review', 'Настройки подачи отделены от явной ручной правки и обратной связи', [
  message('Откройте текущую подачу, проверьте взгляд и жесты, подберите настройки.', [
    'video.performance_v1', 'video.performance_scenes_v1', 'video.performance_settings_v1',
  ]),
  message(`${quotation} Сохраните эту ручную правку.`, ['video.performance_user_edit_v1'], 'video.performance_user_edit_v1'),
  approve('video.performance_user_edit_v1'),
  message(`${quotation} Запомните моё пожелание для следующих роликов.`, ['video.performance_preference_v1'], 'video.performance_preference_v1'),
  approve('video.performance_preference_v1'),
  message(`${quotation} Запишите моё замечание и предложите правку.`, [
    'video.performance_feedback_v1', 'video.performance_feedback_read_v1', 'video.performance_feedback_correction_v1',
  ]),
]);
