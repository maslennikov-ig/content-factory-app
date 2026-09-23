import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * Слова трёх вкладок настроек, которых нет в шестнадцати файлах локалей
 * (`content-factory-next-97dq.51`, вариант A холста одиннадцатой волны).
 *
 * Та же договорённость, что у `ai-provider.copy.ts`: два языка рядом с кодом
 * вместо шестнадцати файлов с обещанием перевода, которого никто не писал.
 * Подписи, которые уже переведены во всех шестнадцати («Имя», «Удалить»,
 * «Способы входа», «Сохранить»), экраны по-прежнему берут через `t()`; сюда
 * легло только новое.
 */
export type SettingsCopyLocale = 'ru' | 'en';

type SettingsWords = {
  profile: {
    /** Подпись под именем: «с нами с 21.08.2026». */
    memberSince: (date: string) => string;
    changePhoto: string;
    aboutTitle: string;
    lastName: string;
    bio: string;
    bioPlaceholder: string;
    languageTimeTitle: string;
    interfaceLanguage: string;
    /** Язык уходит своей дверью и сразу, без «Сохранить». */
    languageNote: string;
    timezone: string;
    timezoneNote: string;
    /**
     * Город пояса своими словами, где он не совпадает с английским именем
     * из IANA: «Москва, UTC+3», а не «Europe/Moscow (GMT+03:00)».
     */
    timezoneCities: Readonly<Record<string, string>>;
    signInTitle: string;
    signInNone: string;
    saveFailed: string;
    /** Доступное имя занятой кнопки «Сохранить». */
    saving: string;
  };
  signIn: {
    notConnected: string;
    /** Доступное имя «⋯» у строки способа. */
    moreActions: (provider: string) => string;
    removeDescription: string;
    /** «Отменить», одно слово продукта для отмены (инвентарь, «Одно имя — один ключ»). */
    cancel: string;
  };
  global: {
    dateFormat: string;
    email: string;
    shortlink: string;
    ai: string;
    aiTitle: string;
    search: string;
    /** Имя полосы остатка для скринридера. */
    allowanceBar: string;
  };
};

export const settingsCopy: Record<SettingsCopyLocale, SettingsWords> = {
  ru: {
    profile: {
      memberSince: (date) => `с нами с ${date}`,
      changePhoto: 'Сменить фото',
      aboutTitle: 'О вас',
      lastName: 'Фамилия',
      bio: 'Коротко о себе',
      bioPlaceholder:
        'Кто вы и о чём пишете — 2–3 предложения. Помогает, когда аватара ещё нет.',
      languageTimeTitle: 'Язык и время',
      interfaceLanguage: 'Язык интерфейса',
      languageNote: 'Меняется сразу.',
      timezone: 'Часовой пояс',
      timezoneNote: 'В нём календарь и расписание показывают время.',
      timezoneCities: {
        'Europe/Kaliningrad': 'Калининград',
        'Europe/Moscow': 'Москва',
        'Europe/Simferopol': 'Симферополь',
        'Europe/Volgograd': 'Волгоград',
        'Europe/Kirov': 'Киров',
        'Europe/Astrakhan': 'Астрахань',
        'Europe/Saratov': 'Саратов',
        'Europe/Ulyanovsk': 'Ульяновск',
        'Europe/Samara': 'Самара',
        'Asia/Yekaterinburg': 'Екатеринбург',
        'Asia/Omsk': 'Омск',
        'Asia/Novosibirsk': 'Новосибирск',
        'Asia/Barnaul': 'Барнаул',
        'Asia/Tomsk': 'Томск',
        'Asia/Novokuznetsk': 'Новокузнецк',
        'Asia/Krasnoyarsk': 'Красноярск',
        'Asia/Irkutsk': 'Иркутск',
        'Asia/Chita': 'Чита',
        'Asia/Yakutsk': 'Якутск',
        'Asia/Vladivostok': 'Владивосток',
        'Asia/Sakhalin': 'Сахалин',
        'Asia/Magadan': 'Магадан',
        'Asia/Srednekolymsk': 'Среднеколымск',
        'Asia/Kamchatka': 'Камчатка',
        'Asia/Anadyr': 'Анадырь',
        'Europe/Minsk': 'Минск',
        'Europe/Kyiv': 'Киев',
        'Europe/Kiev': 'Киев',
        'Asia/Almaty': 'Алматы',
        'Asia/Tashkent': 'Ташкент',
        'Asia/Tbilisi': 'Тбилиси',
        'Asia/Yerevan': 'Ереван',
        'Asia/Baku': 'Баку',
        'Asia/Bishkek': 'Бишкек',
        'Europe/Berlin': 'Берлин',
        'Europe/London': 'Лондон',
        'Europe/Paris': 'Париж',
        'Europe/Istanbul': 'Стамбул',
        'Asia/Dubai': 'Дубай',
        'America/New_York': 'Нью-Йорк',
        UTC: 'UTC',
      },
      signInTitle: 'Вход и пароль',
      signInNone: 'Способов входа пока нет',
      saveFailed: 'Не удалось сохранить профиль',
      saving: 'Сохраняем профиль',
    },
    signIn: {
      notConnected: 'не подключён',
      moreActions: (provider) => `Действия: ${provider}`,
      removeDescription: 'Входить этим способом будет нельзя.',
      cancel: 'Отменить',
    },
    global: {
      dateFormat: 'Как показывать время везде',
      email: 'О чём присылать письма',
      shortlink: 'Что делать со ссылками в постах',
      ai: 'Чьими ключами работаем и сколько потрачено',
      aiTitle: 'ИИ',
      search: 'Где ищем опоры и проверяем факты',
      allowanceBar: 'Осталось в этом периоде',
    },
  },
  en: {
    profile: {
      memberSince: (date) => `member since ${date}`,
      changePhoto: 'Change photo',
      aboutTitle: 'About you',
      lastName: 'Last name',
      bio: 'About you in brief',
      bioPlaceholder:
        'Who you are and what you write about, in two or three sentences. Helps while there is no avatar yet.',
      languageTimeTitle: 'Language and time',
      interfaceLanguage: 'Interface language',
      languageNote: 'Applies at once.',
      timezone: 'Time zone',
      timezoneNote: 'The calendar and the schedule show times in this zone.',
      timezoneCities: {},
      signInTitle: 'Sign-in and password',
      signInNone: 'No sign-in methods yet',
      saveFailed: 'Could not save the profile',
      saving: 'Saving the profile',
    },
    signIn: {
      notConnected: 'not connected',
      moreActions: (provider) => `Actions: ${provider}`,
      removeDescription: 'You will no longer be able to sign in this way.',
      cancel: 'Cancel',
    },
    global: {
      dateFormat: 'How times are shown everywhere',
      email: 'What we email you about',
      shortlink: 'What happens to links in posts',
      ai: 'Whose keys we run on and how much is spent',
      aiTitle: 'AI',
      search: 'Where we look for supports and check facts',
      allowanceBar: 'Left this period',
    },
  },
};

/** Тот же единственный вопрос о языке, что у остальных экранов. */
export const resolveSettingsCopyLocale = (
  language: string | undefined | null
): SettingsCopyLocale => resolveContentLocale(language);

export const settingsWordsFor = (language: string | undefined | null) =>
  settingsCopy[resolveSettingsCopyLocale(language)];
