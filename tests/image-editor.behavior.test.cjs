'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
  url: 'http://localhost/library',
  pretendToBeVisual: true,
});
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
]) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.createImageBitmap = async () => ({
  width: 320,
  height: 240,
  close: () => {},
});

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');

const primitiveStubs = {
  '../../../../../../libraries/react-shared-libraries/src/form/button': {
    Button: ({ children, loading: _loading, variant: _variant, ...props }) =>
      React.createElement('button', props, children),
  },
  '../../../../../../libraries/react-shared-libraries/src/form/input': {
    Input: ({
      label,
      standalone: _standalone,
      density: _density,
      fieldClassName: _field,
      inputClassName: _input,
      ...props
    }) => {
      const input = React.createElement('input', {
        ...(label ? { 'aria-label': label } : {}),
        ...props,
      });
      return label ? React.createElement('label', {}, label, input) : input;
    },
  },
  '../../../../../../libraries/react-shared-libraries/src/form/select': {
    Select: ({
      children,
      standalone: _standalone,
      density: _density,
      ...props
    }) => React.createElement('select', props, children),
  },
  '../../../../../../libraries/react-shared-libraries/src/form/checkbox.field':
    {
      CheckboxField: ({ label, ...props }) =>
        React.createElement(
          'label',
          {},
          React.createElement('input', { type: 'checkbox', ...props }),
          label
        ),
    },
};

function loadModule(relativePath, stubs = primitiveStubs, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const localRequire = (request) => {
    if (stubs[request]) return stubs[request];
    if (request.startsWith('.')) {
      for (const suffix of ['', '.ts', '.tsx']) {
        const candidate = path.resolve(
          path.dirname(filename),
          request + suffix
        );
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
          return loadModule(path.relative(root, candidate), stubs, cache);
      }
    }
    return require(request);
  };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const { ImageEditorModal } = loadModule(
  'apps/frontend/src/components/media/image-editor/image-editor-modal.tsx'
);
const source = {
  id: 'source',
  name: 'source.png',
  originalName: 'source.png',
  path: '/media/source.png',
  thumbnail: null,
  alt: null,
};
const uploaded = {
  id: 'edited',
  name: 'edited.png',
  originalName: 'edited.png',
  path: '/media/edited.png',
  thumbnail: null,
  alt: null,
};
const loadedSource = (type = 'image/png') => ({
  image: document.createElement('img'),
  width: 320,
  height: 240,
  type,
  dispose: jest.fn(),
});

function fakeEngine() {
  let revision = 0;
  let listeners = [];
  let layers = [
    { id: 'source-image', name: 'Source image', type: 'image', selected: true },
  ];
  const commands = [];
  const snapshot = () => ({
    revision,
    width: 320,
    height: 240,
    layers,
    canUndo: revision > 0,
    canRedo: false,
    selectedLayerId: layers.at(-1)?.id || null,
  });
  const api = {
    commands,
    mount: jest.fn(async () => {}),
    command: jest.fn(async (name, payload) => {
      commands.push([name, payload]);
      if (
        [
          'add-rectangle',
          'crop',
          'flip-horizontal',
          'resize',
          'delete-layer',
          'raise-layer',
        ].includes(name)
      ) {
        revision += 1;
        if (name === 'add-rectangle')
          layers = [
            ...layers,
            {
              id: `rect-${revision}`,
              name: 'Rectangle',
              type: 'rect',
              selected: true,
            },
          ];
        listeners.forEach((listener) => listener(snapshot()));
      }
    }),
    getSnapshot: snapshot,
    subscribe: (listener) => {
      listeners.push(listener);
      listener(snapshot());
      return () => {
        listeners = listeners.filter((item) => item !== listener);
      };
    },
    exportRaster: jest.fn(async () => new Blob(['png'], { type: 'image/png' })),
    dispose: jest.fn(),
  };
  return api;
}

function renderEditor(overrides = {}) {
  const engine = overrides.engine || fakeEngine();
  const props = {
    source,
    createEngine: () => engine,
    sourceLoader: async () => loadedSource(),
    upload: async () => uploaded,
    onSaved: async () => {},
    onClose: jest.fn(),
    ...overrides,
    engine: undefined,
  };
  return {
    engine,
    props,
    view: render(React.createElement(ImageEditorModal, props)),
  };
}

afterEach(() => cleanup());

test('a rejected source keeps every edit and save command disabled and preserves the source error', async () => {
  renderEditor({
    sourceLoader: async () => {
      throw new Error('decode failed');
    },
  });
  expect((await screen.findByRole('alert')).textContent).toContain(
    'decode failed'
  );
  expect(screen.getByRole('button', { name: 'Save a copy' }).disabled).toBe(
    true
  );
  expect(
    screen.getByRole('button', { name: 'Rectangle' }).matches(':disabled')
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
  expect(screen.getByRole('alert').textContent).toContain('decode failed');
  expect(screen.queryByText('Change applied')).toBeNull();
});

test('crop exposes adjustable bounds, applies exact asymmetric values, and cancel does not command the engine', async () => {
  const { engine } = renderEditor();
  await screen.findByText('Image ready');
  fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
  fireEvent.change(screen.getByLabelText('Crop X'), {
    target: { value: '17' },
  });
  fireEvent.change(screen.getByLabelText('Crop Y'), {
    target: { value: '29' },
  });
  fireEvent.change(screen.getByLabelText('Crop width'), {
    target: { value: '201' },
  });
  fireEvent.change(screen.getByLabelText('Crop height'), {
    target: { value: '173' },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }))
  );
  await waitFor(() =>
    expect(engine.command).toHaveBeenCalledWith('crop', {
      x: 17,
      y: 29,
      width: 201,
      height: 173,
    })
  );
  const count = engine.command.mock.calls.filter(
    ([name]) => name === 'crop'
  ).length;
  fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel crop' }));
  expect(
    engine.command.mock.calls.filter(([name]) => name === 'crop')
  ).toHaveLength(count);
});

test('dirty Escape is contained from the media modal and a second Escape keeps the editor', async () => {
  const onClose = jest.fn();
  let outerEscape = 0;
  const outer = (event) => {
    if (event.key === 'Escape') outerEscape += 1;
  };
  document.addEventListener('keydown', outer);
  renderEditor({ onClose });
  await screen.findByText('Image ready');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false)
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).not.toBeNull();
  const keep = screen.getByRole('button', { name: 'Keep editing' });
  const discard = screen.getByRole('button', { name: 'Discard changes' });
  expect(document.activeElement).toBe(keep);
  expect(
    screen.getByText('Add text').closest('button').closest('[inert]')
  ).not.toBeNull();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(discard);
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(keep);
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(discard);
  fireEvent.click(keep);
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Close editor' })
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).not.toBeNull();
  expect(outerEscape).toBe(0);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('dialog')).not.toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  expect(outerEscape).toBe(0);
  document.removeEventListener('keydown', outer);
});

test('entering and cancelling crop does not make the scene dirty', async () => {
  const onClose = jest.fn();
  renderEditor({ onClose });
  await screen.findByText('Image ready');
  fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel crop' }));
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('an uploaded copy becomes terminal even when completion rejects and cannot upload twice', async () => {
  let rejectCompletion;
  const completion = new Promise((_, reject) => {
    rejectCompletion = reject;
  });
  const onSaved = jest.fn(() => completion);
  const onClose = jest.fn();
  const upload = jest.fn(async () => uploaded);
  renderEditor({ onSaved, onClose, upload });
  await screen.findByText('Image ready');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Close editor' }).disabled).toBe(
    true
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await act(async () => rejectCompletion(new Error('completion failed')));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'completion failed'
  );
  expect(screen.getByRole('dialog')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Close editor' }).disabled).toBe(
    false
  );
  expect(screen.getByRole('button', { name: 'Save a copy' }).disabled).toBe(
    true
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  expect(upload).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

// JPEG has no alpha channel, so saving a transparent source as JPEG turns every
// transparent pixel black. Nothing in the export path can recover that, and the
// original is untouched, so the only useful moment to say so is before the save.
test('warns before a JPEG save can flatten transparency, and only when it can', async () => {
  const warning =
    'JPEG cannot store transparency. Anywhere the source or a layer is transparent will come out black — save as PNG instead.';
  const { unmount } = renderEditor({
    sourceLoader: async () => loadedSource('image/png'),
  }).view;
  await screen.findByRole('button', { name: 'Save a copy' });
  expect(screen.queryByText(warning)).toBeNull();

  await act(async () => {
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'image/jpeg' },
    });
  });
  expect(screen.getByText(warning)).not.toBeNull();
  unmount();

  // A JPEG source has no transparency to lose. Warning there would train people
  // to dismiss the one case that matters.
  renderEditor({ sourceLoader: async () => loadedSource('image/jpeg') });
  await screen.findByRole('button', { name: 'Save a copy' });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'image/jpeg' },
    });
  });
  expect(screen.queryByText(warning)).toBeNull();
});
