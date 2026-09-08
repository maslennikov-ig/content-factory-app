import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * `content-factory-next-m2eg.24`: то, что владелец не смог прочитать.
 *
 * Живой прогон 07.09.2026, дословно: «расходы по участнику… не понимаю, где
 * смотреть, потому что там же их нет. А еще для меня не очень понятны разделы
 * «модель на роль вызова»… непонятно написаны, непонятно, а зачем они нужны».
 *
 * Две разные жалобы с одной причиной — экран молчит там, где ему нечего
 * сказать:
 *
 *  - обе таблицы расхода рисовались только при непустом списке, а список
 *    пуст, пока не сделан первый вызов модели. Человек искал раздел, которого
 *    в этот момент буквально не было на странице, и решал, что расхода не
 *    видно нигде. Ноль — это ответ, и его надо напечатать;
 *  - у ролей вызова был заголовок, одна строка подсказки и шесть полей с
 *    названиями вроде «Разбор текста». Что такое роль вызова, почему пусто —
 *    это нормально и зачем вообще их трогать, не было сказано нигде.
 *
 * Слова живут здесь, а не семнадцатым ключом i18next: `onboarding.copy.ts`
 * и `content-section.copy.ts` записали эту договорённость раньше — два языка
 * рядом с кодом вместо шестнадцати файлов с обещанием перевода, которого никто
 * не писал. Подписи, которые уже переведены во всех шестнадцати, экран
 * по-прежнему берёт через `t()`; сюда переехало только то, чего там не было.
 */

type RoleWords = {
  /** Одна строка: что эта роль делает. */
  what: string;
};

type Words = {
  /** Строка таблицы, когда за период не было ни одного вызова. */
  usageNone: string;
  /** Почему таблица пуста, и что её наполнит. */
  usageNoneHint: string;
  /** Что вообще такое роль вызова. */
  rolesWhat: string;
  /** Что значит пустое поле. */
  rolesEmpty: string;
  /** Зачем менять. */
  rolesWhy: string;
  roles: {
    classify: RoleWords;
    extract: RoleWords;
    research: RoleWords;
    draft: RoleWords;
    judge: RoleWords;
    review: RoleWords;
    image: RoleWords;
  };
};

export const aiProviderCopy: { ru: Words; en: Words } = {
  ru: {
    usageNone: 'Пока 0',
    usageNoneHint:
      'Расход появляется после первого вызова модели: пока за этот период ни одного не было.',
    rolesWhat:
      'Роль вызова — это работа, ради которой продукт обращается к модели. Стоимость зависит от вида работы и выбранной модели.',
    rolesEmpty:
      'Пустое поле означает «брать модель для текста, указанную выше» — то есть модель провайдера по умолчанию. Ничего заполнять не обязательно.',
    rolesWhy:
      'Менять стоит ради денег: мелкие роли — классификация, разбор — прекрасно работают на дешёвой модели, а платить за них по цене черновика незачем.',
    roles: {
      classify: {
        what: 'Классификация — одно предложение на входе, несколько коротких полей на выходе: к чему относится тема, годится ли источник.',
      },
      extract: {
        what: 'Разбор текста — вытащить из страницы или письма факты и цитаты, ничего не сочиняя.',
      },
      research: {
        what: 'Веб-исследование — собрать и свести найденное в сети, когда включён поиск.',
      },
      draft: {
        what: 'Черновик — собственно написание поста по заготовке и брифу. Самая дорогая роль, и здесь экономия видна сразу.',
      },
      judge: {
        what: 'Проверка голоса — сверить готовый текст с вашей манерой и сказать, где он на неё не похож.',
      },
      review: { what: 'Проверка адаптации — убрать штампы, сверить утверждения с сутью заготовки или сделать оба действия за один вызов.' },
      image: {
        what: 'Картинки — единственная роль, которой нужна модель, умеющая рисовать.',
      },
    },
  },
  en: {
    usageNone: 'Nothing yet',
    usageNoneHint:
      'Usage appears after the first model call: there has not been one this period.',
    rolesWhat:
      'A call role is the job the product goes to a model for. Cost depends on the job and the chosen model.',
    rolesEmpty:
      'An empty field means "use the text model above" — the provider default. Filling these in is optional.',
    rolesWhy:
      'The reason to change one is money: the small roles — classification, extraction — do fine on a cheap model, and paying draft prices for them buys nothing.',
    roles: {
      classify: {
        what: 'Classification — one sentence in, a few short fields out: what a subject belongs to, whether a source is usable.',
      },
      extract: {
        what: 'Extraction — pulling facts and quotations out of a page or a letter, inventing nothing.',
      },
      research: {
        what: 'Web research — gathering and summarising what search found, when search is on.',
      },
      draft: {
        what: 'Draft — actually writing the post from the piece and the brief. The most expensive role, and where a change shows first.',
      },
      judge: {
        what: 'Voice check — comparing the finished text against your own way of writing and saying where it drifts.',
      },
      review: { what: 'Adaptation review — remove cliches, compare claims with the piece, or do both in one call.' },
      image: {
        what: 'Images — the one role that needs a model which can draw.',
      },
    },
  },
};

export type AiProviderLocale = keyof typeof aiProviderCopy;

/**
 * Какой из двух языков читает человек. Тот же единственный вопрос с тем же
 * единственным ответом, что у остальных экранов, поэтому он делегируется, а не
 * пишется тут девятым тернарником (`content-factory-next-w4vh`).
 */
export const resolveAiProviderLocale = (
  language: string | undefined | null
): AiProviderLocale => resolveContentLocale(language);
