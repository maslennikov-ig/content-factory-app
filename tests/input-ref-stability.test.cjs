/**
 * The shared Input keeps one element attached across re-renders.
 *
 * The ref was written inline, so `form.register()`'s fresh object and a fresh
 * arrow function reached React on every render. React answers a new ref
 * callback by detaching the old one and attaching the new one, so
 * react-hook-form was handed `null` and then the element again on every
 * keystroke — for a field that is re-rendered on each change, that is the
 * registration being torn down and rebuilt continuously
 * (content-factory-next-fn33.10).
 */

const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/form',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, fireEvent, render } = require('@testing-library/react');
const { FormProvider, useForm } = require('react-hook-form');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;

const { Input } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/input.tsx'
);

afterEach(() => cleanup());

describe('the shared Input holds its element across re-renders', () => {
  test('attaches once, is not torn down on every keystroke, and still feeds the form', () => {
    const attachments = [];
    // Stable on purpose: a consumer ref that changes identity every render is
    // a different defect, and it would hide this one.
    const collect = (element) => attachments.push(element);

    let latestValues = null;

    const Harness = () => {
      const methods = useForm({ defaultValues: { note: '' } });
      latestValues = methods.getValues;
      // Re-render on every change, the way a form that shows a live error or
      // a character count does.
      const note = methods.watch('note');

      return h(
        FormProvider,
        methods,
        h(Input, { name: 'note', ref: collect, placeholder: 'Note' }),
        h('span', { 'data-testid': 'echo' }, note)
      );
    };

    const { getByPlaceholderText, getByTestId } = render(h(Harness));
    const field = getByPlaceholderText('Note');

    expect(attachments).toEqual([field]);

    fireEvent.change(field, { target: { value: 'a' } });
    fireEvent.change(field, { target: { value: 'ab' } });
    fireEvent.change(field, { target: { value: 'abc' } });

    // Three keystrokes, three re-renders. The element never left.
    expect(getByTestId('echo').textContent).toBe('abc');
    expect(attachments).toEqual([field]);
    expect(attachments).not.toContain(null);

    // And react-hook-form still has the field it registered.
    expect(latestValues()).toEqual({ note: 'abc' });
  });
});
