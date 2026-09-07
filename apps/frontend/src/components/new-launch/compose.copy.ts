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
    /**
     * Куда смотреть за находкой — в список материала этого же окна: там она
     * стоит с ярлыком. На витрину «Откуда факты» записка не ведёт: находка без
     * факта там не показывается, и обещать подтверждение было бы неправдой.
     */
    searchNextStep:
      'Они стоят в списке материала этого окна с ярлыком «Взято из поиска». Подтверждённым фрагмент становится только после проверки человеком.',
    /**
     * Не отказ, а состав: это вошло в текст, и вот под каким именем.
     *
     * 05.09.2026 владелец разрешил брать непроверенные находки и просил
     * называть их «взято из поиска», а не «не проверено»
     * (`content-factory-next-ec48`). Поэтому предложение говорит о том, что
     * случилось, а не о том, чего не случилось, и повторяет ту самую
     * пометку — она же стоит ярлыком в списке материала и строкой в промпте,
     * и человек должен узнать её, а не встретить третье слово.
     */
    searchEvidenceUsed: (count: number) =>
      `${count} ${plural(count, [
        'фрагмент',
        'фрагмента',
        'фрагментов',
      ])} ${plural(count, ['взят', 'взяты', 'взяты'])} из поиска и ${plural(
        count,
        ['вошёл', 'вошли', 'вошли']
      )} в текст с пометкой «взято из поиска».`,
    /**
     * Справка «Что взято и откуда» под текстом поста
     * (`content-factory-next-m2eg.17`).
     *
     * Заголовок отвечает на вопрос человека, а не называет устройство: он
     * смотрит на свой текст и спрашивает, откуда в нём эти числа. До
     * 07.09.2026 здесь стояло «Использованные цитаты» и просьба отметить
     * нужное — работа, которую продукт с тех пор делает сам.
     */
    materialUsedTitle: 'Что взято и откуда',
    materialUsedHelp:
      'Факты и источники, на которые опирается этот текст. Отмечать ничего не нужно.',
    /**
     * «Свои тексты по теме» (`content-factory-next-m2eg.19`).
     *
     * Подпись говорит, зачем список здесь: это то же, что видит модель, когда
     * пишет. Обещания «мы поняли смысл» в словах нет — поиск ищет по словам,
     * пусть и со стеммингом.
     */
    relatedTitle: 'Свои тексты по теме',
    relatedHelp:
      'Ваши вышедшие посты, близкие по словам. Их же видит модель — и может сослаться на один из них, если это к месту.',
    /**
     * Имя стрелки рядом с основной кнопкой (`content-factory-next-m2eg.18`).
     * Кнопка без подписи обязана иметь имя, иначе с экрана её читают как
     * «кнопка».
     */
    morePublishingActions: 'Другие способы отправить',
    /**
     * Подписи пунктов меню отправки. Каждая говорит, что случится со ВРЕМЕНЕМ
     * поста: это единственное, чем два пункта различаются, и раньше об этом не
     * было сказано нигде.
     */
    postNowHint: 'в канал сразу, минуя расписание',
    keepScheduledAt: (time: string) => `оставить в расписании на ${time}`,
    addToCalendarHint: 'поставить в календарь на выбранное время',
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
    searchNextStep:
      'They stand in this window’s material list under the “From web search” mark. A fragment counts as confirmed only after a person has checked it.',
    searchEvidenceUsed: (count: number) =>
      `${count} ${
        count === 1 ? 'fragment' : 'fragments'
      } came from web search and went into the text marked “from web search”.`,
    materialUsedTitle: 'What this text is built on',
    materialUsedHelp:
      'The facts and sources this text leans on. Nothing here needs marking.',
    relatedTitle: 'Your own posts on this topic',
    relatedHelp:
      'Your published posts that share words with this one. The model sees the same list and may point back at one of them when it fits.',
    morePublishingActions: 'Other ways to send this',
    postNowHint: 'straight to the channel, skipping the schedule',
    keepScheduledAt: (time: string) => `keep it scheduled for ${time}`,
    addToCalendarHint: 'put it on the calendar at the chosen time',
  },
} satisfies Record<ComposeLocale, Record<string, unknown>>;
