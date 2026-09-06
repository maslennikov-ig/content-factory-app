/**
 * Английские правила проверки на ИИ-штампы. Малый набор.
 *
 * `content-factory-next-tu3k.3`. Продукт двуязычный, и английский текст не
 * должен получать пустой отчёт: пустой отчёт читается как «всё чисто», а это
 * неправда. Здесь только признаки, у которых нет спора: метки чат-бота,
 * размытая ссылка на «экспертов», шаблонный переход, дежурный зачин,
 * словарь моделей (`delve`, `tapestry`), тройка через запятую и каскад
 * смягчений.
 *
 * Метки класса A и невидимые символы общие с русским списком: они про
 * происхождение текста, а не про язык.
 */
import { ARTEFACT_PATTERN, ZERO_WIDTH_PATTERN } from './slop-rules.ru';
import { LEFT, RIGHT, type SlopRule } from './slop-rules.types';

const list = (items: readonly string[]): RegExp =>
  new RegExp(`${LEFT}(?:${items.join('|')})${RIGHT}`, 'giu');

const HEDGES = [
  'perhaps',
  'possibly',
  'potentially',
  'generally',
  'typically',
  'arguably',
  'somewhat',
  'relatively',
  'in some cases',
  'in most cases',
  'it is possible that',
];

export const EN_RULES: SlopRule[] = [
  {
    id: 'artefact',
    severity: 'error',
    kind: 'regex',
    scope: 'raw',
    pattern: ARTEFACT_PATTERN,
    hint: {
      ru: 'Метка чат-бота или следа копипаста. Уберите её из текста.',
      en: 'A chatbot marker or a paste artefact. Remove it from the text.',
    },
  },
  {
    id: 'zero-width',
    severity: 'warn',
    kind: 'regex',
    scope: 'raw',
    pattern: ZERO_WIDTH_PATTERN,
    hint: {
      ru: 'Невидимый символ. Такое оставляют редакторы и рассылки — проверьте источник.',
      en: 'A zero-width character. Editors and mailing tools leave these — check the source.',
    },
  },
  {
    id: 'weasel-attribution',
    severity: 'warn',
    kind: 'regex',
    pattern: list([
      'experts say',
      'experts agree',
      'studies show',
      'research suggests',
      'researchers claim',
      'analysts note',
      'observers note',
      'it is widely believed',
      'according to various sources',
    ]),
    hint: {
      ru: 'Размытая ссылка. Назовите, кто именно это сказал, или уберите утверждение.',
      en: 'A vague attribution. Name who said it, or drop the claim.',
    },
  },
  {
    id: 'template-transition',
    severity: 'warn',
    kind: 'regex',
    pattern: list([
      "it'?s important to note",
      'it is important to note',
      "it'?s worth noting",
      'it should be noted',
      'it is worth mentioning',
    ]),
    hint: {
      ru: 'Шаблонный переход. Начните сразу с того, что важно.',
      en: 'A template transition. Start with the thing that matters.',
    },
  },
  {
    id: 'stock-opening',
    severity: 'warn',
    kind: 'regex',
    pattern: list([
      "in today'?s (?:world|digital age|fast-paced world)",
      'in the modern world',
      'in this day and age',
      'as we all know',
      "it'?s no secret that",
    ]),
    hint: {
      ru: 'Дежурный зачин. Первая фраза — уже факт, а не разгон.',
      en: 'A stock opening. The first sentence is already a fact, not a run-up.',
    },
  },
  {
    id: 'ai-vocabulary',
    severity: 'warn',
    kind: 'regex',
    pattern: list([
      'delve[sd]?',
      'delving',
      'tapestry',
      'realm of',
      'underscore[sd]?',
      'meticulous(?:ly)?',
      'game-?changer',
      'harness(?:es|ing)? the power',
      'navigating the (?:complexities|landscape)',
    ]),
    hint: {
      ru: 'Слово из словаря моделей. В живой речи оно почти не встречается.',
      en: 'A word out of the model vocabulary. Live speech barely uses it.',
    },
  },
  {
    id: 'rule-of-three',
    severity: 'warn',
    kind: 'regex',
    // Тройка через запятую с «and» перед последним членом — самый заметный
    // ритмический штамп англоязычной модели (A10 в каталоге владельца).
    pattern: /(?<![\p{L}\p{N}])[a-z]{4,}, [a-z]{4,}, and [a-z]{4,}(?![\p{L}\p{N}])/giu,
    hint: {
      ru: 'Тройка ради ритма. Оставьте то, что действительно есть.',
      en: 'A triad for rhythm’s sake. Keep only what is actually there.',
    },
  },
  {
    id: 'softener-cascade',
    severity: 'warn',
    kind: 'metric',
    metric: 'per-sentence',
    threshold: 3,
    pattern: list(HEDGES),
    hint: {
      ru: 'Каскад смягчений в одной фразе. Одно-два — речь, три — уклонение.',
      en: 'A cascade of hedges in one sentence. One or two is speech; three is evasion.',
    },
  },
];
