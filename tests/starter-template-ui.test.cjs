const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const componentFile = path.resolve(
  __dirname,
  '../apps/frontend/src/components/public-saas/starter-template-chooser.tsx'
);
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, screen } = require('@testing-library/react');

function loadChooser() {
  const choiceModule = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/choice/radio.group.tsx'
  );
  const compiled = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
    fileName: componentFile,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (request) =>
      request ===
      '@contentfactory/nestjs-libraries/dtos/auth/starter-template'
        ? {}
        : request === '@contentfactory/react/choice/radio.group'
        ? choiceModule
        : require(request),
    loaded,
    loaded.exports
  );
  return loaded.exports.StarterTemplateChooser;
}

afterEach(cleanup);

test('starter-template chooser exposes a labelled radio group and keyboard-native choices', () => {
  const StarterTemplateChooser = loadChooser();
  const onChange = jest.fn();
  render(
    React.createElement(StarterTemplateChooser, {
      value: 'blank',
      onChange,
      copy: {
        legend: 'Choose a starting point',
        blank: 'Blank workspace',
        blankDescription: 'Start without preset labels.',
        workflow: 'Content workflow',
        workflowDescription: 'Add Plan, Draft, Review, and Schedule labels.',
      },
    })
  );

  expect(
    screen.getByRole('radiogroup', { name: 'Choose a starting point' })
  ).toBeTruthy();
  const blank = screen.getByRole('radio', { name: /Blank workspace/ });
  const workflow = screen.getByRole('radio', { name: /Content workflow/ });
  expect(blank.getAttribute('aria-checked')).toBe('true');
  expect(workflow.getAttribute('data-cf-choice-value')).toBe(
    'content-workflow'
  );
  fireEvent.click(workflow);
  expect(onChange).toHaveBeenCalledWith('content-workflow');
});
