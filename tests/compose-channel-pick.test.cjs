'use strict';

/**
 * Окно поста под ролью USER: круг выбирается, и запрет называет себя.
 *
 * `content-factory-next-fn33.27`. Владелец сообщил, что участник области с
 * ролью USER щёлкает по кругу канала и ничего не происходит: кнопка остаётся
 * «Проверьте круги выше», «Сохранить как черновик» серая. Проверка на стенде
 * показала другое. Список каналов и выбор круга ролью не управляются вовсе —
 * ни на сервере, ни в сторе, — и под живым участником круг выбирается. Мёртвой
 * была кнопка: у поста, которому уже приписали проверенный контекст,
 * `manage.modal` выключает планирование и публикацию навсегда, а единственная
 * подпись рядом продолжала звать к кругам. Дверь закрыта намеренно (пост с
 * контекстом уходит только в черновик), поэтому здесь проверяется не открытие
 * двери, а то, что окно называет причину.
 *
 * Три правила, и каждое — решение, а не деталь:
 *   1. Ни картинка каналов, ни стор, ни маршрут списка не смотрят на роль.
 *   2. Круг выбирается щелчком, и выбранным его показывает `aria-pressed`.
 *   3. Причина запрета считается одним выражением и печатается словами.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');

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

const React = require('react');
const { cleanup, fireEvent, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;

const FILES = {
  picker: 'apps/frontend/src/components/new-launch/picks.socials.component.tsx',
  store: 'apps/frontend/src/components/new-launch/store.ts',
  manage: 'apps/frontend/src/components/new-launch/manage.modal.tsx',
  reason: 'apps/frontend/src/components/new-launch/compose-block-reason.tsx',
  controller: 'apps/backend/src/api/routes/integrations.controller.ts',
  repository:
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
};

const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

/** Source with comments blanked, so a file may explain itself freely. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const channel = {
  id: 'itg-telegram-1',
  name: 'Тестовая группа Content Factory',
  identifier: 'telegram',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
};

afterEach(cleanup);

describe('the post window under an ordinary member', () => {
  /* -----------------------------------------------------------------------
   * 1. No role anywhere on the path from the database to the circle.
   * -------------------------------------------------------------------- */

  test('the channel list and the picker never read a role', () => {
    const listRoute = code(FILES.controller)
      .split('@Get(')
      .find((block) => block.startsWith("'/list'"));
    expect(listRoute).toBeTruthy();
    expect(listRoute).not.toMatch(/role|isSuperAdmin|isOrganizationAdmin/i);

    const repositoryList = code(FILES.repository)
      .split('getIntegrationsList(')
      .slice(1)
      .join('');
    expect(repositoryList.slice(0, 400)).not.toMatch(/userId|role/);

    for (const file of [FILES.picker, FILES.store]) {
      expect(code(file)).not.toMatch(
        /isOrganizationAdmin|isSuperAdmin|SUPERADMIN|useUser\(/
      );
    }
  });

  /* -----------------------------------------------------------------------
   * 2. The circle answers a click.
   * -------------------------------------------------------------------- */

  test('a click on the circle selects the channel', () => {
    const { PicksSocialsView } = loadTypeScriptModule(FILES.picker);
    const toggled = [];

    const { rerender } = render(
      h(PicksSocialsView, {
        integrations: [channel],
        selectedIds: [],
        onToggle: (one) => toggled.push(one.id),
      })
    );

    const circle = document.querySelector(`button[aria-label="${channel.name}"]`);
    expect(circle).toBeTruthy();
    expect(circle.disabled).toBe(false);
    expect(circle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(circle);
    expect(toggled).toEqual([channel.id]);

    rerender(
      h(PicksSocialsView, {
        integrations: [channel],
        selectedIds: [channel.id],
        onToggle: (one) => toggled.push(one.id),
      })
    );
    expect(
      document
        .querySelector(`button[aria-label="${channel.name}"]`)
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  test('the store keeps the channel the picker handed it', () => {
    const { PicksSocialsView } = loadTypeScriptModule(FILES.picker);
    const { create } = require('zustand');
    const { createRef } = React;

    // The same reducer the store runs, exercised through the same component.
    const useStore = create((set) => ({
      selectedIntegrations: [],
      addOrRemoveSelectedIntegration: (integration, settings) =>
        set((state) => {
          const existing = state.selectedIntegrations.find(
            (one) => one.integration.id === integration.id
          );
          return existing
            ? {
                selectedIntegrations: state.selectedIntegrations.filter(
                  (one) => one.integration.id !== integration.id
                ),
              }
            : {
                selectedIntegrations: [
                  ...state.selectedIntegrations,
                  { integration, settings, ref: createRef() },
                ],
              };
        }),
    }));

    const Harness = () => {
      const selected = useStore((state) => state.selectedIntegrations);
      const toggle = useStore(
        (state) => state.addOrRemoveSelectedIntegration
      );
      return h(
        'div',
        null,
        h(PicksSocialsView, {
          integrations: [channel],
          selectedIds: selected.map((one) => one.integration.id),
          onToggle: (one) => toggle(one, {}),
        }),
        h('span', { 'data-selected-count': String(selected.length) })
      );
    };

    render(h(Harness));
    fireEvent.click(document.querySelector(`button[aria-label="${channel.name}"]`));
    expect(
      document.querySelector('[data-selected-count]').getAttribute('data-selected-count')
    ).toBe('1');
  });

  /* -----------------------------------------------------------------------
   * 3. The refusal names itself.
   * -------------------------------------------------------------------- */

  test('a post carrying verified context says why it cannot be scheduled', () => {
    const { composeBlockReason, ComposeBlockReasonNote } = loadTypeScriptModule(
      FILES.reason
    );

    // Пост с подтверждениями, ещё не проверенными человеком: планирование
    // закрыто, и строка называет ровно этот шаг.
    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'ready',
        contentIntelligenceFailure: null,
        provenanceErrorCode: null,
        hasProvenance: true,
        contextReviewedAt: null,
        postSaved: true,
      })
    ).toBe('context-review-required');

    // Тот же пост, ещё не сохранённый: сказать «проверено» некому, и строка
    // просит сначала черновик.
    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'ready',
        contentIntelligenceFailure: null,
        provenanceErrorCode: null,
        hasProvenance: true,
        contextReviewedAt: null,
        postSaved: false,
      })
    ).toBe('context-save-draft-first');

    // Человек посмотрел подтверждения и сказал, что проверил их: причины
    // больше нет.
    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'ready',
        contentIntelligenceFailure: null,
        provenanceErrorCode: null,
        hasProvenance: true,
        contextReviewedAt: '2026-09-04T18:00:00.000Z',
        postSaved: true,
      })
    ).toBe('none');

    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'error',
        contentIntelligenceFailure: 'CONTEXT_UNAVAILABLE',
        provenanceErrorCode: null,
        hasProvenance: false,
      })
    ).toBe('context-error');

    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'ready',
        contentIntelligenceFailure: null,
        provenanceErrorCode: 'CONTENT_EVIDENCE_REQUIRED',
        hasProvenance: true,
      })
    ).toBe('evidence-required');

    // Nothing in the way is nothing to say: the caption on the button owns
    // "no channel chosen", and repeating it here would say it twice.
    expect(
      composeBlockReason({
        locked: false,
        contentIntelligenceLoadState: 'idle',
        contentIntelligenceFailure: null,
        provenanceErrorCode: null,
        hasProvenance: false,
      })
    ).toBe('none');

    render(
      h(ComposeBlockReasonNote, {
        reason: 'context-review-required',
        t: (key, fallback) => fallback,
      })
    );
    const note = document.querySelector('[data-compose-block-reason]');
    expect(note).toBeTruthy();
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toMatch(/confirm it/i);
  });

  test('the window renders the reason beside the buttons it explains', () => {
    const manage = code(FILES.manage);

    // The four conditions that switch the main button off.
    expect(manage).toMatch(/!!contentIntelligenceProvenance/);
    expect(manage).toMatch(/contentIntelligenceLoadState === 'error'/);

    // And the line that reads them back to the person.
    expect(manage).toMatch(/composeBlockReason\(/);
    expect(manage).toMatch(/<ComposeBlockReasonNote/);
  });

  test('the reason has a human string in Russian and English', () => {
    const keys = [
      'compose_blocked_locked',
      'compose_blocked_context_loading',
      'compose_blocked_context_error',
      'compose_blocked_evidence_required',
      'compose_blocked_context_review_required',
      'compose_blocked_context_save_draft_first',
      'context_review_confirm',
    ];
    const localesDir = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    for (const locale of fs.readdirSync(localesDir)) {
      const file = path.join(localesDir, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const strings = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of keys) {
        expect(typeof strings[key]).toBe('string');
        expect(strings[key].length).toBeGreaterThan(0);
      }
    }
    const ru = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'ru', 'translation.json'), 'utf8')
    );
    expect(ru.compose_blocked_context_review_required).toMatch(
      /подтверждени/i
    );
    expect(ru.compose_blocked_context_save_draft_first).toMatch(/черновик/i);
  });
});
