'use client';

import { defineVoiceScene } from './voice.review-scenes';
import { VoiceEmptyScreen, type VoiceEmptyState } from './voice-empty.screen';
import { voiceCopy } from './voice-copy';

/**
 * Screen 01: the Content section before a voice exists.
 *
 * The state that matters most here is `empty`, and what it has to prove is a
 * negative — that it does not look like a failure. No alert role, no danger
 * colour, no exclamation mark, and a sentence saying plainly that generating
 * without a profile is a working mode.
 */

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/empty',
  fixture: { screen: '01', title: voiceCopy.ru.emptyTitle },
  notes: {
    empty: {
      ru: 'Профиля нет — и это не отказ. Ни роли alert, ни цвета опасности, ни восклицательного знака.',
      en: 'No profile, and not a failure. No alert role, no danger colour, no exclamation mark.',
    },
    restricted: {
      ru: 'Участник видит, что голоса нет, и почему создать его может только владелец.',
      en: 'A member sees that there is no voice, and why only an owner may create one.',
    },
    disabled: {
      ru: 'Создание закрыто политикой организации; объяснение стоит рядом с кнопкой, а не вместо неё.',
      en: 'Creation is closed by policy; the reason sits beside the button, not instead of it.',
    },
    'long-content': {
      ru: 'Длинное объяснение переносится и не выталкивает кнопки за край на 390px.',
      en: 'A long explanation wraps and does not push the buttons off a 390px screen.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceEmptyScreen
      locale={locale}
      state={state as VoiceEmptyState}
      note={
        state === 'restricted'
          ? locale === 'ru'
            ? 'Аватара создаёт владелец рабочего пространства. Вы видите его и пользуетесь им, но не меняете.'
            : 'The workspace owner creates the brand voice. You can see and use it, but not change it.'
          : state === 'disabled'
          ? locale === 'ru'
            ? 'Создание голоса отключено политикой организации.'
            : 'Creating a voice is disabled by organisation policy.'
          : state === 'error'
          ? locale === 'ru'
            ? 'Профиль не прочитан. Ничего не потеряно — попробуйте ещё раз.'
            : 'The profile could not be read. Nothing was lost — try again.'
          : state === 'long-content'
          ? locale === 'ru'
            ? 'Аватар описывает не только тон, но и длину фраз, ритм чередования коротких и длинных предложений, привычки пунктуации, обращение к читателю, долю перечислений и список формулировок, которые не появляются в текстах никогда.'
            : 'A brand voice describes not only tone but phrase length, the rhythm of alternating short and long sentences, punctuation habits, how the reader is addressed, the share of lists, and the phrases that never appear in the text at all.'
          : undefined
      }
    />
  ),
});
