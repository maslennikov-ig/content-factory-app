'use strict';
const { heygenScenario, message, approve } = require('./heygen-scenario.cjs');

module.exports = heygenScenario('heygen-appearance', 'Запрос нового образа проходит карточку, затем открывается сохранённое изображение', [
  message('Подготовьте новый образ и покажите карточку перед созданием.',
    ['video.heygen_style_prepare', 'video.heygen_style_submit'], 'video.heygen_style_submit'),
  approve('video.heygen_style_submit'),
  message('Откройте, восстановите и выберите сохранённый образ.',
    ['video.heygen_style_status', 'video.heygen_style_recover', 'video.heygen_style_select']),
]);
