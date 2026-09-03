const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const componentPath = 'libraries/react-shared-libraries/src/form/password-input.tsx';

function loadTypeScriptModule(relativePath, stubs = {}) {
  const filename = path.resolve(repositoryRoot, relativePath);
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
  const localRequire = (request) => {
    if (stubs[request]) return stubs[request];
    if (request.startsWith('.')) {
      for (const extension of ['.ts', '.tsx']) {
        const candidate = `${path.resolve(path.dirname(filename), request)}${extension}`;
        if (fs.existsSync(candidate)) {
          return loadTypeScriptModule(path.relative(repositoryRoot, candidate), stubs);
        }
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

const translatedLabelStub = {
  TranslatedLabel: ({ label }) =>
    React.createElement(React.Fragment, null, label),
};

describe('PasswordInput', () => {
  test('wraps the canonical Input and preserves the native password contract', () => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, componentPath),
      'utf8'
    );
    const { PasswordInput } = loadTypeScriptModule(componentPath, {
      '../translation/translated-label': translatedLabelStub,
    });

    const markup = renderToStaticMarkup(
      React.createElement(PasswordInput, {
        standalone: true,
        name: 'password',
        value: 'one-secret',
        onChange: () => {},
        showPasswordLabel: 'Show password',
        hidePasswordLabel: 'Hide password',
      })
    );

    expect(source).toContain("import { Input");
    expect(source).toContain('forwardRef<HTMLInputElement');
    expect(source).toContain('<Input');
    expect(source).toContain('ref={ref}');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('value="one-secret"');
  });

  test('delegates the labelled visibility action and its interaction states to Button', () => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, componentPath),
      'utf8'
    );

    expect(source).toContain("type=\"button\"");
    expect(source).toContain("import { Button } from './button'");
    expect(source).toContain('<Button');
    expect(source).toContain('iconOnly');
    expect(source).toContain('variant="quiet"');
    expect(source).toContain('aria-label={visible ? hidePasswordLabel : showPasswordLabel}');
    expect(source).toContain("visible ? 'text' : 'password'");
    expect(source).toContain('disabled={disabled}');
    expect(source).not.toContain('<button');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  test('owns an explicit transition between masked and visible native types', () => {
    const setVisible = jest.fn();
    const reactStub = {
      ...React,
      useState: () => [false, setVisible],
    };
    const { PasswordInput } = loadTypeScriptModule(componentPath, {
      react: reactStub,
      '../translation/translated-label': translatedLabelStub,
    });
    const masked = PasswordInput.render(
      {
        standalone: true,
        name: 'password',
        value: 'one-secret',
        onChange: () => {},
        showPasswordLabel: 'Show password',
        hidePasswordLabel: 'Hide password',
      },
      null
    );

    expect(masked.props.type).toBe('password');
    expect(masked.props.value).toBe('one-secret');
    expect(masked.props.action.props.type).toBe('button');
    expect(masked.props.action.props['aria-label']).toBe('Show password');
    masked.props.action.props.onClick();
    expect(setVisible).toHaveBeenCalledTimes(1);
    expect(setVisible.mock.calls[0][0](false)).toBe(true);

    const { PasswordInput: VisiblePasswordInput } = loadTypeScriptModule(componentPath, {
      react: { ...React, useState: () => [true, jest.fn()] },
      '../translation/translated-label': translatedLabelStub,
    });
    const visible = VisiblePasswordInput.render(
      {
        standalone: true,
        name: 'password',
        value: 'one-secret',
        onChange: () => {},
        showPasswordLabel: 'Show password',
        hidePasswordLabel: 'Hide password',
      },
      null
    );

    expect(visible.props.type).toBe('text');
    expect(visible.props.value).toBe('one-secret');
    expect(visible.props.action.props['aria-label']).toBe('Hide password');
  });
});
