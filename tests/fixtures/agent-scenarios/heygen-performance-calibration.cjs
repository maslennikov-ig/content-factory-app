'use strict';

// Scripted inputs for policy checks. These examples contain no actual render observations.
module.exports = [
  {name: 'invitation', script: 'Приглашаю вас на встречу. Вместе обсудим, как начать новый проект.',
    proposed: {context: 'invitation'}, expected: {delivery: 'natural', gaze: 'camera', facialIntensity: 'low', gestures: 'sparse'}},
  {name: 'tutorial', script: 'Сначала откройте настройки. Выберите рабочее пространство и нажмите «Сохранить».',
    proposed: {context: 'explainer'}, expected: {delivery: 'restrained', gaze: 'camera', facialIntensity: 'low', gestures: 'none'}},
  {name: 'serious update', script: 'Сегодня выпуск переносится. Новый срок сообщим после проверки.',
    proposed: {context: 'serious'}, expected: {delivery: 'restrained', gaze: 'camera', facialIntensity: 'low', gestures: 'none'}},
  {name: 'personal thanks', script: 'Спасибо, что нашли время помочь. Для меня это многое значит.',
    proposed: {context: 'thanks'}, expected: {delivery: 'natural', gaze: 'camera', facialIntensity: 'low', gestures: 'sparse'}},
  {name: 'explicitly vivid advertisement', script: 'У нас открылась запись на новый сезон. Присоединяйтесь!',
    proposed: {context: 'promotion', delivery: 'energetic'}, expected: {delivery: 'energetic', gaze: 'camera', facialIntensity: 'high', gestures: 'sparse'}},
  {name: 'interview', script: 'Я впервые услышал об этой идее на встрече с командой.',
    proposed: {context: 'dialogue'}, expected: {delivery: 'natural', gaze: 'partner', facialIntensity: 'low', gestures: 'none'}},
  {name: 'short greeting', script: 'Привет! Рад вас видеть.',
    proposed: {context: 'general'}, expected: {delivery: 'natural', gaze: 'camera', facialIntensity: 'low', gestures: 'none'}},
  {name: 'exaggerated reference', script: 'Приходите на встречу. Там мы разберём три идеи.',
    proposed: {context: 'promotion', delivery: 'energetic', gaze: 'partner', facialIntensity: 'high', gestures: 'sparse'},
    manual: {delivery: 'restrained', gaze: 'camera', facialIntensity: 'low', gestures: 'none'},
    expected: {delivery: 'restrained', gaze: 'camera', facialIntensity: 'low', gestures: 'none'}},
];
