'use strict';

/**
 * The legacy `openModal` shell, stacked and untitled (fourteenth walk review,
 * `evidence/walk-2026-09-24-fourteenth/review-ui-i18n.md`, P3-2 and P3-3).
 *
 * P3-3: a window that opens a confirmation over itself — every
 * `useDecisionModal` does — used to run its close path when it stopped being
 * the top layer. Focus jumped to the page under both windows, and the
 * confirmation then saved that page element as its own way back. Pausing is
 * not closing now: the lower window moves nothing, focus comes back to the
 * control that opened the confirmation, and only closing the lower window
 * hands focus to the page.
 *
 * P3-2: an untitled window rendered an empty `h2` and no accessible name, and
 * its content rose under the close button.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, fireEvent } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;

const modalModule = loadWithMocks(
  'apps/frontend/src/components/layout/new-modal.tsx',
  {
    react: React,
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
  }
);

afterEach(cleanup);

const dialogs = () => Array.from(document.querySelectorAll('[role="dialog"]'));

describe('stacked openModal windows hand focus back one layer at a time', () => {
  test('a confirmation over a window returns focus to its opener, then the window to the page', async () => {
    let answered;
    let api;
    const Harness = () => {
      const modals = modalModule.useModals();
      const decision = modalModule.useDecisionModal();
      api = modals;
      return h(
        'button',
        {
          id: 'page-opener',
          onClick: () =>
            modals.openModal({
              title: 'Слоты публикации',
              children: h(
                'button',
                {
                  id: 'delete-slot',
                  onClick: () =>
                    decision
                      .open({ title: 'Удалить слот?', cancelLabel: 'Нет' })
                      .then((value) => {
                        answered = value;
                      }),
                },
                'Удалить'
              ),
            }),
        },
        'Слоты'
      );
    };

    await act(async () => {
      render(h('div', null, h(Harness), h(modalModule.ModalManagerInner)));
    });

    const pageOpener = document.getElementById('page-opener');
    let pageFocused = 0;
    pageOpener.addEventListener('focus', () => {
      pageFocused += 1;
    });

    pageOpener.focus();
    pageFocused = 0;
    await act(async () => {
      fireEvent.click(pageOpener);
    });
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].contains(document.activeElement)).toBe(true);

    const deleteSlot = document.getElementById('delete-slot');
    deleteSlot.focus();
    await act(async () => {
      fireEvent.click(deleteSlot);
    });
    expect(dialogs()).toHaveLength(2);
    const [lower, upper] = dialogs();
    expect(upper.contains(document.activeElement)).toBe(true);
    // The lower window paused; it did not send focus to the page.
    expect(pageFocused).toBe(0);

    // Tab stays in the confirmation now that it is the top layer.
    const upperFocusable = upper.querySelectorAll('button');
    upperFocusable[upperFocusable.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(upper.contains(document.activeElement)).toBe(true);

    const no = Array.from(upper.querySelectorAll('button')).find(
      (button) => button.textContent === 'Нет'
    );
    await act(async () => {
      fireEvent.click(no);
    });
    expect(answered).toBe(false);
    expect(dialogs()).toHaveLength(1);
    expect(document.activeElement).toBe(deleteSlot);
    expect(pageFocused).toBe(0);

    // The lower window traps again: Tab from its last control wraps inside.
    const lowerFocusable = lower.querySelectorAll('button');
    lowerFocusable[lowerFocusable.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(lower.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.click(lower.querySelector('button[aria-label="Close"]'));
    });
    expect(dialogs()).toHaveLength(0);
    expect(document.activeElement).toBe(pageOpener);
    expect(pageFocused).toBe(1);
    await act(async () => api.closeAll());
  });
});

describe('an untitled openModal window', () => {
  const mount = async (modal) => {
    await act(async () => {
      render(
        h(modalModule.Component, {
          isLast: true,
          zIndex: 100,
          closeModal: () => {},
          modal: { id: 'untitled', children: h('p', null, 'Тело'), ...modal },
        })
      );
    });
    return document.querySelector('[role="dialog"]');
  };

  test('has no empty heading and still has a name', async () => {
    const dialog = await mount({});
    expect(dialog.querySelector('h2')).toBeNull();
    expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
    expect(dialog.getAttribute('aria-label')).toBe('Dialog');
  });

  test('takes the name the caller gives', async () => {
    const dialog = await mount({ ariaLabel: 'Выбор медиа' });
    expect(dialog.getAttribute('aria-label')).toBe('Выбор медиа');
  });

  test('keeps a header row under the close button, so content starts below it', async () => {
    const dialog = await mount({});
    const header = dialog.querySelector('[data-modal-header]');
    expect(header.getAttribute('data-modal-header')).toBe('spacer');
    expect(header.className).toContain('min-h-[32px]');
    expect(header.querySelector('button[aria-label="Close"]')).not.toBeNull();
    // The content follows the header row, not the panel's top edge.
    expect(header.nextElementSibling.textContent).toBe('Тело');
  });

  test('a titled window keeps its heading as the name', async () => {
    const dialog = await mount({ title: 'Настройки' });
    const heading = dialog.querySelector('h2');
    expect(heading.textContent).toBe('Настройки');
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(dialog.hasAttribute('aria-label')).toBe(false);
  });
});
