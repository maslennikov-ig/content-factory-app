'use strict';

/**
 * «Найдено поиском» — the path, not the node.
 *
 * The producer was built on 01.09.2026 and the task was closed on the strength
 * of a green suite: `POST /content-intelligence/sources/search-evidence`
 * existed, its service was covered, its snapshot shape was right. The audit of
 * 02.09.2026 reopened it with one grep — no file under `apps/frontend` called
 * that route, and there was no search screen at all. The door had been cut and
 * locked from the other side.
 *
 * So this guard checks the wire rather than the node, and does it by driving
 * the interface: it renders the panel, types a subject, presses the buttons a
 * person presses, and asserts the requests that leave. A test that only read
 * the source for a string would have been satisfied by a constant nobody
 * calls — which is the exact failure it exists to prevent.
 *
 * Four things it holds:
 *
 *  - the search asks the server, and the accept sends what the accepting DTO
 *    takes: url, excerpt and provider at minimum.
 *  - the excerpt does not become a claim on its own. What comes back is handed
 *    over as evidence for a claim the person still has to write, which is the
 *    owner's rule of 02.09.2026: only what the product found needs a look.
 *  - saving a fact with an accepted excerpt attaches it, so the showcase has
 *    something to offer «Подтвердить» on.
 *  - the panel is mounted where the brief asks «чем подтвердишь», not on a
 *    tab of its own — the map (§3) puts it there deliberately.
 */

const fs = require('node:fs');
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

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const FILES = {
  container: `${base}/content-search.container.tsx`,
  adapter: `${base}/content-search.adapter.ts`,
  facts: `${base}/content-facts.container.tsx`,
  brief: 'apps/frontend/src/components/brand-voice/voice-brief.container.tsx',
  controller: 'apps/backend/src/api/routes/content-source.controller.ts',
};

const read = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

test('the search panel and its adapter exist', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

const adapter = loadTypeScriptModule(FILES.adapter);
const container = loadTypeScriptModule(FILES.container);
const facts = loadTypeScriptModule(FILES.facts);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const call = {
      url,
      method,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer(call) : answer;
  };
};

const FOUND = {
  summary: 'Коротко о найденном.',
  provider: 'tavily',
  results: [
    {
      url: 'https://example.org/report',
      title: 'Отчёт за август',
      excerpt: 'Доля повторных покупок выросла до 38 процентов.',
      publishedAt: '2026-08-14T00:00:00.000Z',
      provider: 'tavily',
    },
  ],
};

const ACCEPTED = {
  evidenceId: 'evidence-1',
  sourceSnapshotId: 'snapshot-1',
  url: 'https://example.org/report',
  title: 'Отчёт за август',
  excerpt: 'Доля повторных покупок выросла до 38 процентов.',
  provider: 'tavily',
  publishedAt: '2026-08-14T00:00:00.000Z',
  retrievedAt: '2026-09-02T10:00:00.000Z',
  freshUntil: '2027-09-02T10:00:00.000Z',
};

const renderSearch = async (onEvidenceAccepted) => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru' },
          React.createElement(container.ContentSearchContainer, {
            onEvidenceAccepted,
          })
        )
      )
    );
  });
  await act(async () => {});
};

const runSearch = async () => {
  const subject = document.querySelector('textarea[name="searchSubject"]');
  await act(async () => {
    fireEvent.change(subject, { target: { value: 'повторные покупки' } });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector('[data-content-search-form]'));
  });
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('a person can reach the accepting door', () => {
  test('the search asks the server with what was typed', async () => {
    serve({
      [`POST ${adapter.SEARCH_API}`]: ok(FOUND),
    });
    await renderSearch();
    await runSearch();

    const search = calls.find((call) => call.url === adapter.SEARCH_API);
    expect(search).toBeDefined();
    expect(search.method).toBe('POST');
    expect(search.body).toEqual({ subject: 'повторные покупки' });
    // What was found is on screen, or there is nothing to accept.
    expect(
      screen.getByText('Доля повторных покупок выросла до 38 процентов.')
    ).toBeTruthy();
  });

  test('accepting sends the excerpt, the link and the provider', async () => {
    serve({
      [`POST ${adapter.SEARCH_API}`]: ok(FOUND),
      [`POST ${adapter.SEARCH_EVIDENCE_API}`]: ok(ACCEPTED),
    });
    const accepted = [];
    await renderSearch((evidence) => accepted.push(evidence));
    await runSearch();

    await act(async () => {
      fireEvent.click(
        document.querySelector(
          '[data-content-search-accept="https://example.org/report"]'
        )
      );
    });
    await act(async () => {});

    const accept = calls.find(
      (call) => call.url === adapter.SEARCH_EVIDENCE_API
    );
    expect(accept).toBeDefined();
    expect(accept.method).toBe('POST');
    expect(accept.body).toEqual({
      url: 'https://example.org/report',
      title: 'Отчёт за август',
      excerpt: 'Доля повторных покупок выросла до 38 процентов.',
      publishedAt: '2026-08-14T00:00:00.000Z',
      provider: 'tavily',
    });

    // Handed over, not turned into a claim behind the person's back.
    expect(accepted).toHaveLength(1);
    expect(accepted[0].evidenceId).toBe('evidence-1');
    expect(
      calls.some((call) => String(call.url).startsWith('/content-intelligence/facts'))
    ).toBe(false);
  });
});

describe('an accepted excerpt becomes evidence for a claim the person writes', () => {
  test('saving the fact attaches the evidence to it', async () => {
    serve({
      'GET /content-intelligence/facts': ok({ facts: [] }),
      'POST /content-intelligence/facts': ok({ id: 'fact-9' }),
      'POST /content-intelligence/facts/fact-9/evidence': ok({ ok: true }),
    });

    await act(async () => {
      render(
        React.createElement(
          SWRConfig,
          { value: { provider: () => new Map(), dedupingInterval: 0 } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(facts.ContentFactsContainer, {
              pendingEvidence: {
                evidenceId: 'evidence-1',
                url: 'https://example.org/report',
                title: 'Отчёт за август',
                excerpt: 'Доля повторных покупок выросла до 38 процентов.',
                retrievedAt: '2026-09-02T10:00:00.000Z',
                freshUntil: '2027-09-02T10:00:00.000Z',
              },
            })
          )
        )
      );
    });
    await act(async () => {});

    // The excerpt is named on screen, so nobody saves a claim without seeing
    // what it will stand on.
    expect(
      document.querySelector('[data-content-facts-pending-evidence="evidence-1"]')
    ).toBeTruthy();

    // `content-factory-next-d1rx`: the excerpt is quoted beside the form, not
    // typed into it. A statement is the person's own word (§9.5) and enters
    // the unified context as such before the evidence is confirmed, so the
    // product's text must not become «own word» by a pre-filled field.
    const statementField = document.querySelector(
      '[data-content-facts-form] [name="statement"]'
    );
    expect(statementField).toBeTruthy();
    expect(statementField.value).toBe('');

    await act(async () => {
      fireEvent.submit(document.querySelector('[data-content-facts-form]'));
    });
    await act(async () => {});

    const link = calls.find(
      (call) => call.url === '/content-intelligence/facts/fact-9/evidence'
    );
    expect(link).toBeDefined();
    expect(link.method).toBe('POST');
    expect(link.body).toEqual({
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
    });
  });
});

describe('the panel is where the question is asked', () => {
  test('the brief mounts the search beside the fact form', () => {
    const brief = read('brief');
    // The element, not the word: a substring match is satisfied by an import
    // that nothing renders, and by a renamed component that renders nothing.
    expect(brief).toMatch(/<ContentSearchContainer[\s/>]/);
    expect(brief).toMatch(/<ContentFactsContainer[\s/>]/);
    expect(brief).toContain('pendingEvidence');
  });

  test('the server offers the search the screen calls', () => {
    const controller = read('controller');
    expect(controller).toContain("@Post('/search')");
    expect(controller).toContain("@Post('/search-evidence')");
  });

  /**
   * The producer's own test suite was green while the route was unreachable,
   * so the constants themselves are pinned: a rename that quietly points the
   * screen at nothing would otherwise pass every assertion above.
   */
  test('the screen names the routes the server answers on', () => {
    expect(adapter.SEARCH_API).toBe('/content-intelligence/sources/search');
    expect(adapter.SEARCH_EVIDENCE_API).toBe(
      '/content-intelligence/sources/search-evidence'
    );
  });
});

describe('a provider answering with less than it promised', () => {
  test('a result with no link or no excerpt is not offered for accepting', () => {
    const answer = adapter.readSearchAnswer({
      summary: '',
      provider: 'mixed',
      results: [
        { url: '', excerpt: 'нечего открыть' },
        { url: 'https://example.org/a', excerpt: '' },
        { url: 'https://example.org/b', excerpt: 'годится' },
      ],
    });
    expect(answer.results.map((row) => row.url)).toEqual([
      'https://example.org/b',
    ]);
  });
});

/**
 * The owner's decision of 02.09.2026 on the two thresholds: they stay
 * different, and the difference is said out loud on the screen where it
 * bites. Left silent, a person builds a brief on bare links, gets a draft,
 * and finds nothing to show when the post is reviewed — a protection that
 * looks like one and is not.
 */
describe('the two bars are different, and the screen says so', () => {
  test('the brief warns on a claim grounded by a bare link', () => {
    const brief = read('brief');
    expect(brief).toContain('bareLinkWarning');
    // Only on a row that is actually in that state: a statement and a link,
    // with no id from working memory.
    expect(brief).toMatch(
      /row\.statement\.trim\(\)\s*&&\s*row\.sourceUrl\.trim\(\)\s*&&\s*!row\.factId\.trim\(\)/
    );
  });

  test('the sentence exists in both languages', () => {
    const adapterSource = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/brand-voice/voice-brief.adapter.ts'),
      'utf8'
    );
    expect(
      (adapterSource.match(/bareLinkWarning:/g) || []).length
    ).toBeGreaterThanOrEqual(2);
  });
});
