'use strict';

/**
 * The sixteen topics every variant and every corpus is measured on.
 *
 * They are fixed, and they are the same list for everybody, because the stand
 * compares voice blocks and not subjects. Change the list and no run before
 * the change is comparable with any run after it — that is why the list lives
 * here as a constant with a version rather than as a command-line argument.
 *
 * They are written in English and generated in the corpus language: the
 * product's own `contentLanguageInstruction` decides the output language, so
 * one list serves a Russian corpus, an English one and whatever `pl1.4`
 * brings. Translating the list per corpus would mean the corpora were no
 * longer answering the same question.
 *
 * They are deliberately neutral about trade, seniority and industry. A topic
 * like "our release process" would give an engineer a home advantage over a
 * teacher, and the epic's whole point is that a number obtained on one author
 * proves nothing.
 */

/**
 * Восемь тем стало шестнадцатью 27.08.2026, и это не «побольше выборки».
 *
 * Бутстрап в `paired.cjs` ресемплит ТЕМЫ, а не генерации, — этого требуют оба
 * ресерча, и по делу: восемь тем, сгенерированных пять раз каждая, это восемь
 * наблюдений, а не сорок. Значит ширину интервала держит разброс между темами,
 * и второй прогон по тем же восьми темам добавляет наблюдений внутри темы и
 * почти не двигает интервал. Шестнадцать тем двигают.
 *
 * Версия двинута, потому что прогоны до и после несравнимы: доля закрытого
 * разрыва берётся по медиане тем, а состав тем изменился.
 */
const TOPICS_VERSION = 'voice-eval-topics/1.1.0';

const TOPICS = [
  {
    id: 't1',
    request: 'How you decide what to work on next week.',
  },
  {
    id: 't2',
    request: 'A mistake that cost you time, and what you changed after it.',
  },
  {
    id: 't3',
    request: 'How you choose a tool for a task you repeat often.',
  },
  {
    id: 't4',
    request: 'What a working day looks like when it goes well.',
  },
  {
    id: 't5',
    request: 'How you explain what you do to somebody outside your field.',
  },
  {
    id: 't6',
    request: 'A habit you kept for a year, and what it gave you.',
  },
  {
    id: 't7',
    request: 'What you check before you call something finished.',
  },
  {
    id: 't8',
    request: 'How you decide to say no to a request.',
  },
  /**
   * Восемь вторых, добавленных 27.08.2026.
   *
   * Той же породы, что и первые восемь, и по той же причине: они спрашивают о
   * работе вообще, а не о профессии. «Наш релизный процесс» дал бы инженеру
   * фору перед учителем, а весь смысл эпика в обратном — число, снятое на
   * одном авторе, не доказывает ничего про другого.
   *
   * Порядок не трогается: `t1`…`t8` остались на своих местах и с теми же
   * словами, так что старые генерации по ним читаются как раньше, а
   * несравнимость двух прогонов держится версией списка, а не тем, что тема
   * незаметно поменяла формулировку.
   */
  {
    id: 't9',
    request: 'How you get back into a task after being interrupted.',
  },
  {
    id: 't10',
    request: 'Something you used to believe about your work and no longer do.',
  },
  {
    id: 't11',
    request: 'How you tell somebody their work needs changing.',
  },
  {
    id: 't12',
    request: 'What you do when two things are urgent at the same time.',
  },
  {
    id: 't13',
    request: 'A small change that turned out to matter more than it looked.',
  },
  {
    id: 't14',
    request: 'How you decide something is worth learning properly.',
  },
  {
    id: 't15',
    request: 'What you keep track of, and where you keep it.',
  },
  {
    id: 't16',
    request: 'How you notice that something is going wrong before it does.',
  },
];

module.exports = { TOPICS, TOPICS_VERSION };
