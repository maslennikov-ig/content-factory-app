'use strict';

/**
 * «Почему это ваш повод», and the two ways it used to say nothing
 * (`content-factory-next-75xn.23`, F14).
 *
 * On 13.09.2026 forty leads carried two sentences between them: «Свежее за 30
 * дней по теме …» and «Тема повторилась у нескольких ваших подписок». The
 * second was printed over a third of the rows because one shared word longer
 * than five letters counted as a repeat — and for five subscriptions about
 * work and AI the shared word was the topic itself.
 *
 * So: a sentence the discovery judge wrote about the material wins over every
 * rule, and the «repeated» rule needs two words neither subscription asked
 * for. Everything else is unchanged, and this suite says which is which.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { leadReason } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-reason.ts'
);

const base = (over = {}) => ({
  title: 'Комиссии на маркетплейсах выросли',
  excerpt: 'Комиссии площадок впервые превысили сорок процентов от стоимости товара.',
  subscriptionDisplayName: 'комиссии Wildberries и Ozon',
  subscriptionQuery: 'комиссии Wildberries и Ozon',
  ownPostsText: [],
  siblingTitles: [],
  freshWithinDays: 30,
  ...over,
});

describe('a sentence about the material beats every rule', () => {
  test('the judged reason is returned as written', () => {
    const judged = {
      ru: 'Комиссии площадок впервые перевалили за 40% от цены товара.',
      en: 'Marketplace fees passed 40% of the item price for the first time.',
    };

    expect(leadReason(base({ judgedReason: judged }))).toEqual(judged);
  });

  test('it wins even where a rule would have matched', () => {
    const judged = { ru: 'Что-то конкретное.', en: 'Something concrete.' };

    const reason = leadReason(
      base({
        judgedReason: judged,
        ownPostsText: ['мы писали про комиссии маркетплейсов'],
        siblingTitles: ['Комиссии на маркетплейсах выросли'],
      })
    );

    expect(reason).toEqual(judged);
  });

  test('half a sentence is not a judgement, and the rules take over', () => {
    const reason = leadReason(
      base({ judgedReason: { ru: 'Только по-русски.', en: '   ' } })
    );

    expect(reason.ru).toContain('Свежее за 30 дней');
  });
});

describe('«тема повторилась» needs a real coincidence', () => {
  test('one shared word is not a repeat — least of all the topic’s own word', () => {
    const reason = leadReason(
      base({
        siblingTitles: ['Комиссии банков снова обсуждают'],
      })
    );

    // «комиссии» is what this subscription watches; a neighbour mentioning it
    // says nothing. The window sentence is the honest fallback.
    expect(reason.ru).toContain('Свежее за 30 дней');
  });

  test('two words neither subscription asked for is a repeat', () => {
    const reason = leadReason(
      base({
        title: 'Продавцы маркетплейсов жалуются на логистику',
        excerpt: 'Логистика и хранение подорожали сильнее самих комиссий, говорят продавцы.',
        siblingTitles: ['Логистика маркетплейсов дорожает второй квартал подряд'],
      })
    );

    expect(reason.ru).toBe('Тема повторилась у нескольких ваших подписок за этот заход.');
  });
});

describe('the rules that did not change', () => {
  test('a workspace that already wrote about this is told so first', () => {
    const reason = leadReason(
      base({ ownPostsText: ['разбирали комиссии маркетплейсов в июле'] })
    );

    expect(reason.ru).toBe('Вы уже писали об этом — здесь повод продолжить или уточнить.');
  });

  test('a feed lead with nothing else to say names its subscription', () => {
    const reason = leadReason(
      base({
        subscriptionDisplayName: 'Хабр',
        subscriptionQuery: undefined,
        freshWithinDays: undefined,
      })
    );

    expect(reason.ru).toBe('Новое из подписки «Хабр» — решать вам, стоит ли ответить.');
  });
});
