'use strict';

/**
 * `content-factory-next-75xn.7` on the screen: the second way to start
 * watching something.
 *
 * The empty state used to offer one live card — «Лента сайта» — and one
 * switched-off one. A person who knows *what* they want to follow but not
 * whose feed carries it had nothing to press. The topic card is that door,
 * and this suite pins the three things it must get right: it opens the create
 * dialog on the topic kind (a topic field, not an address one), it sends the
 * kind and the topic and no half-typed address, and a saved topic row reads
 * as the topic a person typed rather than as the `topic://` key the server
 * derived from it.
 *
 * The last test is about a different switch, not a different feature:
 * `LEAD_TOPIC_CHECK_ENABLED` and `LEAD_FEED_CHECK_ENABLED` are independent on
 * the server, so a screen reading one of them would disable a live button on
 * one row while offering a dead one on the other.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

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

const { act, cleanup, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const leads = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx'
);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const TOPIC_ROW = {
  id: 'sub-topic',
  kind: 'TOPIC',
  displayName: 'Регулирование ИИ',
  // What the server actually stores: the derived key, which nobody typed.
  canonicalUrl: 'topic://регулирование ии в европе',
  query: 'Регулирование ИИ в Европе',
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 0,
  acceptedThisMonth: 0,
  linkedAutoPost: null,
};

const FEED_ROW = {
  id: 'sub-feed',
  kind: 'RSS',
  displayName: 'Хабр',
  canonicalUrl: 'https://habr.com/ru/rss/all/all/',
  query: null,
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 0,
  acceptedThisMonth: 0,
  linkedAutoPost: null,
};

const calls = [];

const serve = ({ subscriptions = [], feedCheck = true, topicCheck = true, leadRows = [] }) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : null });
    if (url === '/content-intelligence/leads/subscriptions' && method === 'GET') {
      return ok({ subscriptions, capabilities: { feedCheck, topicCheck } });
    }
    if (url === '/content-intelligence/leads/queue?status=NEW') {
      return ok({ leads: leadRows });
    }
    if (url === '/content-intelligence/leads/subscriptions/linkable-autoposts') {
      return ok({ autoPosts: [] });
    }
    return ok({});
  };
};

const renderTab = async (language = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'ADMIN' } },
          React.createElement(
            variables.VariableContextComponent,
            { language },
            React.createElement(leads.ContentLeadsTab)
          )
        )
      )
    );
  });
  await act(async () => {});
};

const typeInto = async (name, value) => {
  const field = document.querySelector(`input[name="${name}"]`);
  expect(field).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  ).set;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};

afterEach(() => {
  cleanup();
  calls.length = 0;
  delete global.fetch;
});

describe('the topic card on the empty screen', () => {
  test('it is offered beside the feed card and opens the dialog on the topic field', async () => {
    serve({ subscriptions: [] });
    await renderTab();

    expect(document.body.textContent).toContain('Тема');
    await act(async () => {
      screen.getByRole('button', { name: 'Указать тему' }).click();
    });

    // The topic field, and not the address field the feed card opens.
    expect(document.querySelector('input[name="query"]')).toBeTruthy();
    expect(document.querySelector('input[name="canonicalUrl"]')).toBeNull();
    expect(document.body.textContent).toContain('30 дней');
  });

  test('the feed card still opens on the address field', async () => {
    serve({ subscriptions: [] });
    await renderTab();

    await act(async () => {
      screen.getByRole('button', { name: 'Указать ленту' }).click();
    });

    expect(document.querySelector('input[name="canonicalUrl"]')).toBeTruthy();
    expect(document.querySelector('input[name="query"]')).toBeNull();
  });

  test('saving a topic sends the kind and the topic, and no address at all', async () => {
    serve({ subscriptions: [] });
    await renderTab();
    await act(async () => {
      screen.getByRole('button', { name: 'Указать тему' }).click();
    });

    await typeInto('displayName', 'Регулирование ИИ');
    await typeInto('query', 'Регулирование ИИ в Европе');
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click();
    });
    await act(async () => {});

    const created = calls.find(
      (call) =>
        call.method === 'POST' &&
        call.url === '/content-intelligence/leads/subscriptions'
    );
    expect(created).toBeTruthy();
    expect(created.body.kind).toBe('TOPIC');
    expect(created.body.query).toBe('Регулирование ИИ в Европе');
    expect(created.body).not.toHaveProperty('canonicalUrl');
  });
});

describe('a topic row in the list', () => {
  test('it reads as the topic, never as the topic:// key', async () => {
    serve({ subscriptions: [TOPIC_ROW] });
    await renderTab();

    expect(document.body.textContent).toContain('Регулирование ИИ в Европе');
    expect(document.body.textContent).not.toContain('topic://');
  });

  test('with topics off its check is disabled while a feed row stays live', async () => {
    serve({
      subscriptions: [TOPIC_ROW, FEED_ROW],
      feedCheck: true,
      topicCheck: false,
    });
    await renderTab();

    const buttons = screen.getAllByRole('button', { name: 'Проверить сейчас' });
    expect(buttons).toHaveLength(2);
    const [topicCheck, feedCheck] = buttons;
    expect(topicCheck.disabled).toBe(true);
    expect(feedCheck.disabled).toBe(false);
    // And the screen says why, rather than letting a person find out by
    // pressing: the same sentence the banner above the list carries.
    expect(document.body.textContent).toContain('Проверка тем выключена');
  });
});

/**
 * `content-factory-next-75xn.20` (F1). A check refused because web research is
 * switched off is configuration, not a broken feed, and the row says which.
 */
describe('a refusal the person can act on', () => {
  test('«поиск не настроен» is printed instead of the bare code', async () => {
    serve({
      subscriptions: [
        {
          ...TOPIC_ROW,
          state: 'ERRORED',
          lastErrorCode: 'CONTENT_SEARCH_NOT_CONFIGURED',
          lastCheckedAt: new Date('2026-09-01T10:00:00.000Z').toISOString(),
        },
      ],
    });
    await renderTab();

    expect(document.body.textContent).toContain('поиск не настроен');
    expect(document.body.textContent).not.toContain('CONTENT_SEARCH_NOT_CONFIGURED');
  });

  test('a code nobody has a sentence for is still shown, rather than swallowed', async () => {
    serve({
      subscriptions: [
        {
          ...TOPIC_ROW,
          state: 'ERRORED',
          lastErrorCode: 'CHECK_FAILED',
          lastCheckedAt: new Date('2026-09-01T10:00:00.000Z').toISOString(),
        },
      ],
    });
    await renderTab();

    expect(document.body.textContent).toContain('CHECK_FAILED');
  });
});

/**
 * `content-factory-next-75xn.23` (F2). Creating a subscription runs its first
 * check, and for the minute after any check the door answers 429
 * `CHECK_TOO_SOON`. The walkthrough page told the owner to press «Проверить
 * сейчас» right after saving, so the first thing the product did was refuse
 * them. The button now holds itself back for that minute and says why: the
 * result they are waiting for is already in the list.
 */
describe('the minute after a check', () => {
  const checkedAt = (secondsAgo) =>
    new Date(Date.now() - secondsAgo * 1000).toISOString();

  test('a row checked a moment ago offers no button to be refused by', async () => {
    serve({ subscriptions: [{ ...TOPIC_ROW, lastCheckedAt: checkedAt(5) }] });
    await renderTab();

    const [check] = screen.getAllByRole('button', { name: 'Проверить сейчас' });
    expect(check.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      'Первая проверка уже сделана, результат в списке'
    );
  });

  test('once the minute is over the button is live again and says nothing', async () => {
    serve({ subscriptions: [{ ...TOPIC_ROW, lastCheckedAt: checkedAt(120) }] });
    await renderTab();

    const [check] = screen.getAllByRole('button', { name: 'Проверить сейчас' });
    expect(check.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('через минуту');
  });

  test('a row never checked is live, as it always was', async () => {
    serve({ subscriptions: [TOPIC_ROW] });
    await renderTab();

    const [check] = screen.getAllByRole('button', { name: 'Проверить сейчас' });
    expect(check.disabled).toBe(false);
  });
});

describe('saved story article links', () => {
  const article = 'https://cryptorank.io/news/feed/story';
  const other = 'https://reporter.example/story';
  const claimed = 'https://incrypted.com/story';
  const row = {
    id: 'lead-story',
    title: 'Сюжет',
    sourceUrl: article,
    status: 'NEW',
    excerpt: 'Текст',
    reasonRu: 'Объяснение',
    reasonEn: 'Reason',
    sourceRefsJson: {
      version: 1,
      sources: [article, other].map((url) => ({
        url,
        canonicalUrl: url,
        primaryStatus: 'UNKNOWN',
      })),
      attributions: [
        { fromUrl: article, targetUrl: claimed, state: 'CLAIMED_UNVERIFIED' },
      ],
      truncated: false,
    },
  };
  test('all links are semantic focusable links with visible unverified labels', async () => {
    serve({ subscriptions: [TOPIC_ROW], leadRows: [row] });
    await renderTab();
    for (const url of [article, other, claimed]) {
      const link = screen.getByRole('link', { name: url });
      expect(link.href).toBe(url);
      expect(link.tabIndex).toBe(0);
      expect(link.rel).toContain('noopener');
    }
    expect(document.body.textContent).toContain(
      'Перепечатка · первоисточник не подтверждён'
    );
    expect(document.body.textContent).toContain(
      'Ссылка, заявленная материалом'
    );
    expect(document.body.textContent).not.toContain(
      'Подтверждённый первоисточник'
    );
  });
  test('an explicitly saved verified source sorts first; claimed search links do not', async () => {
    serve({
      subscriptions: [TOPIC_ROW],
      leadRows: [
        {
          ...row,
          sourceRefsJson: {
            ...row.sourceRefsJson,
            sources: [
              row.sourceRefsJson.sources[0],
              {
                url: other,
                canonicalUrl: other,
                primaryStatus: 'VERIFIED_PRIMARY',
              },
            ],
          },
        },
      ],
    });
    await renderTab();
    const links = document
      .querySelector('[data-content-lead-row="lead-story"]')
      .querySelectorAll('a');
    expect(links[0].href).toBe(other);
    expect(document.body.textContent).toContain('Подтверждённый первоисточник');
  });
  test('unknown schema falls back to the historical source link; unsafe URLs are never clickable', async () => {
    serve({
      subscriptions: [TOPIC_ROW],
      leadRows: [{ ...row, sourceRefsJson: { version: 99 } }],
    });
    await renderTab();
    expect(screen.getByRole('link', { name: article })).toBeTruthy();
    expect(screen.queryByRole('link', { name: claimed })).toBeNull();
  });
  test('truncation is visible and duplicate attribution URLs appear once', async () => {
    serve({
      subscriptions: [TOPIC_ROW],
      leadRows: [
        {
          ...row,
          sourceRefsJson: {
            ...row.sourceRefsJson,
            truncated: true,
            attributions: [
              row.sourceRefsJson.attributions[0],
              {
                fromUrl: other,
                targetUrl: claimed,
                state: 'CLAIMED_UNVERIFIED',
              },
            ],
          },
        },
      ],
    });
    await renderTab();
    expect(screen.getAllByRole('link', { name: claimed })).toHaveLength(1);
    expect(document.body.textContent).toContain('ограничения объёма');
  });
});

test('saved source state labels follow the English UI locale',async()=>{
 const sourceUrl='https://reporter.example/english';serve({subscriptions:[TOPIC_ROW],leadRows:[{id:'english-lead',title:'Story',sourceUrl,status:'NEW',reasonEn:'Reason',sourceRefsJson:{version:1,sources:[{url:sourceUrl,canonicalUrl:sourceUrl,primaryStatus:'UNKNOWN'}],attributions:[],truncated:false}}]});await renderTab('en');expect(document.body.textContent).toContain('Found article · primary source unverified');expect(document.body.textContent).not.toContain('первоисточник не подтверждён');
});

const savedReprints = require('./fixtures/lead-story-provenance/saved-stories.json').items.filter(row => ['/leads/1','/leads/8'].includes(row.pointer));
test.each(['ru','en'])('both saved CryptoRank reprints are visibly identified in %s without attribution HTML', async language => {
  const leadRows = savedReprints.map((saved,index) => ({id:`saved-reprint-${index}`,title:saved.title,sourceUrl:saved.sourceUrl,publishedAt:saved.publishedAt,status:'NEW',reasonRu:'Материал по теме',reasonEn:'Article on the topic',sourceRefsJson:{version:1,sources:[{url:saved.sourceUrl,canonicalUrl:saved.sourceUrl,primaryStatus:'UNKNOWN'}],attributions:[],truncated:false}}));
  serve({subscriptions:[TOPIC_ROW],leadRows});await renderTab(language);
  const label=language==='ru'?'Перепечатка · первоисточник не подтверждён':'Reprint · primary source unverified';
  for(const row of leadRows){const card=document.querySelector(`[data-content-lead-row="${row.id}"]`);expect(card.textContent).toContain(label);expect(card.querySelectorAll('a')).toHaveLength(1);expect(card.querySelector('a').href).toBe(row.sourceUrl);}
});
test.each(['ru','en'])('legacy sourceUrl fallback identifies both saved CryptoRank reprints in %s', async language => {
  const leadRows=savedReprints.map((saved,index)=>({id:`legacy-reprint-${index}`,title:saved.title,sourceUrl:saved.sourceUrl,status:'NEW',sourceRefsJson:null}));serve({subscriptions:[TOPIC_ROW],leadRows});await renderTab(language);
  const label=language==='ru'?'Перепечатка · первоисточник не подтверждён':'Reprint · primary source unverified';for(const row of leadRows)expect(document.querySelector(`[data-content-lead-row="${row.id}"]`).textContent).toContain(label);
});
