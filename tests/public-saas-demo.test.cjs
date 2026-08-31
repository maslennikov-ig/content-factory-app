const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const demoFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/public-saas/synthetic-demo.tsx'
);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4200/demo',
  pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} = require('@testing-library/react');
const telemetry = jest.fn();

/**
 * Compiles the demo and the modules it imports from this folder, so the panel
 * frame, the channel tabs and the shared controls are the shipped ones. What is
 * mocked is only what the demo has no business reaching: the copy, which is
 * substituted with the key itself so an assertion names the key rather than a
 * sentence, and the telemetry sink.
 */
function loadDemo() {
  const cache = new Map();
  const compile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      fileName: absolute,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const loaded = { exports: {} };
    cache.set(absolute, loaded);
    const directory = path.dirname(absolute);
    const localRequire = (request) => {
      if (request === './public-copy') {
        return { usePublicCopy: () => (key) => key };
      }
      if (request === './public-telemetry') {
        return { usePublicTelemetry: () => telemetry };
      }
      if (request === '@contentfactory/react/choice/tabs') {
        return compile(
          path.join(
            repositoryRoot,
            'libraries/react-shared-libraries/src/choice/tabs.tsx'
          )
        );
      }
      if (request === '@contentfactory/react/choice/control.button') {
        return compile(
          path.join(
            repositoryRoot,
            'libraries/react-shared-libraries/src/choice/control.button.tsx'
          )
        );
      }
      if (request === '@contentfactory/react/form/button') {
        return compile(
          path.join(
            repositoryRoot,
            'libraries/react-shared-libraries/src/form/button.tsx'
          )
        );
      }
      if (request === '@contentfactory/react/form/textarea') {
        return compile(
          path.join(
            repositoryRoot,
            'libraries/react-shared-libraries/src/form/textarea.tsx'
          )
        );
      }
      if (request === '@contentfactory/react/platform/platform.families') {
        return compile(
          path.join(
            repositoryRoot,
            'libraries/react-shared-libraries/src/platform/platform.families.ts'
          )
        );
      }
      if (request === 'next/link') {
        return ({ href, children, ...rest }) =>
          React.createElement('a', { href, ...rest }, children);
      }
      if (!request.startsWith('.')) return require(request);
      for (const suffix of ['', '.tsx', '.ts']) {
        const candidate = path.resolve(directory, request + suffix);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return compile(candidate);
        }
      }
      throw new Error(`cannot resolve ${request} from ${directory}`);
    };
    new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      compiled
    )(loaded.exports, localRequire, loaded, absolute, directory);
    return loaded.exports;
  };
  return compile(demoFile);
}

const material = () => screen.getByRole('textbox', { name: 'plan' });

/**
 * A metric tile carrying exactly this number. The digits are grouped with a
 * non-breaking space so a figure never wraps mid-number, which no string
 * matcher should have to know about — hence the comparison on digits alone.
 */
const tile = (value) => (_content, element) =>
  element?.tagName === 'DD' &&
  element.textContent.replace(/\s/g, '') === String(value);
const step = (name) => screen.getByRole('button', { name });
const next = () => screen.getByRole('button', { name: 'next' });

afterEach(() => {
  cleanup();
  telemetry.mockClear();
});

describe('synthetic public demo', () => {
  test('keeps the stage vocabulary the growth event is allowed to carry', () => {
    const { SYNTHETIC_DEMO_VERSION, DEMO_STAGES } = loadDemo();
    // The backend accepts these four `demoStep` values and no others; the words
    // a visitor reads are the copy keys of the same name, and those may change.
    expect(SYNTHETIC_DEMO_VERSION).toBe('public-demo-v1');
    expect(DEMO_STAGES).toEqual(['plan', 'draft', 'review', 'schedule']);
  });

  /**
   * The failure this replaces: four paragraphs and a Next button. A visitor
   * could not put a single word in, so the page demonstrated nothing about
   * their content — which is the only thing they came to find out.
   */
  test('carries the visitor’s own text into the channel versions', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    const field = material();
    expect(field.tagName).toBe('TEXTAREA');
    fireEvent.change(field, { target: { value: 'Мой собственный текст' } });

    fireEvent.click(next());

    // The adaptation step shows that text, not a canned sample.
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('Мой собственный текст');
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
  });

  test('measures that text against each platform’s real limit', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.change(material(), { target: { value: 'x'.repeat(300) } });
    fireEvent.click(next());

    // X stops at 280, so 300 characters do not fit there.
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('300 / 280');
    expect(within(panel).getByText('demoOverLimit')).toBeTruthy();

    // Telegram takes 4096, and the same text fits without a word changing.
    fireEvent.click(screen.getByRole('tab', { name: /Telegram/ }));
    const telegram = screen.getByRole('tabpanel');
    expect(telegram.textContent).toContain('300 / 4096');
    expect(within(telegram).getByText('demoWithinLimit')).toBeTruthy();
  });

  test('refuses to schedule material that has not been approved', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.click(next());
    fireEvent.click(next());

    // The review step is reached and the way forward is closed until the
    // material is actually approved — a step that can be skipped teaches
    // nothing about the step.
    expect(screen.getByRole('heading', { name: 'review' })).toBeTruthy();
    expect(next().disabled).toBe(true);

    fireEvent.click(step('draftHandoff'));
    expect(next().disabled).toBe(true);
    fireEvent.click(step('approveApprove'));
    expect(screen.getByText('demoApproved')).toBeTruthy();
    expect(next().disabled).toBe(false);
  });

  test('places the approved material on a day and a time, and says so', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(step('draftHandoff'));
    fireEvent.click(step('approveApprove'));
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'schedule' })).toBeTruthy();
    expect(screen.queryByText('statusScheduled')).toBeNull();

    fireEvent.click(step('19'));
    expect(screen.queryByText('statusScheduled')).toBeNull();
    fireEvent.click(step('09:00'));
    expect(screen.getByText('statusScheduled')).toBeTruthy();

    // And the page never stops saying that this went nowhere.
    expect(screen.getByText('demoNothingLeaves')).toBeTruthy();
  });

  /**
   * The result step. It exists because a demo that stops at "scheduled" stops
   * one step before the question the visitor came with — did it work — and
   * because the figures are the only part of the product a landing page cannot
   * show honestly without saying, in the same panel, that they are invented.
   */
  test('ends on figures the earlier steps actually produced', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    // Long enough that X (280) cannot carry it and Instagram (2200) can.
    fireEvent.change(material(), { target: { value: 'x'.repeat(600) } });
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(step('draftHandoff'));
    fireEvent.click(step('approveApprove'));
    fireEvent.click(next());
    // The calendar gates the result the way approval gated the calendar.
    expect(next().disabled).toBe(true);
    fireEvent.click(step('19'));
    fireEvent.click(step('09:00'));
    expect(next().disabled).toBe(false);
    fireEvent.click(next());

    expect(screen.getByRole('heading', { name: 'result' })).toBeTruthy();
    expect(screen.getByText('demoPublished')).toBeTruthy();
    // Never a figure without the words that say what it is.
    expect(screen.getByText('demoData')).toBeTruthy();

    // X did not fit, so X reports nothing — and the totals do not count it.
    expect(screen.getByText('demoNotSent')).toBeTruthy();
    const withoutX = 1940 + 7640 + 3120;
    expect(screen.getByText(tile(withoutX))).toBeTruthy();

    // And it names the channel worth repeating, which is the point of looking.
    expect(screen.getByText('demoBestChannel')).toBeTruthy();
  });

  test('counts every channel once the text fits all of them', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.change(material(), { target: { value: 'Коротко.' } });
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(step('draftHandoff'));
    fireEvent.click(step('approveApprove'));
    fireEvent.click(next());
    fireEvent.click(step('19'));
    fireEvent.click(step('09:00'));
    fireEvent.click(next());

    expect(screen.queryByText('demoNotSent')).toBeNull();
    const chosen = 830 + 1940 + 7640 + 3120;
    expect(screen.getByText(tile(chosen))).toBeTruthy();
  });

  /**
   * One material goes to several channels at once, which is what the product
   * does and what this step has to let a visitor do. The choice is not
   * decoration: what is chosen is what the result counts.
   */
  test('lets several channels be chosen at once and counts only those', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.change(material(), { target: { value: 'Коротко.' } });
    fireEvent.click(next());

    // Four arrive chosen; the picker is a set of toggles, not a tab strip.
    const chip = (name) => screen.getByRole('button', { name });
    for (const name of ['X', 'Instagram', 'Telegram', 'Facebook']) {
      expect(chip(name).getAttribute('aria-pressed')).toBe('true');
    }
    for (const name of ['TikTok', 'YouTube']) {
      expect(chip(name).getAttribute('aria-pressed')).toBe('false');
    }
    // Only the chosen ones get a version to look at.
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    // Add one, drop another, and the strip follows.
    fireEvent.click(chip('TikTok'));
    fireEvent.click(chip('Facebook'));
    expect(chip('TikTok').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Facebook').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    fireEvent.click(next());
    fireEvent.click(step('draftHandoff'));
    fireEvent.click(step('approveApprove'));
    fireEvent.click(next());
    fireEvent.click(step('19'));
    fireEvent.click(step('09:00'));
    fireEvent.click(next());

    // TikTok in, Facebook out — the figures are the ones the visitor asked for.
    const withTikTokWithoutFacebook = 830 + 1940 + 1260 + 7640;
    expect(screen.getByText(tile(withTikTokWithoutFacebook))).toBeTruthy();
  });

  test('will not move on with nothing to publish to', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.click(next());
    for (const name of ['X', 'Instagram', 'Telegram', 'Facebook']) {
      fireEvent.click(screen.getByRole('button', { name }));
    }

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('demoNoChannels')).toBeTruthy();
    expect(next().disabled).toBe(true);
  });

  test('reports the two lifecycle events once each, whatever the route taken', () => {
    const { SyntheticDemo } = loadDemo();
    render(React.createElement(SyntheticDemo));

    fireEvent.click(next());
    expect(telemetry).toHaveBeenCalledWith('demo_started', 'plan');

    fireEvent.click(next());
    fireEvent.click(step('draftHandoff'));
    fireEvent.click(step('approveApprove'));
    fireEvent.click(next());
    expect(telemetry).toHaveBeenCalledWith('demo_completed', 'schedule');

    // Walking back and forth again must not double-count either event.
    fireEvent.click(step('plan'));
    fireEvent.click(next());
    fireEvent.click(step('schedule'));
    expect(
      telemetry.mock.calls.filter(([name]) => name === 'demo_started')
    ).toHaveLength(1);
    expect(
      telemetry.mock.calls.filter(([name]) => name === 'demo_completed')
    ).toHaveLength(1);
  });

  test('contains no direct network client, tenant API, AI, Temporal, OAuth or publishing integration', () => {
    const source = fs.readFileSync(demoFile, 'utf8');
    expect(source).not.toMatch(/\bfetch\b|useFetch|internalFetch|axios/);
    expect(source).not.toMatch(/Temporal|OAuth|openai|publish\s*\(/i);
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});
