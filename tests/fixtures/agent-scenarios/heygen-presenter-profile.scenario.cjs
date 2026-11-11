'use strict';
const { heygenScenario, message, approve } = require('./heygen-scenario.cjs');

module.exports = heygenScenario('heygen-presenter-profile', 'Профиль ведущего сохраняется после подтверждения личности и голоса', [
  message('Откройте профили и предложите ведущего с выбранным голосом.', [
    'video.person_profiles', 'video.person_profile_resolve', 'video.person_profile_propose', 'video.person_profile_save',
  ], 'video.person_profile_save'),
  approve('video.person_profile_save'),
  message('Подготовьте настройки ролика, примените словарь и выбранный фон.', [
    'video.heygen_settings', 'video.heygen_options_v1', 'video.heygen_glossary_v1', 'video.heygen_background_v1',
  ]),
]);
