import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import {
  HELP_QUESTIONS,
  HELP_QUESTION_IDS,
  type HelpQuestion,
  type HelpQuestionId,
} from '@contentfactory/nestjs-libraries/help/help-faq.questions';

/**
 * Раздел помощи: вопросы живых прогонов и ответы к ним, двумя языками рядом с
 * кодом.
 *
 * Решение владельца 07.09.2026 (`m2eg.25`): «завести в продукте раздел помощи
 * и рассказать в нём, от чьего имени выходят посты». Первые вопросы задавали
 * на живых прогонах, и до того ответ на них жил в переписке, а не в продукте.
 * `content-factory-next-2q28.8` (25.09.2026) переписал устаревшие ответы и
 * добавил то, что спросит первый настоящий клиент — блогер со своим
 * Telegram-каналом: как подключить канал, что такое план канала, как
 * подтвердить бронь, откуда идеи и факты, почему нет просмотров.
 *
 * Слова живут здесь, а не отдельными ключами i18next, — та же договорённость,
 * что у `onboarding.copy.ts` и `content-section.copy.ts`: два языка,
 * выписанные рядом с кодом, вместо шестнадцати файлов локалей с обещанием
 * перевода, которого никто не писал. Русский текст — источник; английский
 * переведён с него.
 *
 * Одно слово сюда не попало нарочно — само название раздела. Оно нужно пункту
 * меню, заголовку вкладки браузера и заголовку страницы, то есть трём местам
 * сразу, и живёт одним ключом `help` во всех шестнадцати локалях.
 *
 * С `kcxz.24` сами вопросы и ответы лежат в
 * `libraries/nestjs-libraries/src/help/help-faq.questions.ts`: их читает и
 * этот экран, и навык «help» агента, так что чат не отвечает по второй копии.
 *
 * Источник правды — `docs/product/help-faq.md`. Вопросы и ответы там и в коде
 * совпадают дословно, и это проверяет `tests/help.screen.test.cjs`. Если ответ
 * разошёлся с кодом продукта, верен код, и тогда чинится ответ здесь и в
 * документе одним коммитом.
 *
 * Каждая подпись в «ёлочках» — это настоящая подпись экрана, слово в слово:
 * `tests/help.labels.guard.test.cjs` ищет её в русских словах продукта и
 * падает, если экран её больше не показывает. Ответ, который велит нажать
 * несуществующую кнопку, хуже отсутствующего.
 */

type Words = {
  pageLead: string;
  /** Подпись строки «где это лежит» под списком. */
  whereLabel: string;
  whereOnboarding: string;
  whereContent: string;
  questions: HelpQuestion[];
};

/**
 * Вопросы и ответы живут в `help-faq.questions.ts` рядом с сервером
 * (`kcxz.24`): их же читает навык «help» агента. Экран берёт их оттуда.
 */
export { HELP_QUESTION_IDS };
export type { HelpQuestion, HelpQuestionId };

/** Куда ведут ссылки строки «Где найти». Адреса уже существующих экранов. */
export const HELP_ONBOARDING_HREF = '/onboarding';
export const HELP_CONTENT_HREF = '/content';

export const helpCopy: { ru: Words; en: Words } = {
  ru: {
    pageLead: 'Короткие ответы на вопросы, которые задают чаще всего.',
    whereLabel: 'Где найти',
    whereOnboarding: 'С чего начать',
    whereContent: 'Контент',
    questions: HELP_QUESTIONS.ru,
  },
  en: {
    pageLead: 'Short answers to the questions that come up most often.',
    whereLabel: 'Where to find it',
    whereOnboarding: 'Where to start',
    whereContent: 'Content',
    questions: HELP_QUESTIONS.en,
  },
};

export type HelpLocale = keyof typeof helpCopy;

/**
 * Тот же разбор языка, что у остальных экранов этого поколения: всё, что не
 * русский, читается как английский, а не падает.
 */
export const resolveHelpLocale = (
  language: string | undefined | null
): HelpLocale => resolveContentLocale(language);
