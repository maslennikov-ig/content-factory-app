/**
 * Слова строки происхождения в окне поста.
 *
 * Два языка, а не шестнадцать, — как у `voice-copy.ts` и
 * `editorial-stage.copy.ts`. Причина не в лени: «Собрано из 1 подтверждений»
 * — это та самая ошибка, которую уже чинил `content-factory-next-fn33.54`, а
 * русское число выбирает слово из трёх, и ключ i18next такого выбора не даёт.
 * Всё, что можно сказать одним предложением без счёта, осталось ключами.
 */

import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';
import { resolveEditorialStageLocale } from '@contentfactory/frontend/components/launches/editorial-stage.copy';

export type ComposeLocale = 'ru' | 'en';

/** Одно решение о языке чтения, взятое там, где оно уже принято. */
export const resolveComposeLocale = (
  language: string | undefined | null
): ComposeLocale => resolveEditorialStageLocale(language);

export const composeCopy = {
  ru: {
    /**
     * Строка происхождения целиком: из скольких подтверждений собран пост и
     * чьим голосом он написан. Одно предложение, потому что вопрос один.
     */
    assembledFrom: (count: number) =>
      `Собрано из ${count} ${plural(count, [
        'подтверждения',
        'подтверждений',
        'подтверждений',
      ])}`,
    /**
     * Пост несёт контекст, но ни одно подтверждение за ним не записано.
     * Числа нет — и придумывать его неоткуда.
     */
    assembledFromUnknown: 'Собрано из подтверждений',
    writtenBy: (voice: string) => `пишет аватар «${voice}»`,
    /** Профиль есть, а имени у него нет: тогда честно назвать версию. */
    writtenByVersion: (version: string) => `пишет профиль ${version}`,
    writtenByNeutral: 'пишет нейтральный стиль',
    details: 'Подробнее',
    detailProfile: 'Профиль',
    detailValidUntil: 'Действует до',
    detailChecked: 'Проверено на сервере',
    stateReady: 'Контекст собран и проверен.',
    statePartial: 'Контекст собран частично: часть источников не ответила.',
    stateStale: 'Контекст устарел — соберите его заново.',
    stateConflict:
      'Источники противоречат друг другу — на них пока нельзя опереться.',
    stateUnavailable:
      'Контекста пока нет: подтверждённых источников не найдено.',
    /**
     * Второй ряд кругов под кругами выбора. Владелец прочитал его как
     * повтор выбора, а красный крестик — как значок ошибки
     * (`content-factory-next-fn33.76`). Ряд называет себя сам, и крестик
     * говорит, что он делает.
     */
    selectedChannelsRow:
      'Выбранные каналы: откройте канал, чтобы настроить его отдельно',
    removeChannel: 'Убрать канал из поста',
    /**
     * Отказ называется там, где он случился, и вместе со следующим шагом.
     *
     * Человек взял фрагменты поиском и ждёт их в тексте; продукт считает
     * подтверждённым только то, что подтвердили на витрине «Откуда факты», и
     * до тех пор в текст не берёт ничего. Слово «пока» здесь не украшение:
     * это не отказ навсегда, а незакрытый шаг.
     */
    unverifiedDropped: (count: number) =>
      `${count} ${plural(count, [
        'взятый фрагмент',
        'взятых фрагмента',
        'взятых фрагментов',
      ])} ${plural(count, [
        'пока не подтверждён',
        'пока не подтверждены',
        'пока не подтверждены',
      ])} и в текст не ${plural(count, ['попал', 'попали', 'попали'])}.`,
    unverifiedNextStep: 'Подтвердить их можно на витрине',
    unverifiedLink: 'Откуда факты',
  },
  en: {
    assembledFrom: (count: number) =>
      `Assembled from ${count} ${count === 1 ? 'confirmation' : 'confirmations'}`,
    assembledFromUnknown: 'Assembled from evidence',
    writtenBy: (voice: string) => `written by the “${voice}” avatar`,
    writtenByVersion: (version: string) => `written by profile ${version}`,
    writtenByNeutral: 'written in the neutral style',
    details: 'Details',
    detailProfile: 'Profile',
    detailValidUntil: 'Valid until',
    detailChecked: 'Checked against the server',
    stateReady: 'The context is gathered and verified.',
    statePartial: 'The context is partly gathered: some sources did not answer.',
    stateStale: 'The context is out of date — gather it again.',
    stateConflict:
      'The sources contradict each other, so nothing here can be leaned on yet.',
    stateUnavailable: 'There is no context yet: no confirmed sources were found.',
    selectedChannelsRow:
      'Selected channels: open one to set it up on its own',
    removeChannel: 'Remove this channel from the post',
    unverifiedDropped: (count: number) =>
      `${count} taken ${
        count === 1 ? 'fragment is' : 'fragments are'
      } not confirmed yet, so ${
        count === 1 ? 'it' : 'they'
      } stayed out of the text.`,
    unverifiedNextStep: 'Confirm them under',
    unverifiedLink: 'Facts',
  },
} satisfies Record<ComposeLocale, Record<string, unknown>>;
