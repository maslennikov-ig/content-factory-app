'use strict';

const { factRows, INJECTED } = require('./fact-rows.cjs');

/** 31.12.2099 23:59:59.999 in the person's zone (the saved offset, UTC+3). */
const FRESH_UNTIL = '2099-12-31T20:59:59.999Z';

/**
 * Facts from the chat (kcxz.24): the facts in work of this workspace only,
 * read as data (a statement that gives orders is quoted, never obeyed); a fact
 * added in the person's words is filed as the fact form files it and is in
 * work at once, until the end of the named day in the person's time zone; the
 * same statement again is the same fact — the answer says it existed and
 * gives its stored last day, not the one asked (review W4-24 F2), and a
 * search finds the new one right away. «Откуда факты» opens beside the chat.
 */
module.exports = {
  id: 'fact-list-add',
  title: 'Факты — список своей области, добавить факт, тот же факт второй раз не заводится',
  covers: ['facts.list', 'facts.add'],
  world: factRows(),
  turns: [
    {
      say: 'Какие у нас факты?',
      model: [[['tool', 'facts_list', {}]], [['text', 'Два факта в работе.']]],
    },
    {
      say: 'Запомни: скидка для школ — 20%, по 31 декабря 2099-го',
      model: [
        [['tool', 'facts_add', { statement: 'Скидка для школ — 20%.', validUntil: '2099-12-31' }]],
        [['text', 'Запомнил.']],
      ],
    },
    {
      say: 'Ещё раз: скидка для школ — 20%. И найди факты про скидку',
      model: [
        [['tool', 'facts_add', { statement: 'Скидка для школ — 20%.' }]],
        [['tool', 'facts_list', { q: 'скидка' }]],
        [['text', 'Такой факт уже есть.']],
      ],
    },
  ],
  check: (run) => {
    const [read, add, again] = run.turns;
    const list = read.outputs[0].output;
    expect(list.ok).toBe(true);
    // Statements are people's and sources' words: the model reads them as data.
    expect(list.summary.untrustedData.sources).toEqual(['workspace-text', 'search-result']);
    const shown = list.summary.untrustedData.value;
    expect(shown.facts.map((one) => one.id)).toEqual(['f1', 'f2']);
    expect(shown.facts[0]).toMatchObject({
      statement: 'Пробный период — 14 дней.',
      status: 'verified',
      inWork: true,
      grounded: 'own-word',
      validUntil: null,
    });
    expect(shown.facts[1].statement).toContain(INJECTED);
    // Not the retracted one unasked, never another workspace's.
    expect(JSON.stringify(list)).not.toContain('Офис на Тверской');
    expect(JSON.stringify(list)).not.toContain('Чужой факт');
    expect(read.data.filter((part) => part.type === 'data-facts').map((part) => part.data)).toEqual([
      { kind: 'facts', id: 'facts' },
    ]);

    // Added as the fact form files it: the same claim key, the whole claim
    // as the value, the person's own word — in work at once.
    const added = add.outputs[0].output;
    expect(added).toMatchObject({
      ok: true,
      summary: {
        statement: 'Скидка для школ — 20%.',
        existed: false,
        validUntil: '2099-12-31',
        inWork: true,
        retracted: false,
      },
    });
    const screen = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/content-facts.adapter.ts'
    );
    const form = screen.buildFactCreatePayload({
      ...screen.emptyFactDraft('ru'),
      statement: 'Скидка для школ — 20%.',
      temporalKind: 'CURRENT',
      freshUntil: '2099-12-31',
    });
    const row = run.world.facts.find((one) => one.id === added.summary.factId);
    expect(row).toMatchObject({
      organizationId: 'org-1',
      claimKey: form.claimKey,
      statement: form.statement,
      valueText: form.valueText,
      language: 'ru',
      temporalKind: 'CURRENT',
      // The named day is whole: its last moment in the person's zone.
      freshUntil: FRESH_UNTIL,
      status: 'VERIFIED',
      createdByUserId: 'user-1',
    });
    expect(add.data.map((part) => part.type)).toContain('data-facts');

    // The same statement is the same fact: nothing new was written.
    const [sameAgain, found] = again.outputs.map((one) => one.output);
    expect(sameAgain.summary).toMatchObject({
      factId: added.summary.factId,
      existed: true,
      validUntil: '2099-12-31',
      validUntilAsked: null,
      inWork: true,
    });
    expect(sameAgain.summary.note).toContain('keeps its own last day (2099-12-31)');
    expect(run.writes).toEqual([['fact.added', added.summary.factId]]);
    // The index forgot the workspace on the write: the new fact is found.
    expect(found.summary.untrustedData.value.facts.map((one) => one.id)).toEqual([added.summary.factId]);
  },
};
