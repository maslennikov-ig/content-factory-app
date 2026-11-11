'use strict';
const { heygenScenario, message, approve } = require('./heygen-scenario.cjs');

module.exports = heygenScenario('heygen-voice-setup', 'Источник, платная операция и личный выбор голоса подтверждаются отдельно', [
  message('Сохраните выбранный источник и назначение голоса после моего подтверждения.',
    ['video.heygen_voice_intake'], 'video.heygen_voice_intake'),
  approve('video.heygen_voice_intake'),
  message('Откройте сохранённые данные и подготовьте варианты для сравнения.', [
    'video.heygen_voice_status', 'video.heygen_voice_prepare_auditions', 'video.heygen_voice_prepare_clone', 'video.heygen_voice_execute',
  ], 'video.heygen_voice_execute'),
  approve('video.heygen_voice_execute'),
  message('Покажите ранее сохранённые варианты. Хочу подтвердить выбор самостоятельно.',
    ['video.heygen_voice_recover', 'video.heygen_voice_select'], 'video.heygen_voice_select'),
  approve('video.heygen_voice_select'),
  message('Примените сохранённое решение к профилю ведущего.', ['video.heygen_voice_apply_selected']),
]);
