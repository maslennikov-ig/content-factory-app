'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoicePathsScreen,
  type VoicePathsState,
} from './voice-paths.screen';

/**
 * Screen 02: three ways in, offered as equals.
 *
 * The state worth the most attention is `disabled`, where the reference path
 * is closed by policy. An organisation that has decided it does not want that
 * door still has two, and the screen has to say which one is shut and why
 * rather than quietly showing two cards where there were three.
 */

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/paths',
  fixture: { screen: '02', paths: ['manual', 'own', 'reference'] },
  notes: {
    default: {
      ru: 'Три равнозначных входа. Третий объясняет себя двумя колонками до нажатия, а не после.',
      en: 'Three equal inputs. The third explains itself in two columns before the click, not after.',
    },
    empty: {
      ru: 'Своих текстов нет — путь 2 закрыт и говорит, когда откроется. Пути 1 и 3 работают.',
      en: 'No texts of their own: path 2 is closed and says when it opens. Paths 1 and 3 work.',
    },
    selected: {
      ru: 'Выбор помечен рамкой, заливкой и галочкой — не одним цветом.',
      en: 'The choice is marked by a border, a fill and a tick — not by colour alone.',
    },
    restricted: {
      ru: 'Чтение каналов не разрешено, поэтому путь 2 закрыт, и сказано, кто даёт доступ.',
      en: 'Reading the channels is not permitted, so path 2 is closed and names who grants it.',
    },
    disabled: {
      ru: 'Манера чужого автора отключена политикой. Дверь закрыта явно, а не убрана из виду.',
      en: 'The reference path is switched off by policy. The door is visibly shut, not removed.',
    },
    'long-content': {
      ru: 'Длинный заголовок третьего пути переносится на две строки; карточки не сжимаются.',
      en: 'The third path’s long title wraps to two lines; the cards do not shrink.',
    },
  },
  render: ({ state, locale }) => (
    <VoicePathsScreen
      locale={locale}
      state={state as VoicePathsState}
      selected={state === 'selected' ? 'own' : undefined}
      available={{
        manual: true,
        own: state !== 'empty' && state !== 'restricted',
        reference: state !== 'disabled',
      }}
      disabledReasons={{
        own:
          state === 'empty'
            ? locale === 'ru'
              ? 'Мы не нашли ни одного вашего текста. Путь откроется, как только появится хотя бы один.'
              : 'We found none of your texts. This path opens as soon as there is one.'
            : state === 'restricted'
            ? locale === 'ru'
              ? 'Путь требует доступа к опубликованным постам. Разрешение даёт владелец канала.'
              : 'This path needs access to published posts. The channel owner grants it.'
            : undefined,
        reference:
          state === 'disabled'
            ? locale === 'ru'
              ? 'Манера чужого автора отключена политикой организации. Доступны пути 1 и 2.'
              : 'The reference path is disabled by organisation policy. Paths 1 and 2 are open.'
            : undefined,
      }}
    />
  ),
});
