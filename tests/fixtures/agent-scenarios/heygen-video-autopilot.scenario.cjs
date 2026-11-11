'use strict';
const { heygenScenario, message, approve } = require('./heygen-scenario.cjs');

module.exports = heygenScenario('heygen-video-autopilot', 'Автопилот выполняет действия после подтверждения ограничений', [
  message('Согласуем пределы автопилота для одного видео и одного обращения к эксперту.',
    ['video.heygen_authorize_scope_v2'], 'video.heygen_authorize_scope_v2', 'autopilot'),
  approve('video.heygen_authorize_scope_v2'),
  message('Попросите эксперта выбрать подачу в согласованных пределах.', ['video.heygen_creative_expert_v2']),
  message('Запустите согласованное видео.', ['video.heygen_launch_scoped_v2']),
  message('Остановите дальнейшую работу автопилота.', ['video.heygen_scope_stop_v2']),
]);
