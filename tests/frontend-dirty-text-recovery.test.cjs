const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/content',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { renderHook, act, cleanup } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { useAutosave } = loadTypeScriptModule(
  'apps/frontend/src/components/ui/use-autosave.ts'
);
const draft = loadTypeScriptModule(
  'apps/frontend/src/components/ui/recoverable-draft.ts'
);
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
afterAll(() => dom.window.close());
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test.each(['refused', 'rejected', 'interrupted'])(
  'immediate navigation retains %s core text and permits recovery',
  async (kind) => {
    const save =
      kind === 'interrupted'
        ? () => new Promise(() => {})
        : kind === 'rejected'
        ? async () => {
            throw Error('network');
          }
        : async () => false;
    const key = `person:workspace:core:${kind}`;
    const view = renderHook(() => useAutosave(save, { recoveryKey: key }));
    act(() => view.result.current.schedule('last words'));
    view.unmount();
    await act(async () => {});
    expect(draft.readRecoverableDraft(key)).toBe('last words');
    const next = renderHook(() =>
      useAutosave(async () => true, { recoveryKey: key })
    );
    expect(next.result.current.recovered).toBe('last words');
    await act(async () => {
      await next.result.current.saveNow('last words');
    });
    expect(draft.readRecoverableDraft(key)).toBeNull();
  }
);
test('successful unmount flush removes matching recovery without a confirmation', async () => {
  const key = 'person:workspace:core:success';
  const view = renderHook(() =>
    useAutosave(async () => true, { recoveryKey: key })
  );
  act(() => view.result.current.schedule('saved words'));
  view.unmount();
  await act(async () => {});
  expect(draft.readRecoverableDraft(key)).toBeNull();
});
test('older request success cannot erase the latest dirty value', async () => {
  const first = deferred(),
    key = 'person:workspace:core:race';
  const view = renderHook(() =>
    useAutosave(() => first.promise, { recoveryKey: key })
  );
  let running;
  act(() => {
    running = view.result.current.saveNow('first');
  });
  act(() => view.result.current.schedule('second'));
  await act(async () => {
    first.resolve(true);
    await running;
  });
  expect(draft.readRecoverableDraft(key)).toBe('second');
});
const {
  render,
  screen,
  fireEvent,
  waitFor,
} = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
const { CoreTextEdit } = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/pieces/core-edit.tsx',
  {
    '../../layout/user.context': {
      useUser: () => ({ id: 'person', orgId: 'workspace' }),
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, onClick, disabled }) =>
        h('button', { onClick, disabled }, children),
    },
    '@contentfactory/react/form/textarea': {
      Textarea: ({ standalone, layout, ...props }) => h('textarea', props),
    },
    '@contentfactory/react/layout/hint': { Hint: () => null },
  },
  process.env.CF_TEST_BASELINE
);
test.each(['refused', 'rejected', 'interrupted'])(
  'core editor restores %s text after immediate unmount and offers explicit save',
  async (kind) => {
    const save = jest.fn(
      kind === 'interrupted'
        ? () => new Promise(() => {})
        : kind === 'rejected'
        ? async () => {
            throw Error('network');
          }
        : async () => false
    );
    const props = {
      pieceId: `actual-core-${kind}`,
      locale: 'ru',
      text: 'Server core',
      disabled: false,
      editedByYou: false,
      onSave: save,
      children: h('p', null, 'Server core'),
    };
    const first = render(h(CoreTextEdit, props));
    fireEvent.click(screen.getByRole('button', { name: 'Править суть' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Last core words' },
    });
    first.unmount();
    await act(async () => {});
    save.mockImplementation(async () => true);
    render(h(CoreTextEdit, props));
    await waitFor(() =>
      expect(screen.getByRole('textbox').value).toBe('Last core words')
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain(
      'Правка не сохранилась'
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить ещё раз' }))
    );
    expect(save).toHaveBeenCalledTimes(2);
    expect(
      draft.readRecoverableDraft(`person:workspace:core:actual-core-${kind}`)
    ).toBeNull();
  }
);
test('draft scope separates people, workspaces, and pieces', () => {
  draft.retainRecoverableDraft('person:workspace:core:one', 'Private words');
  expect(draft.readRecoverableDraft('other:workspace:core:one')).toBeNull();
  expect(draft.readRecoverableDraft('person:other:core:one')).toBeNull();
  expect(draft.readRecoverableDraft('person:workspace:core:two')).toBeNull();
});


test('quota refusal still recovers through memory when reading session storage works', () => {
  const key = 'quota-fallback';
  const spy = jest.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  draft.retainRecoverableDraft(key, 'Words with denied storage');
  expect(draft.readRecoverableDraft(key)).toBe('Words with denied storage');
  draft.clearRecoverableDraft(key, 'Words with denied storage');
  expect(draft.readRecoverableDraft(key)).toBeNull();
  spy.mockRestore();
});

test('newest memory draft wins over older stored text after quota refusal', () => {
  const key = 'quota-over-existing';
  draft.retainRecoverableDraft(key, 'Older persisted words');
  const spy = jest.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  try {
    draft.retainRecoverableDraft(key, 'Newest dirty words');
    expect(draft.readRecoverableDraft(key)).toBe('Newest dirty words');
    draft.clearRecoverableDraft(key, 'Older persisted words');
    expect(draft.readRecoverableDraft(key)).toBe('Newest dirty words');
    draft.clearRecoverableDraft(key, 'Newest dirty words');
    expect(draft.readRecoverableDraft(key)).toBeNull();
  } finally {
    spy.mockRestore();
  }
});

test('failed storage removal cannot resurrect an acknowledged draft or prevent the next edit', () => {
  const key = 'failed-remove';
  draft.retainRecoverableDraft(key, 'Acknowledged words');
  const spy = jest.spyOn(window.Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage denied'); });
  try {
    draft.clearRecoverableDraft(key, 'Acknowledged words');
    expect(draft.readRecoverableDraft(key)).toBeNull();
    expect(draft.readRecoverableDraft(key)).toBeNull();
    draft.retainRecoverableDraft(key, 'Next dirty words');
    expect(draft.readRecoverableDraft(key)).toBe('Next dirty words');
    draft.clearRecoverableDraft(key, 'Acknowledged words');
    expect(draft.readRecoverableDraft(key)).toBe('Next dirty words');
    draft.clearRecoverableDraft(key, 'Next dirty words');
    expect(draft.readRecoverableDraft(key)).toBeNull();
  } finally {
    spy.mockRestore();
  }
});
