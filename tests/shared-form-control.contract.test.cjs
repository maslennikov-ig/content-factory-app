const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const parser = require('@typescript-eslint/parser');

const repositoryRoot = path.resolve(__dirname, '..');

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
const { Button, navigationRowVariant } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/button.tsx'
);
const { Select } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/select.tsx',
  { '../translation/translated-label': translatedLabelStub }
);
const { Textarea } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/textarea.tsx',
  { '../translation/translated-label': translatedLabelStub }
);
const { Input } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/input.tsx',
  { '../translation/translated-label': translatedLabelStub }
);
const { ControlButton } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/choice/control.button.tsx'
);
const { RadioGroup, RadioOption } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/choice/radio.group.tsx'
);
const { MenuOption } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/choice/choice.menu.tsx'
);

const render = (Component, props, children) =>
  renderToStaticMarkup(React.createElement(Component, props, children));

const migratedFiles = [
  'apps/frontend/src/app/(app)/oauth/authorize/page.tsx',
  'apps/frontend/src/components/admin/admin-errors.component.tsx',
  'apps/frontend/src/components/admin/admin-users.component.tsx',
  'apps/frontend/src/components/billing/embedded.billing.tsx',
  'apps/frontend/src/components/billing/faq.component.tsx',
  'apps/frontend/src/components/billing/finish.trial.tsx',
  'apps/frontend/src/components/developer/developer.component.tsx',
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  'apps/frontend/src/components/launches/bot.picture.tsx',
  'apps/frontend/src/components/launches/calendar.tsx',
  'apps/frontend/src/components/launches/comments/comment.component.tsx',
  'apps/frontend/src/components/launches/helpers/linkedin.component.tsx',
  'apps/frontend/src/components/launches/helpers/media.settings.component.tsx',
  'apps/frontend/src/components/launches/launches.component.tsx',
  'apps/frontend/src/components/launches/new.post.tsx',
  'apps/frontend/src/components/launches/time.table.tsx',
  'apps/frontend/src/components/launches/up.down.arrow.tsx',
  'apps/frontend/src/components/layout/logout.component.tsx',
  'apps/frontend/src/components/layout/settings.component.tsx',
  'apps/frontend/src/components/layout/mode.component.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
  'apps/frontend/src/components/new-launch/delay.component.tsx',
  'apps/frontend/src/components/new-launch/providers/instagram/instagram.audio.tsx',
  'apps/frontend/src/components/new-launch/dummy.code.component.tsx',
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  'apps/frontend/src/components/new-layout/layout.component.tsx',
  'apps/frontend/src/components/new-layout/menu-item.tsx',
  'apps/frontend/src/components/new-layout/sidebar.tsx',
  'apps/frontend/src/components/onboarding/onboarding.modal.tsx',
  'apps/frontend/src/components/platform-analytics/render.analytics.tsx',
  'apps/frontend/src/components/post-url-selector/post.url.selector.tsx',
  'apps/frontend/src/components/public-api/public.component.tsx',
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
  'apps/frontend/src/components/settings/signatures.component.tsx',
];

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
};

const NO_BINDINGS = new Map();

/**
 * Every class-list fragment a `className` attribute can be read to contain.
 *
 * `bindings` carries the module's own `const NAME = '…'` class lists, so a
 * value assembled a few lines above the call site is still a value the audit
 * can see. Without it a rail could hand navigation paint to a variant that owns
 * its own colour simply by naming it first.
 */
const literalFragments = (node, bindings = NO_BINDINGS) => {
  const fragments = [];
  const collect = (value) => {
    if (!value) return;
    if (value.type === 'Literal' && typeof value.value === 'string') {
      fragments.push(value.value);
      return;
    }
    if (value.type === 'Identifier') {
      const resolved = bindings.get(value.name);
      if (resolved) fragments.push(...resolved);
      return;
    }
    if (value.type === 'JSXExpressionContainer') {
      collect(value.expression);
      return;
    }
    if (value.type === 'TemplateLiteral') {
      value.quasis.forEach((quasi) => fragments.push(quasi.value.cooked || ''));
      value.expressions.forEach(collect);
      return;
    }
    if (value.type === 'CallExpression' || value.type === 'ArrayExpression') {
      value.arguments?.forEach(collect);
      value.elements?.forEach(collect);
      return;
    }
    if (
      value.type === 'LogicalExpression' ||
      value.type === 'BinaryExpression'
    ) {
      collect(value.left);
      collect(value.right);
      return;
    }
    if (value.type === 'ConditionalExpression') {
      collect(value.consequent);
      collect(value.alternate);
    }
  };
  collect(node?.value);
  return fragments;
};

const booleanBranches = (attribute) => {
  if (!attribute) return [false];
  if (!attribute.value) return [true];
  const value =
    attribute.value.type === 'JSXExpressionContainer'
      ? attribute.value.expression
      : attribute.value;
  if (value.type === 'Literal' && typeof value.value === 'boolean') {
    return [value.value];
  }
  return [true, false];
};

const ALL_VARIANTS = [
  'primary',
  'secondary',
  'quiet',
  'destructive',
  'navigation',
  'navigation-current',
];

const buttonVariants = (attributes) => {
  const variantAttribute = attributes.get('variant');
  const explicit = literalFragments(variantAttribute).filter((variant) =>
    ALL_VARIANTS.includes(variant)
  );
  if (explicit.length) return explicit;
  if (variantAttribute) return ALL_VARIANTS;

  const branches = new Set(
    booleanBranches(attributes.get('secondary')).map((secondary) =>
      secondary ? 'secondary' : 'primary'
    )
  );
  return ['primary', 'secondary'].filter((variant) => branches.has(variant));
};

const normalizedRoleToken = (token) =>
  token.replace(/^!/, '').split(':').at(-1).replace(/^!+/, '');

const colorRole = (token) => {
  if (/^bg-/.test(token))
    return token === 'bg-transparent' ? 'transparent-bg' : 'bg';
  if (/^border(?:-|$)/.test(token)) return 'border';
  if (
    /^text-(?:xs|sm|base|lg|xl|[2-9]xl|start|end|center|left|right|justify|wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(
      token
    )
  ) {
    return null;
  }
  if (
    /^text-(?!\[)/.test(token)
  ) {
    return 'text';
  }
  return null;
};

const conflictingRoles = (variant, classNames) =>
  classNames
    .flatMap((className) => className.split(/\s+/))
    .map(normalizedRoleToken)
    .filter((token) => {
      const role = colorRole(token);
      if (!role) return false;
      if (variant === 'quiet') return role !== 'transparent-bg';
      if (variant === 'destructive')
        return /^(bg-red|text-white|border-red)/.test(token);
      return true;
    });

const parse = (source) =>
  parser.parse(source, {
    ecmaFeatures: { jsx: true },
    loc: true,
    range: true,
    sourceType: 'module',
  });

const SHARED_BUTTON_MODULE = '@contentfactory/react/form/button';

const ALIAS_ROOTS = {
  '@contentfactory/frontend/': 'apps/frontend/src/',
  '@contentfactory/react/': 'libraries/react-shared-libraries/src/',
};

const resolveModule = (request) => {
  for (const [alias, root] of Object.entries(ALIAS_ROOTS)) {
    if (typeof request !== 'string' || !request.startsWith(alias)) continue;
    const base = path.join(repositoryRoot, root, request.slice(alias.length));
    for (const candidate of [`${base}.tsx`, `${base}.ts`]) {
      if (fs.existsSync(candidate))
        return path.relative(repositoryRoot, candidate);
    }
  }
  return null;
};

/**
 * The module's `const NAME = <class list>` declarations, in source order.
 *
 * Declarations inside a component body count too: a rail row assembles its
 * classes a few lines above the call, and a resolver that only reads the top
 * level would call that unreadable. Names are not scoped — two constants with
 * one name resolve to the later one — which can only make the audit read more
 * than a call site actually gets, never less.
 */
const classListBindings = (ast) => {
  const bindings = new Map();
  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    if (node.id.type !== 'Identifier' || !node.init) return;
    const fragments = literalFragments({ value: node.init }, bindings);
    if (fragments.length) bindings.set(node.id.name, fragments);
  });
  return bindings;
};

/** Identifiers a subtree reads that the module does not define as a class list. */
const freeIdentifiers = (node, bindings) => {
  const names = new Set();
  walk(node, (child) => {
    if (child.type === 'Identifier' && !bindings.has(child.name))
      names.add(child.name);
  });
  return names;
};

const sharedButtonLocalNames = (ast) => {
  const names = new Set();
  walk(ast, (node) => {
    if (
      node.type === 'ImportDeclaration' &&
      node.source.value === SHARED_BUTTON_MODULE
    ) {
      for (const specifier of node.specifiers) {
        if (specifier.imported?.name === 'Button')
          names.add(specifier.local.name);
      }
    }
  });
  return names;
};

const jsxAttributes = (node) =>
  new Map(
    node.attributes
      .filter((attribute) => attribute.type === 'JSXAttribute')
      .map((attribute) => [attribute.name.name, attribute])
  );

/**
 * Does this module hand its own `className` prop straight to a shared Button?
 *
 * That is the shape the audit used to be blind to. `LogoutComponent` renders a
 * shared Button and passes `clsx(<its own classes>, className)`; the caller's
 * half of that class list never appears as a literal at the Button, so a rail
 * colour could reach a variant that owns its colour without the audit ever
 * seeing a string. Recording the wrapper lets the audit read the caller's
 * `className` instead, at the call site where it *is* a literal.
 */
const forwardingWrapperCache = new Map();

const classNameForwardingWrapper = (file) => {
  if (forwardingWrapperCache.has(file)) return forwardingWrapperCache.get(file);
  let wrapper = null;
  try {
    const ast = parse(fs.readFileSync(path.join(repositoryRoot, file), 'utf8'));
    const bindings = classListBindings(ast);
    const buttonNames = sharedButtonLocalNames(ast);
    if (buttonNames.size) {
      walk(ast, (node) => {
        if (
          wrapper ||
          node.type !== 'JSXOpeningElement' ||
          !buttonNames.has(node.name?.name)
        )
          return;
        const attributes = jsxAttributes(node);
        const className = attributes.get('className');
        if (!className) return;
        if (!freeIdentifiers(className, bindings).has('className')) return;
        const variant = attributes.get('variant');
        wrapper = {
          file,
          // A wrapper that also forwards `variant` lets the call site pick the
          // role, so the audit has to read the role at the call site too.
          forwardsVariant: Boolean(
            variant && freeIdentifiers(variant, bindings).has('variant')
          ),
          variants: buttonVariants(attributes),
        };
      });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  forwardingWrapperCache.set(file, wrapper);
  return wrapper;
};

/** Local JSX names in this module that resolve to a className-forwarding wrapper. */
const importedForwardingWrappers = (ast) => {
  const wrappers = new Map();
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration') return;
    const file = resolveModule(node.source.value);
    if (!file) return;
    const wrapper = classNameForwardingWrapper(file);
    if (!wrapper) return;
    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportSpecifier')
        wrappers.set(specifier.local.name, wrapper);
    }
  });
  return wrappers;
};

const wrapperVariants = (wrapper, attributes) => {
  if (!wrapper.forwardsVariant) return wrapper.variants;
  const chosen = literalFragments(attributes.get('variant')).filter((variant) =>
    ALL_VARIANTS.includes(variant)
  );
  // No literal role at the call site: the wrapper's default is whatever its
  // signature says, so audit against every role it could be.
  return chosen.length ? chosen : ALL_VARIANTS;
};

const migratedSources = () =>
  Object.fromEntries(
    migratedFiles.map((file) => [
      file,
      fs.readFileSync(path.join(repositoryRoot, file), 'utf8'),
    ])
  );

const tsxFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : tsxFiles(full);
    }
    return entry.name.endsWith('.tsx') ? [full] : [];
  });

/**
 * The names the design system owns.
 *
 * Each was, until 29.08.2026, the name of two components at once: one in
 * `libraries/react-shared-libraries/src/form` and one in
 * `apps/frontend/src/components/ui`. Nothing announced the pair — an author
 * looking for a button found whichever import their editor offered first, and
 * the two drifted apart in geometry, in states and in what they announced.
 *
 * The check is a name check because the failure was a name failure. It is
 * written now, with the frontend copies gone, precisely because there is
 * nothing left to grandfather: a guard added while the debt still existed would
 * have frozen it instead of ending it.
 */
const SHARED_CONTROL_NAMES = [
  'Button',
  'ButtonLink',
  'Input',
  'Select',
  'Textarea',
  'Toggle',
];

/**
 * The one exception, named rather than pattern-matched.
 *
 * CopilotKit's chat takes a replacement input through a prop typed `InputProps`
 * and calls it `Input`. That name is the third party's, not ours, and the
 * component is a chat composer rather than a form control.
 */
const FOREIGN_CONTROL_NAMES = new Map([
  ['apps/frontend/src/components/agents/agent.input.tsx', ['Input']],
]);

const frontendControlRedefinitions = (sources) => {
  const offenders = [];
  for (const [file, source] of Object.entries(sources)) {
    if (!file.startsWith('apps/frontend/src/')) continue;
    const allowed = FOREIGN_CONTROL_NAMES.get(file) || [];
    walk(parse(source), (node) => {
      if (node.type !== 'ExportNamedDeclaration' || !node.declaration) return;
      const declared =
        node.declaration.type === 'FunctionDeclaration'
          ? [node.declaration.id?.name]
          : (node.declaration.declarations || []).map(
              (declarator) => declarator.id?.name
            );
      for (const name of declared) {
        if (!SHARED_CONTROL_NAMES.includes(name)) continue;
        if (allowed.includes(name)) continue;
        offenders.push(`${file}:${node.loc.start.line} ${name}`);
      }
    });
  }
  return offenders;
};

const interfaceSources = () =>
  Object.fromEntries(
    ['apps/frontend/src', 'libraries/react-shared-libraries/src']
      .flatMap((root) => tsxFiles(path.join(repositoryRoot, root)))
      .map((file) => [
        path.relative(repositoryRoot, file),
        fs.readFileSync(file, 'utf8'),
      ])
  );

/**
 * Utilities that place a field in its parent rather than paint it. These are
 * exactly what `fieldClassName` is for; anything else on a wrapper — a border,
 * a background, padding — is a real element and stays.
 */
const FIELD_LAYOUT_UTILITY =
  /^(?:flex-1|grow|shrink|shrink-0|w-full|(?:min-|max-)?w-\[[^\]]+\]|basis-\[[^\]]+\])$/;

/**
 * Every `<div>` that exists only to give one Input a width.
 *
 * The Input already renders that outer element and takes `fieldClassName` for
 * it. A wrapper repeats the decision in a second hand-written form, which is
 * how five of them accumulated after the prop was added.
 */
const manualFieldWrappers = (sources = interfaceSources()) => {
  const offenders = [];

  for (const [file, source] of Object.entries(sources)) {
    walk(parse(source), (node) => {
      if (node.type !== 'JSXElement') return;
      if (node.openingElement.name.name !== 'div') return;

      const elements = node.children.filter(
        (child) => child.type === 'JSXElement'
      );
      const hasText = node.children.some(
        (child) => child.type !== 'JSXElement' && child.type !== 'JSXText'
      );
      if (elements.length !== 1 || hasText) return;
      if (node.children.some((c) => c.type === 'JSXText' && c.value.trim())) {
        return;
      }
      if (elements[0].openingElement.name.name !== 'Input') return;

      const attributes = jsxAttributes(node.openingElement);
      const className = attributes.get('className');
      if (attributes.size !== 1 || !className) return;
      if (className.value?.type !== 'Literal') return;

      const tokens = String(className.value.value).trim().split(/\s+/);
      if (!tokens.every((token) => FIELD_LAYOUT_UTILITY.test(token))) return;

      offenders.push(`${file}:${node.loc.start.line} ${tokens.join(' ')}`);
    });
  }

  return offenders;
};

/**
 * Every audited call of a shared Button, directly or through a wrapper that
 * forwards `className`, with the class list the audit could resolve for it.
 */
const auditedButtonCalls = (sources) => {
  const calls = [];
  for (const [file, source] of Object.entries(sources)) {
    const ast = parse(source);
    const bindings = classListBindings(ast);
    const wrappers = importedForwardingWrappers(ast);
    walk(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;
      const name = node.name?.name;
      const wrapper = wrappers.get(name);
      if (name !== 'Button' && !wrapper) return;
      const attributes = jsxAttributes(node);
      const className = attributes.get('className');
      if (!className) return;
      calls.push({
        file,
        line: node.loc.start.line,
        through: wrapper ? name : null,
        variants: wrapper
          ? wrapperVariants(wrapper, attributes)
          : buttonVariants(attributes),
        classNames: literalFragments(className, bindings),
        free: freeIdentifiers(className, bindings),
      });
    });
  }
  return calls;
};

const variantConflicts = (sources = migratedSources()) => {
  const conflicts = [];
  for (const call of auditedButtonCalls(sources)) {
    if (!call.variants.length || !call.classNames.length) continue;
    for (const variant of call.variants) {
      const roles = conflictingRoles(variant, call.classNames);
      if (roles.length)
        conflicts.push(
          `${call.file}:${call.line} ${
            call.through ? `${call.through} ` : ''
          }${variant} ${roles.join(' ')}`
        );
    }
  }
  return conflicts.sort();
};

/**
 * The honest half of the audit.
 *
 * Resolving module constants and one wrapper hop covers what this repository
 * actually does, but a class list can still be built out of values that only
 * exist while the application runs — a name off a fetched record, a lookup in
 * a map keyed at runtime, a class handed down through a prop the audit did not
 * follow. Rather than let those read as covered, every `className` the audit
 * could not reduce to a single class string is listed here by name, so a new
 * one is a visible fact instead of silent coverage.
 */
const unreadableButtonClassNames = (sources = migratedSources()) =>
  auditedButtonCalls(sources)
    .filter((call) => !call.classNames.length && call.free.size)
    .map(
      (call) =>
        `${call.file}:${call.line} ${[...call.free].sort().join(' ')}`
    )
    .sort();

const POSITION_UTILITIES = [
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
];

const unprefixedPositions = (className) =>
  className
    .split(/\s+/)
    .map((token) => token.replace(/^!/, ''))
    .filter((token) => POSITION_UTILITIES.includes(token));

// The button element is the outermost node, so its class attribute comes first.
const buttonClassName = (markup) => /class="([^"]*)"/.exec(markup)?.[1] || '';

// Without a loading overlay the content wrapper is the last classed element.
const contentClassName = (markup) =>
  [...markup.matchAll(/class="([^"]*)"/g)].at(-1)?.[1] || '';

const renderedButtonClassName = (className) =>
  buttonClassName(render(Button, { className }, 'Audited'));

// Tailwind prints .relative after .absolute, so a position the component adds on
// top of the call site's own wins regardless of token order in the attribute.
const positionConflicts = (
  sources = Object.fromEntries(
    migratedFiles.map((file) => [
      file,
      fs.readFileSync(path.join(repositoryRoot, file), 'utf8'),
    ])
  ),
  renderClassName = renderedButtonClassName
) => {
  const conflicts = [];
  for (const [file, source] of Object.entries(sources)) {
    const ast = parser.parse(source, {
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      sourceType: 'module',
    });
    walk(ast, (node) => {
      if (node.type !== 'JSXOpeningElement' || node.name?.name !== 'Button')
        return;
      const attributes = new Map(
        node.attributes
          .filter((attribute) => attribute.type === 'JSXAttribute')
          .map((attribute) => [attribute.name.name, attribute])
      );
      const className = literalFragments(attributes.get('className')).join(' ');
      const owned = unprefixedPositions(className);
      if (!owned.length) return;
      const imposed = unprefixedPositions(renderClassName(className)).filter(
        (token) => !owned.includes(token)
      );
      if (imposed.length)
        conflicts.push(
          `${file}:${node.loc.start.line} ${owned.join(' ')} ${imposed.join(
            ' '
          )}`
        );
    });
  }
  return conflicts;
};

const buttonGeometryDefaultsRespectCallsite = () => {
  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/form/button.tsx'
    ),
    'utf8'
  );
  const ast = parser.parse(source, {
    ecmaFeatures: { jsx: true },
    loc: true,
    range: true,
    sourceType: 'module',
  });
  let found = false;
  walk(ast, (node) => {
    if (
      node.type === 'JSXAttribute' &&
      node.name?.name === 'className' &&
      node.value?.type === 'JSXExpressionContainer' &&
      node.value.expression?.type === 'CallExpression' &&
      node.value.expression.callee?.name === 'clsx' &&
      source.includes('const getGeometryClasses')
    ) {
      found = true;
    }
  });
  return found;
};

const migratedButtonsBypassGeometryMerge = () => {
  const bypasses = [];
  for (const file of migratedFiles) {
    const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    const ast = parser.parse(source, {
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      sourceType: 'module',
    });
    const sharedButtonNames = new Set();
    walk(ast, (node) => {
      if (
        node.type === 'ImportDeclaration' &&
        node.source.value === '@contentfactory/react/form/button'
      ) {
        for (const specifier of node.specifiers) {
          if (specifier.imported?.name === 'Button') {
            sharedButtonNames.add(specifier.local.name);
          }
        }
      }
    });
    walk(ast, (node) => {
      if (
        node.type === 'JSXOpeningElement' &&
        node.name?.type === 'JSXIdentifier' &&
        node.name.name === 'Button' &&
        !sharedButtonNames.has('Button')
      ) {
        bypasses.push(`${file}:${node.loc.start.line}`);
      }
    });
  }
  return bypasses;
};

describe('shared form-control contracts', () => {
  test('preserves explicit button semantics and an accessible loading name', () => {
    const explicit = render(
      Button,
      { type: 'submit', 'aria-expanded': true, variant: 'secondary' },
      'More options'
    );
    const loading = render(Button, { loading: true }, 'Save draft');

    expect(explicit).toContain('type="submit"');
    expect(explicit).toContain('aria-expanded="true"');
    expect(loading).toContain('disabled=""');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Save draft');
    expect(loading).toContain('opacity-0');
    expect(loading).not.toContain('invisible');
  });

  test('renders icon-only buttons as named squares', () => {
    const markup = render(
      Button,
      { iconOnly: true, size: 28, 'aria-label': 'Close', variant: 'quiet' },
      React.createElement('svg')
    );

    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain('h-[32px] w-[32px] p-0');
  });

  test('uses density, not legacy icon size, to own icon-only geometry', () => {
    const dense = render(
      Button,
      { iconOnly: true, size: 20, density: 'dense', 'aria-label': 'Close' },
      React.createElement('svg')
    );
    const standard = render(
      Button,
      { iconOnly: true, size: 32, density: 'standard', 'aria-label': 'Open' },
      React.createElement('svg')
    );

    expect(dense).toContain('h-[32px] w-[32px]');
    expect(standard).toContain('h-[40px] w-[40px]');
    expect(dense).not.toContain('h-[20px]');
    expect(standard).not.toContain('h-[32px] w-[32px]');
  });

  test('keeps one rendered owner for caller-overridden button geometry', () => {
    const standard = render(
      Button,
      { className: 'min-h-[44px] h-[36px] px-[12px]' },
      'Edit'
    );
    const iconOnly = render(
      Button,
      {
        iconOnly: true,
        size: 28,
        'aria-label': 'Open options',
        className: 'h-[36px] w-[36px] p-[8px]',
      },
      React.createElement('svg')
    );
    const logicalStart = render(
      Button,
      { className: 'ps-[10px]' },
      'Start aligned'
    );
    const logicalEndIcon = render(
      Button,
      {
        iconOnly: true,
        size: 28,
        'aria-label': 'End aligned options',
        className: 'pe-[8px]',
      },
      React.createElement('svg')
    );

    expect(standard).not.toContain('h-[36px]');
    expect(standard).toContain('px-[12px]');
    expect(standard).not.toContain('min-h-[44px]');
    expect(standard).toContain('h-[40px]');
    expect(standard).not.toContain('px-[16px]');
    expect(iconOnly).toContain('h-[32px] w-[32px]');
    expect(iconOnly).toContain('p-[8px]');
    expect(iconOnly).not.toContain('h-[28px]');
    expect(iconOnly).not.toContain('w-[28px]');
    expect(iconOnly).not.toContain('p-0');
    expect(logicalStart).toContain('ps-[10px]');
    expect(logicalStart).not.toContain('px-[16px]');
    expect(logicalStart).not.toContain('pl-[16px]');
    expect(logicalStart).not.toContain('pr-[16px]');
    expect(logicalEndIcon).toContain('pe-[8px]');
    expect(logicalEndIcon).toContain('pt-0 pb-0');
    expect(logicalEndIcon).not.toContain('px-0');
    expect(logicalEndIcon).not.toContain('pl-0');
    expect(logicalEndIcon).not.toContain('pr-0');
    expect(buttonGeometryDefaultsRespectCallsite()).toBe(true);
    expect(migratedButtonsBypassGeometryMerge()).toEqual([]);
  });

  test('keeps visual height inside every shared control primitive', () => {
    // A caller resizing a primitive breaks the 40/32 rhythm; non-height
    // presentation still belongs to its surface and must survive filtering.
    const className = 'h-[36px] min-h-[44px] max-h-[52px] size-[52px] [height:52px] [min-height:44px] [max-height:52px] [block-size:52px] [min-block-size:44px] [max-block-size:52px] md:h-[52px] hover:min-h-[44px] md:!h-[36px] md:text-cf-danger text-cf-danger';
    const control = render(ControlButton, { className, style: { height: 52, blockSize: 52, color: 'red' } }, 'Choice');
    const input = render(Input, {
      standalone: true, name: 'query', value: '', onChange: () => {}, className,
    });
    const select = render(
      Select,
      { standalone: true, name: 'period', value: 'day', onChange: () => {}, className },
      React.createElement('option', { value: 'day' }, 'Day')
    );
    const textarea = render(Textarea, {
      standalone: true, name: 'note', value: '', onChange: () => {}, className,
    });

    for (const markup of [control, input, select, textarea]) {
      expect(markup).not.toMatch(/(?:^|\s)(?:\w+:)?!?(?:min-|max-)?h-\[(?:36|44|52)px\]/);
      expect(markup).toContain('text-cf-danger');
      expect(markup).toContain('md:text-cf-danger');
    }
    expect(control).toContain('h-[40px]');
    expect(control).not.toContain('height:52px');
    expect(control).not.toContain('block-size:52px');
    expect(control).toContain('color:red');
    expect(input).toContain('h-[40px]');
    expect(select).toContain('h-[40px]');
    expect(textarea).toContain('min-h-[150px]');
  });

  test('reserves non-overlapping mobile hit space only for radio choices', () => {
    const denseRadios = render(
      RadioGroup,
      { value: 'week', onChange: () => {} },
      [
        React.createElement(
          RadioOption,
          { key: 'week', value: 'week', density: 'dense' },
          'Week'
        ),
        React.createElement(
          RadioOption,
          { key: 'month', value: 'month', density: 'dense' },
          'Month'
        ),
      ]
    );
    const denseMenu = render(
      MenuOption,
      { density: 'dense', selected: true },
      'Workspace'
    );

    expect(
      denseRadios.match(/cf-dense-choice-touch-target/g) ?? []
    ).toHaveLength(2);
    expect(denseRadios.match(/before:-inset-y-1\.5/g) ?? []).toHaveLength(2);
    expect(denseRadios).toContain('md:before:inset-y-0');
    expect(denseRadios).toContain('before:inset-x-0');
    expect(denseRadios.match(/h-\[32px\]/g) ?? []).toHaveLength(2);
    expect(denseMenu).toContain('h-[32px]');
    expect(denseMenu).not.toContain('cf-dense-choice-touch-target');
    expect(denseMenu).not.toContain('before:-inset-y-1.5');
  });

  test('lets a call site set the gap between a button icon and its label', () => {
    // The gap anyone can see belongs to the inner wrapper: the `<button>` has a
    // single in-flow child, so a `gap-*` written at the call site had nothing to
    // space and the wrapper's own 8px won every time. The FAQ rows asked for 12
    // and the analytics and time-table filters for 6; all three rendered 8.
    const wide = render(Button, { className: 'gap-[12px]' }, 'Read more');
    const narrow = render(Button, { className: 'gap-[6px]' }, 'Filter');
    const plain = render(Button, {}, 'Save draft');
    const responsive = render(Button, { className: 'md:gap-[12px]' }, 'Save');

    expect(wide).toContain('gap-[12px]');
    expect(wide).not.toContain('gap-[8px]');
    expect(narrow).toContain('gap-[6px]');
    expect(narrow).not.toContain('gap-[8px]');
    expect(plain).toContain('gap-[8px]');
    // A prefixed gap answers to one breakpoint and says nothing about the
    // resting layout, so the default still has to cover every other width.
    expect(responsive).toContain('gap-[8px]');
  });

  test('keeps one rendered owner for caller-overridden button position', () => {
    const corner = render(
      Button,
      { className: 'absolute end-[10px] top-[10px]' },
      'Close'
    );
    const pinned = render(Button, { className: 'sticky top-0' }, 'Filters');
    const unpositioned = render(Button, {}, 'Save draft');
    const positionedWhileLoading = render(
      Button,
      { loading: true, className: 'absolute bottom-[100%]' },
      'Post Now'
    );

    expect(positionConflicts()).toEqual([]);
    expect(unprefixedPositions(buttonClassName(corner))).toEqual(['absolute']);
    expect(unprefixedPositions(buttonClassName(pinned))).toEqual(['sticky']);
    // No call-site position: the component still owns the containing block the
    // loading overlay is positioned against.
    expect(unprefixedPositions(buttonClassName(unpositioned))).toEqual([
      'relative',
    ]);
    expect(
      unprefixedPositions(buttonClassName(positionedWhileLoading))
    ).toEqual(['absolute']);
    expect(positionedWhileLoading).toContain('absolute inset-0');
  });

  test('audits a call-site position the component would override', () => {
    const alwaysRelative = (className) => `flex relative ${className}`;

    expect(
      positionConflicts(
        {
          'corner.tsx':
            '<Button className="absolute end-[10px] top-[10px]" />;',
          'flow.tsx': '<Button className="px-[16px]" />;',
        },
        alwaysRelative
      )
    ).toEqual(['corner.tsx:1 absolute relative']);
  });

  test('renders standalone controls without form wrapper or error gutter', () => {
    const input = render(Input, {
      standalone: true,
      id: 'audio-search',
      name: 'audio-search',
      value: 'rain',
      onChange: () => {},
      fieldClassName: 'flex-1',
      className: 'border-cf-accent',
    });
    const select = render(
      Select,
      {
        standalone: true,
        id: 'language',
        name: 'language',
        value: 'ru',
        onChange: () => {},
      },
      React.createElement('option', { value: 'ru' }, 'Russian')
    );
    const textarea = render(Textarea, {
      standalone: true,
      id: 'notes',
      name: 'notes',
      rows: 4,
      value: 'Draft',
      onChange: () => {},
    });

    expect(input).toContain('id="audio-search"');
    expect(input).toContain('name="audio-search"');
    expect(input).toContain('value="rain"');
    expect(input).not.toContain('-error');
    expect(input).toMatch(/^<div class="[^"]*flex-1[^"]*">/);
    expect(input.match(/<div[^>]*>/g)[0]).not.toContain('border-cf-accent');
    expect(input.match(/<div[^>]*>/g)[1]).toContain('border-cf-accent');
    expect(input.match(/<div[^>]*>/g)[1]).not.toContain('flex-1');

    const invalidInput = render(Input, {
      standalone: true,
      id: 'invalid-search',
      name: 'invalid-search',
      error: 'Choose a result',
    });
    expect(invalidInput).toContain('id="invalid-search-error"');
    expect(invalidInput).toContain('Choose a result');
    expect(select).toMatch(/^<select /);
    expect(select).toContain('id="language"');
    expect(select).toContain('name="language"');
    expect(select).not.toContain('-error');
    expect(textarea).toMatch(/^<textarea /);
    expect(textarea).toContain('id="notes"');
    expect(textarea).toContain('name="notes"');
    expect(textarea).toContain('rows="4"');
    expect(textarea).toContain('Draft');
    expect(textarea).not.toContain('-error');
  });

  test('lays out a field through fieldClassName rather than a wrapper div', () => {
    // `fieldClassName` exists because the field's outer element is the Input's
    // own. A hand-written `<div className="flex-1">` around it is the same
    // decision written a second way: it stretches the wrapper, and whether the
    // field inside stretches with it is then a separate accident.
    expect(manualFieldWrappers()).toEqual([]);
  });

  test('flags only a layout-only wrapper that holds a single field', () => {
    expect(
      manualFieldWrappers({
        'flow.tsx': '<div className="flex-1"><Input name="code" /></div>;',
        'kept.tsx': '<div className="rounded-[8px]"><Input name="ok" /></div>;',
        'pair.tsx': '<div className="flex-1"><Input /><Button /></div>;',
      })
    ).toEqual(['flow.tsx:1 flex-1']);
  });

  test('keeps ref and native textarea typing in the shared implementation', () => {
    const source = fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src/form/textarea.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('forwardRef<HTMLTextAreaElement');
    expect(source).toContain('TextareaHTMLAttributes<HTMLTextAreaElement>');
  });

  test('does not mix migrated variant roles with conflicting role classes', () => {
    expect(variantConflicts()).toEqual([]);
  });

  test('audits clsx and template-literal variant role fragments', () => {
    expect(
      variantConflicts({
        'fixture.tsx':
          'const preview = <Button variant="quiet" className={clsx(`bg-cf-surface`, enabled && \'border-cf-border\')} />;',
      })
    ).toEqual(['fixture.tsx:1 quiet bg-cf-surface border-cf-border']);
  });

  test('audits default-primary and dynamic legacy-secondary role conflicts', () => {
    expect(
      variantConflicts({
        'default.tsx':
          '<Button className="!bg-cf-surface text-center text-sm text-balance hover:!text-cf-ink" />;',
        'secondary.tsx':
          '<Button secondary={isSecondary} className="hover:!bg-cf-accent" />;',
      })
    ).toEqual([
      'default.tsx:1 primary bg-cf-surface text-cf-ink',
      'secondary.tsx:1 primary bg-cf-accent',
      'secondary.tsx:1 secondary bg-cf-accent',
    ]);
  });

  test('paints and aligns a navigation row from the shared primitive', () => {
    const row = render(
      Button,
      {
        variant: 'navigation',
        className: 'relative h-[40px] px-[10px] font-[600]',
        innerClassName: 'justify-start gap-[10px]',
      },
      'Calendar'
    );
    const current = render(
      Button,
      {
        variant: 'navigation-current',
        className: 'relative h-[40px] px-[10px] font-[650]',
        innerClassName: 'justify-start gap-[10px]',
      },
      'Calendar'
    );
    const action = render(Button, {}, 'Save draft');

    // The rail's colour belongs to the variant, and the anchor branch of a row
    // draws the very same string rather than a copy of it.
    expect(buttonClassName(row)).toContain(navigationRowVariant(false));
    expect(buttonClassName(current)).toContain(navigationRowVariant(true));
    expect(navigationRowVariant(true)).toContain('bg-cf-navigation-active');
    expect(navigationRowVariant(false)).toContain('text-cf-navigation-muted');

    // One rendered owner for the label weight: a current row is marked by
    // weight as well as by plate and bar.
    expect(buttonClassName(current)).toContain('font-[650]');
    expect(buttonClassName(current)).not.toContain('font-[600]');
    expect(buttonClassName(action)).toContain('font-[600]');

    // One rendered owner for the content wrapper: a rail row reads from the
    // left edge at the rail's 10px, an action label stays centred at 8px.
    expect(contentClassName(row)).toContain('justify-start');
    expect(contentClassName(row)).toContain('gap-[10px]');
    expect(contentClassName(row)).not.toContain('justify-center');
    expect(contentClassName(row)).not.toContain('gap-[8px]');
    expect(contentClassName(action)).toContain('justify-center');
    expect(contentClassName(action)).toContain('gap-[8px]');
  });

  test('reads a role handed to a variant as a module constant', () => {
    expect(
      variantConflicts({
        'rail.tsx':
          "const ROW = 'text-cf-navigation-muted hover:bg-cf-navigation-active';\n" +
          'const rail = <Button variant="quiet" className={ROW} />;',
      })
    ).toEqual([
      'rail.tsx:2 quiet text-cf-navigation-muted bg-cf-navigation-active',
    ]);
  });

  test('follows a role through a component that forwards className', () => {
    const wrapper = classNameForwardingWrapper(
      'apps/frontend/src/components/layout/logout.component.tsx'
    );

    expect(wrapper).not.toBeNull();
    expect(wrapper.forwardsVariant).toBe(true);
    expect(
      variantConflicts({
        'rail.tsx':
          "import { LogoutComponent } from '@contentfactory/frontend/components/layout/logout.component';\n" +
          "const ROW = 'text-cf-navigation-muted hover:bg-cf-navigation-active';\n" +
          'const rail = <LogoutComponent variant="quiet" className={ROW} />;',
      })
    ).toEqual([
      'rail.tsx:3 LogoutComponent quiet text-cf-navigation-muted bg-cf-navigation-active',
    ]);
  });

  test('names the class lists it cannot read instead of counting them covered', () => {
    // A `className` the audit can reduce to no string at all is not audited.
    // Empty is the state to hold: every class list reaching a shared Button
    // today is either written at the call site or assembled from constants in
    // the same module. What stays out of reach on purpose is a class list built
    // from values that exist only while the application runs, and a second
    // wrapper hop — a wrapper handing `className` to another wrapper.
    expect(unreadableButtonClassNames()).toEqual([]);
  });

  test('keeps the managed scheduling arrow colour owned by its Button variant', () => {
    const source = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/new-launch/manage.modal.tsx'
      ),
      'utf8'
    );

    expect(source).not.toContain(
      'DropdownArrowSmallIcon className="group-hover:rotate-180 text-cf-accent-ink"'
    );
  });

  test('keeps the frontend from naming a second component after a shared control', () => {
    expect(frontendControlRedefinitions(interfaceSources())).toEqual([]);
  });

  test('flags a frontend redefinition and lets the named foreign one through', () => {
    expect(
      frontendControlRedefinitions({
        'apps/frontend/src/components/ui/button.tsx':
          'export const Button = () => null;',
        'apps/frontend/src/components/agents/agent.input.tsx':
          'export const Input = () => null;',
        'apps/frontend/src/components/settings/panel.tsx':
          'export function Toggle() { return null; }',
        'libraries/react-shared-libraries/src/form/button.tsx':
          'export const Button = () => null;',
      })
    ).toEqual([
      'apps/frontend/src/components/ui/button.tsx:1 Button',
      'apps/frontend/src/components/settings/panel.tsx:1 Toggle',
    ]);
  });
});
