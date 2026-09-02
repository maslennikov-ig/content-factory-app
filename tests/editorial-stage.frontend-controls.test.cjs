'use strict';

/**
 * The editorial stage's own frontend controls — `content-factory-next-pdbe`,
 * points 1 and 2. `editorial-stage.tag-migration.test.cjs` and
 * `editorial-stage.filter.test.cjs` cover the server half already; this one
 * covers the three small components that give the field a face: the editor's
 * picker (a stage plus a real "unset" choice), the badge that puts it on a
 * card without opening the post, and the calendar filter.
 *
 * The stage `DRAFT` was first called «Черновик»/"Draft" — the same word the
 * post's delivery `state: DRAFT` already prints on the same card
 * (`t('draft', 'Draft')` in `calendar.tsx`). On screen that produced
 * "Stage: Draft" sitting one line above "Draft:", which reads as a stutter;
 * the prefix was doing its job and the repetition still landed. The stage is
 * now «Пишется»/"Writing", so the words no longer collide at all, and the
 * prefix stays to keep a pill like "Scheduled" from being read as delivery.
 * `editorial-stage.frontend-copy-parity.test.cjs` fails if any stage label
 * ever equals the delivery word again.
 */

const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/launches';
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const badgeModule = loadTypeScriptModule(`${base}/editorial-stage.badge.tsx`);
const selectModule = loadTypeScriptModule(`${base}/editorial-stage.select.tsx`);
const filterModule = loadTypeScriptModule(`${base}/editorial-stage.filter.tsx`);

const renderIn = async (locale, element) => {
  await act(async () => {
    render(
      React.createElement(
        variables.VariableContextComponent,
        { language: locale },
        element
      )
    );
  });
};

afterEach(() => {
  cleanup();
});

describe('EditorialStageBadge', () => {
  test('renders nothing for a post with no recorded stage — the normal case, not an error', async () => {
    await renderIn(
      'en',
      React.createElement(badgeModule.EditorialStageBadge, { stage: null })
    );
    expect(document.body.textContent.trim()).toBe('');
  });

  test('the stage carries an explicit prefix so a pill is never read as delivery state', async () => {
    await renderIn(
      'en',
      React.createElement(badgeModule.EditorialStageBadge, { stage: 'DRAFT' })
    );
    expect(screen.getByText('Stage: Writing')).toBeTruthy();
  });

  test('same prefix in Russian', async () => {
    await renderIn(
      'ru',
      React.createElement(badgeModule.EditorialStageBadge, { stage: 'DRAFT' })
    );
    expect(screen.getByText('Этап: Пишется')).toBeTruthy();
  });

  test('renders the product-required Russian label for every stage', async () => {
    const expected = {
      PLAN: 'Этап: План',
      DRAFT: 'Этап: Пишется',
      REVIEW: 'Этап: Проверка',
      SCHEDULED: 'Этап: Расписание',
    };
    for (const [stage, label] of Object.entries(expected)) {
      cleanup();
      await renderIn(
        'ru',
        React.createElement(badgeModule.EditorialStageBadge, { stage })
      );
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('EditorialStageSelect (the editor\'s picker)', () => {
  test('offers a real, selectable "unset" option alongside the four stages', async () => {
    await renderIn(
      'en',
      React.createElement(selectModule.EditorialStageSelect, {
        value: 'REVIEW',
        onChange: () => {},
      })
    );
    const select = document.querySelector('select[name="editorialStage"]');
    const options = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['', 'PLAN', 'DRAFT', 'REVIEW', 'SCHEDULED']);
    expect(select.value).toBe('REVIEW');
  });

  test('choosing the blank option reports null, not the empty string', async () => {
    let reported = 'unset-never-called';
    await renderIn(
      'en',
      React.createElement(selectModule.EditorialStageSelect, {
        value: 'PLAN',
        onChange: (value) => {
          reported = value;
        },
      })
    );
    const select = document.querySelector('select[name="editorialStage"]');
    await act(async () => {
      fireEvent.change(select, { target: { value: '' } });
    });
    expect(reported).toBeNull();
  });

  test('choosing a stage reports the stage value', async () => {
    let reported = null;
    await renderIn(
      'en',
      React.createElement(selectModule.EditorialStageSelect, {
        value: null,
        onChange: (value) => {
          reported = value;
        },
      })
    );
    const select = document.querySelector('select[name="editorialStage"]');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'SCHEDULED' } });
    });
    expect(reported).toBe('SCHEDULED');
  });
});

describe('EditorialStageFilter (the calendar/list filter)', () => {
  test('offers "all stages" plus the four values', async () => {
    await renderIn(
      'ru',
      React.createElement(filterModule.EditorialStageFilter, {
        value: null,
        onChange: () => {},
      })
    );
    const select = document.querySelector('select[name="editorialStageFilter"]');
    const options = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['', 'PLAN', 'DRAFT', 'REVIEW', 'SCHEDULED']);
    expect(screen.getByText('Все этапы')).toBeTruthy();
  });
});
