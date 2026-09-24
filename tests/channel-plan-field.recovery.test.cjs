'use strict';
/**
 * The channel «План» field after a refused «Ко всем N» (second review, item 1).
 *
 * The server answers 409 when the channel mode changed between the question
 * and the answer. The field used to keep showing the mode that was just
 * refused, because the local choice outlived the refusal; it must show what
 * the server holds now.
 */
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/channels' });
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;

let server;
let calls;
const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });
const request = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
  return server(url, options.method || 'GET');
};

const { useChannelPlanField } = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/intake/channel-plan.field.tsx',
  {
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    swr: {
      __esModule: true,
      default: (key, load) => {
        const [data, setData] = React.useState(undefined);
        const reload = React.useCallback(
          () => load().then((next) => (setData(next), next)),
          [load]
        );
        React.useEffect(() => {
          if (key) void reload();
        }, [key]);
        return {
          data,
          mutate: (next, options) => {
            if (next !== undefined && options?.revalidate === false) {
              setData(next);
              return Promise.resolve(next);
            }
            return reload();
          },
        };
      },
    },
  }
);

const Field = () => {
  const field = useChannelPlanField({ integrationId: 'tg', locale: 'ru', canWrite: true });
  return h(
    'div',
    null,
    h(
      'select',
      {
        'aria-label': 'План',
        value: field.value,
        disabled: field.disabled,
        onChange: (event) => field.onChange(event.target.value),
      },
      ['draft', 'reserve', 'autopilot'].map((mode) => h('option', { key: mode, value: mode }, mode))
    ),
    field.slot
  );
};

afterEach(cleanup);

test('a 409 on «Ко всем N» drops the refused choice and shows the mode the server holds', async () => {
  calls = [];
  let held = 'reserve';
  server = (url, method) => {
    if (url === '/integrations/tg/plan-mode' && method === 'GET') return answer(200, { planMode: held });
    if (url === '/integrations/tg/plan-mode' && method === 'PUT') return answer(200, { planMode: 'autopilot' });
    if (url.includes('/plan-impact')) return answer(200, { count: 3 });
    // Meanwhile somebody else set the channel to «Без плана».
    if (url.includes('/plan-apply')) {
      held = 'draft';
      return answer(409, { code: 'CHANNEL_PLAN_MODE_CHANGED' });
    }
    return answer(404, {});
  };
  render(h(Field));
  const select = screen.getByLabelText('План');
  await act(async () => {});
  expect(select.value).toBe('reserve');

  await act(async () => {
    fireEvent.change(select, { target: { value: 'autopilot' } });
  });
  await screen.findByText('Ко всем 3', { exact: false });
  expect(select.value).toBe('autopilot');

  await act(async () => {
    fireEvent.click(document.querySelector('[data-channel-plan-apply-choice="all"]'));
  });
  await act(async () => {});
  const apply = calls.find((call) => call.url.includes('/plan-apply'));
  expect(apply.body).toEqual({ planMode: 'autopilot' });
  // The refused «autopilot» is gone; the field reads the server again.
  expect(screen.getByLabelText('План').value).toBe('draft');
  expect(screen.getByRole('alert').textContent).toContain('Режим канала уже сменился');
  expect(calls.filter((call) => call.url === '/integrations/tg/plan-mode' && call.method === 'GET')).toHaveLength(2);
  expect(screen.getByLabelText('План').disabled).toBe(false);
});

test('«Ко всем N» does not count a draft without a plan as changing to «Без плана» (second review, item 5)', () => {
  const { planWouldChange } = loadWithMocks(
    'libraries/nestjs-libraries/src/content-intelligence/pieces/post-settings.ts'
  );
  expect(planWouldChange({ plan: null, state: 'DRAFT' }, 'draft')).toBe(false);
  expect(planWouldChange({ plan: undefined, state: 'DRAFT' }, 'draft')).toBe(false);
  expect(planWouldChange({ plan: null, state: 'DRAFT' }, 'reserve')).toBe(true);
  expect(planWouldChange({ plan: 'reserve', state: 'DRAFT' }, 'draft')).toBe(true);
  expect(planWouldChange({ plan: 'draft', state: 'DRAFT' }, 'draft')).toBe(false);
});

describe('the «Применить к N» question says what happens to the posts (97dq.87)', () => {
  const ask = async (from, to) => {
    let held = from;
    server = (url, method) => {
      if (url === '/integrations/tg/plan-mode' && method === 'GET') return answer(200, { planMode: held });
      if (url === '/integrations/tg/plan-mode' && method === 'PUT') {
        held = to;
        return answer(200, { planMode: to });
      }
      if (url.includes('/plan-impact')) return answer(200, { count: 2 });
      return answer(404, {});
    };
    calls = [];
    render(h(Field));
    await act(async () => {});
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: to } });
    });
    await screen.findByText('Ко всем 2', { exact: false });
    const effect = document.querySelector('[data-channel-plan-apply-effect]');
    expect(effect.getAttribute('data-channel-plan-apply-effect')).toBe(to);
    return effect.textContent;
  };

  test('autopilot → reserve: the posts leave the queue and wait for «Подтвердить»', async () => {
    const text = await ask('autopilot', 'reserve');
    expect(text).toContain('уйдут из очереди');
    expect(text).toContain('«Подтвердить»');
    // Confirmed queue entries are not in the count and stay queued (review F6).
    expect(text).toContain('кроме подтверждённых вами');
    expect(text).toContain('«Только к новым»: написанные посты останутся как есть');
  });

  test('reserve → autopilot: the posts enter the queue and go out by themselves', async () => {
    const text = await ask('reserve', 'autopilot');
    expect(text).toContain('встанут в очередь и выйдут сами');
    // A post the platform refuses does not join the queue (review F6).
    expect(text).toContain('если площадка их примет');
  });

  test('reserve → off: the reservation drops, drafts stay', async () => {
    const text = await ask('reserve', 'draft');
    expect(text).toContain('бронь снимется, посты останутся черновиками');
  });

  test('the question keeps its «?» and both languages carry every direction', () => {
    const { channelPlanModeCopy } = loadWithMocks(
      'apps/frontend/src/components/content-intelligence/intake/channel-plan-mode.tsx'
    );
    for (const locale of ['ru', 'en']) {
      const t = channelPlanModeCopy[locale];
      expect(t.applyQuestion(3).endsWith('?')).toBe(true);
      expect(typeof t.applyKeep).toBe('string');
      const lines = new Set();
      for (const [to, from] of [
        ['autopilot', 'reserve'],
        ['reserve', 'autopilot'],
        ['reserve', 'draft'],
        ['draft', 'reserve'],
      ]) {
        lines.add(t.applyEffect(to, from));
      }
      expect(lines.size).toBe(4);
    }
  });
});
