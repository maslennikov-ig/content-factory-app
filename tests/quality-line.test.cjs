'use strict';

/**
 * Строка качества: одна строка под текстом, в трёх местах одна и та же.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`). До него
 * четыре проверки жили четырьмя поверхностями — вердикт штампов на странице
 * заготовки, кнопка «Проверить на штампы» под адаптацией, лента голоса в окне
 * поста и записка про своё число, — и человек читал их как четыре разных
 * мнения о своём тексте.
 *
 * Проверяется здесь то, что легче всего сделать неправильно и что переживёт
 * любую правку вида:
 *
 *  - чистый текст не получает НИЧЕГО. Ни строки, ни галочки, ни «находок
 *    нет»: подтверждение того, что всё в порядке, приучает пролистывать ту
 *    единственную строку, которая сообщает;
 *  - каждый отрезок называется словом и раскрывается по нажатию, а не
 *    разворачивается сам;
 *  - «Не похоже на вас» — только `FAR`. `CLOSE` — «всё в порядке», `UNKNOWN` —
 *    «сказать нечем», и обе строки заняли бы место, ничего не сообщив;
 *  - код молчания (`TOO_SHORT`, `UNCALIBRATED` и прочие) человеку не
 *    печатается: это «WEB» в шапке окна поста другими буквами;
 *  - в окне поста ниже ста двадцати знаков не спрашивается ничего, обе двери
 *    зовутся по разу и только после того, как печать утихла.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const fs = require('node:fs');
const path = require('node:path');
const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

/** Исходник без комментариев: файл вправе объяснять себя свободно. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const LINE_FILE =
  'apps/frontend/src/components/content-intelligence/shared/quality-line.tsx';
const WINDOW_FILE =
  'apps/frontend/src/components/new-launch/draft-quality.line.tsx';

const { QualityLine, OWN_NUMBERS_GAP } = loadTypeScriptModule(LINE_FILE);
const { DraftQualityLine } = loadTypeScriptModule(WINDOW_FILE);

const h = React.createElement;

const line = () => document.querySelector('[data-quality-line]');
const segment = (name) =>
  document.querySelector(`[data-quality-segment="${name}"]`);

const draw = (props) =>
  render(h(QualityLine, { locale: 'ru', ...props }));

const slopWith = (...findings) => ({
  version: 'slop-check/1.0.0',
  verdict: findings.length > 3 ? 'rewrite' : findings.length ? 'review' : 'clean',
  findings: findings.map((excerpt, index) => ({
    ruleId: `rule-${index}`,
    severity: 'warn',
    start: index * 10,
    end: index * 10 + excerpt.length,
    excerpt,
    hint: { ru: `Так пишет модель: ${excerpt}`, en: `Model phrasing: ${excerpt}` },
  })),
});

const antiCopyWith = (...runs) => ({
  minWords: 8,
  retried: false,
  clean: runs.length === 0,
  runs: runs.map((text, index) => ({
    text,
    start: index * 20,
    end: index * 20 + text.length,
  })),
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* -------------------------------------------------------------------------
 * 1. Молчание — обычный исход
 * ---------------------------------------------------------------------- */

describe('чистому тексту строка не говорит ничего', () => {
  test('все четыре проверки чисты — узла нет вовсе', () => {
    draw({
      slop: slopWith(),
      antiCopy: antiCopyWith(),
      voice: { verdict: 'CLOSE' },
      draftGaps: [],
    });

    expect(line()).toBeNull();
    // И ни одного слова о том, что проверка прошла.
    expect(document.body.textContent).toBe('');
  });

  test('проверок нет вовсе — тоже ничего', () => {
    draw({});
    expect(line()).toBeNull();
  });

  test('«не похоже» не говорится ни при CLOSE, ни при UNKNOWN', () => {
    for (const verdict of ['CLOSE', 'UNKNOWN']) {
      draw({ voice: { verdict, reason: 'TOO_SHORT' } });
      expect(line()).toBeNull();
      cleanup();
    }
  });
});

/* -------------------------------------------------------------------------
 * 2. Каждый отрезок — своё слово
 * ---------------------------------------------------------------------- */

describe('строка называет только то, на что стоит взглянуть', () => {
  test('штампы: число находок, и оно приходит из отчёта', () => {
    draw({ slop: slopWith('в современном мире', 'не секрет, что') });

    expect(segment('slop').textContent).toBe('Штампов: 2');
    expect(segment('anti-copy')).toBeNull();
    expect(segment('voice')).toBeNull();
    expect(segment('gaps')).toBeNull();
  });

  test('чужие фразы: считаются отрезки, а не сам факт совпадения', () => {
    draw({ antiCopy: antiCopyWith('слово в слово из источника') });

    expect(segment('anti-copy').textContent).toBe('Чужих фраз: 1');
  });

  test('чистый отчёт о чужих фразах отрезка не даёт', () => {
    draw({ antiCopy: antiCopyWith() });
    expect(line()).toBeNull();
  });

  test('голос: только FAR, и словами, а не кодом', () => {
    draw({ voice: { verdict: 'FAR' } });

    expect(segment('voice').textContent).toBe('Не похоже на вас');
  });

  test('своих чисел нет — то же, что говорит сервер в draftGaps', () => {
    draw({ draftGaps: OWN_NUMBERS_GAP });

    expect(segment('gaps').textContent).toBe('Своих чисел нет');
  });

  test('чужой пробел своим числом не притворяется', () => {
    draw({ draftGaps: [{ metric: 'somethingElse' }] });
    expect(line()).toBeNull();
  });

  test('четыре отрезка стоят в одной строке через точку', () => {
    draw({
      slop: slopWith('в современном мире'),
      antiCopy: antiCopyWith('слово в слово'),
      voice: { verdict: 'FAR' },
      draftGaps: OWN_NUMBERS_GAP,
    });

    const text = line().textContent;
    expect(text).toContain('Штампов: 1');
    expect(text).toContain('Чужих фраз: 1');
    expect(text).toContain('Не похоже на вас');
    expect(text).toContain('Своих чисел нет');
    expect(text.split('·').length).toBe(4);
  });

  test('по-английски слова те же, а не транслитерация', () => {
    draw({
      locale: 'en',
      slop: slopWith('in today’s world'),
      antiCopy: antiCopyWith('word for word'),
      voice: { verdict: 'FAR' },
      draftGaps: OWN_NUMBERS_GAP,
    });

    expect(segment('slop').textContent).toBe('Clichés: 1');
    expect(segment('anti-copy').textContent).toBe('Copied runs: 1');
    expect(segment('voice').textContent).toBe("Doesn't sound like you");
    expect(segment('gaps').textContent).toBe('None of your numbers');
  });
});

/* -------------------------------------------------------------------------
 * 3. Находки раскрываются по нажатию, а не сами
 * ---------------------------------------------------------------------- */

describe('находки открывает человек', () => {
  test('до нажатия находок нет, после — есть, и это одна и та же кнопка', () => {
    draw({ slop: slopWith('в современном мире', 'не секрет, что') });

    expect(document.querySelector('[data-slop-finding]')).toBeNull();

    const button = segment('slop');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      fireEvent.click(button);
    });

    expect(segment('slop').getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[data-slop-finding]').length).toBe(2);
    expect(document.body.textContent).toContain('«в современном мире»');
    // Подсказка приходит с сервера на двух языках; печатается нужная.
    expect(document.body.textContent).toContain(
      'Так пишет модель: в современном мире'
    );

    act(() => {
      fireEvent.click(segment('slop'));
    });
    expect(document.querySelector('[data-slop-finding]')).toBeNull();
  });

  test('открыт всегда один отрезок: второй закрывает первый', () => {
    draw({
      slop: slopWith('в современном мире'),
      antiCopy: antiCopyWith('слово в слово из источника'),
    });

    act(() => {
      fireEvent.click(segment('slop'));
    });
    expect(document.querySelectorAll('[data-slop-finding]').length).toBe(1);

    act(() => {
      fireEvent.click(segment('anti-copy'));
    });
    expect(document.querySelector('[data-slop-finding]')).toBeNull();
    expect(
      document.querySelectorAll('[data-anti-copy-run]').length
    ).toBe(1);
    expect(document.body.textContent).toContain(
      'Эти отрезки повторяют исходный материал слово в слово.'
    );
  });

  test('раскрытие связано с кнопкой, а не просто лежит рядом', () => {
    draw({ draftGaps: OWN_NUMBERS_GAP });

    const button = segment('gaps');
    act(() => {
      fireEvent.click(button);
    });

    const controls = button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls)).not.toBeNull();
  });

  test('коду молчания раскрывать нечего, и кнопкой он не притворяется', () => {
    draw({ voice: { verdict: 'FAR', reason: 'UNCALIBRATED' } });

    const node = segment('voice');
    expect(node.tagName).toBe('SPAN');
    expect(document.body.textContent).not.toContain('UNCALIBRATED');
  });

  test('фраза сервера раскрывается, потому что она для человека', () => {
    draw({
      voice: {
        verdict: 'FAR',
        reason: 'Длинные периоды и ни одного своего примера.',
      },
    });

    const button = segment('voice');
    expect(button.tagName).toBe('BUTTON');
    act(() => {
      fireEvent.click(button);
    });
    expect(document.body.textContent).toContain(
      'Длинные периоды и ни одного своего примера.'
    );
  });
});

/* -------------------------------------------------------------------------
 * 4. Окно поста: две бесплатные двери, по разу и после тишины
 * ---------------------------------------------------------------------- */

describe('строка качества под редактором окна поста', () => {
  const SLOP_URL = '/content-intelligence/text-quality/slop-check';
  const VOICE_URL = '/content-intelligence/voice/text-check';

  const LONG = 'Мы посчитали выручку по когортам и получили ровно то, чего не ждали: вторая когорта держится дольше первой на девять недель подряд.';
  const SHORT = 'Коротко и всё.';

  let calls = [];

  const serve = ({ verdict = 'CLOSE', findings = [] } = {}) => {
    calls = [];
    global.fetch = async (url, init = {}) => {
      calls.push({
        url,
        method: String(init.method || 'GET').toUpperCase(),
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      const body = url.endsWith('/slop-check')
        ? slopWith(...findings)
        : { similarity: { verdict }, summary: 'ignored' };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        clone() {
          return this;
        },
      };
    };
  };

  const mount = (props) =>
    render(
      h(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } },
        h(DraftQualityLine, {
          locale: 'ru',
          platform: 'telegram',
          debounceMs: 40,
          ...props,
        })
      )
    );

  /**
   * Прокрутить очередь, пока условие не выполнится.
   *
   * Запас нарочно велик: у набора настоящие таймеры, и под нагрузкой полного
   * прогона восьмидесяти тиков по пять миллисекунд хватает там, где сорока
   * уже не хватало.
   */
  const settle = async (until = () => true) => {
    for (let tick = 0; tick < 80; tick += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      if (until()) return;
    }
  };

  const urls = () => calls.map((call) => call.url);

  test('короткий черновик не спрашивает ничего и ничего не рисует', async () => {
    serve();
    mount({ text: SHORT });
    await settle(() => false);

    expect(calls).toHaveLength(0);
    expect(line()).toBeNull();
  });

  test('120 знаков поднимают обе двери — по разу и только после тишины', async () => {
    serve({ verdict: 'FAR', findings: ['в современном мире'] });
    const view = mount({ text: '' });
    expect(calls).toHaveLength(0);

    view.rerender(
      h(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } },
        h(DraftQualityLine, {
          locale: 'ru',
          platform: 'telegram',
          debounceMs: 40,
          text: LONG,
        })
      )
    );
    // Печать ещё не утихла: ни одна дверь не тронута.
    expect(calls).toHaveLength(0);

    await settle(() => calls.length >= 2);

    expect(urls().filter((url) => url === SLOP_URL)).toHaveLength(1);
    expect(urls().filter((url) => url === VOICE_URL)).toHaveLength(1);
    for (const call of calls) {
      expect(call.method).toBe('POST');
      expect(call.body.text).toBe(LONG);
    }
    // Площадка канала уходит в проверку штампов: пороги у неё свои.
    expect(calls.find((call) => call.url === SLOP_URL).body.platform).toBe(
      'telegram'
    );

    await settle(() => !!segment('voice'));
    expect(segment('voice').textContent).toBe('Не похоже на вас');
    expect(segment('slop').textContent).toBe('Штампов: 1');
  });

  test('CLOSE не рисует ничего, хотя двери отвечали', async () => {
    serve({ verdict: 'CLOSE', findings: [] });
    mount({ text: LONG, debounceMs: 0 });
    await settle(() => calls.length >= 2);
    await settle(() => false);

    expect(calls).toHaveLength(2);
    expect(line()).toBeNull();
  });

  test('отказ двери молчит: строка — не место для ошибки окна', async () => {
    calls = [];
    global.fetch = async (url) => {
      calls.push({ url });
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        clone() {
          return this;
        },
      };
    };

    mount({ text: LONG, debounceMs: 0 });
    await settle(() => calls.length >= 2);
    await settle(() => false);

    expect(line()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('платной правки предложения отсюда нет вовсе', () => {
    const source = code(WINDOW_FILE);
    // 07.09.2026 владелец снял платную правку. Дверь ушла вместе с лентой,
    // которая её звала; окно её не зовёт и знать о ней не должно.
    expect(source).not.toContain('text-check/repair');
    expect(source).not.toContain('VoiceRibbonContainer');
  });

  test('пороги названы числами в одном месте, а не разбросаны', () => {
    const source = code(WINDOW_FILE);
    expect(source).toContain('MIN_MEASURABLE_CHARS = 120');
    expect(source).toContain('DEFAULT_DEBOUNCE_MS = 800');
  });
});

/* -------------------------------------------------------------------------
 * 5. Строка ничего не запрещает
 * ---------------------------------------------------------------------- */

describe('строка советует и ничего не закрывает', () => {
  test('ни тревожного цвета, ни роли ошибки, ни выключенных кнопок', () => {
    const source = code(LINE_FILE);

    expect(source).not.toMatch(/role="alert"/);
    expect(source).not.toMatch(/bg-cf-danger|border-cf-danger|text-cf-danger/);
    expect(source).not.toContain('disabled');
    // Ни одного запроса: проверки приезжают вместе с текстом.
    expect(source).not.toContain('useFetch');
    expect(source).not.toContain('useSWR');
  });
});
