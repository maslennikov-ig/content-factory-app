const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { AgentMarkdown } = loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.markdown.tsx'
);
const draw = (text) => render(React.createElement(AgentMarkdown, { text }));
afterEach(cleanup);

test('renders a GFM table with aligned columns, inline math and escaped pipes', () => {
  const { container } = draw(
    String.raw`| Группа | Худший случай | Лучший случай |
| :--- | ---: | ---: |
| **A** | \(540/1000=54\%\) | \(640/1000=64\%\) |
| B \| контроль | CODE | [Источник](https://example.com) |`.replace(
      'CODE',
      '`a\\|b`'
    )
  );
  const table = container.querySelector('table');
  expect(table).not.toBeNull();
  expect(table.querySelectorAll('thead th')).toHaveLength(3);
  expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(table.querySelector('tbody td strong').textContent).toBe('A');
  expect(table.querySelectorAll('.katex')).toHaveLength(2);
  expect(table.querySelector('th:last-child').style.textAlign).toBe('right');
  expect(table.querySelectorAll('tbody tr')[1].firstChild.textContent).toBe(
    'B | контроль'
  );
  expect(table.querySelector('code').textContent).toBe('a|b');
});

test('uses Markdown nesting and leaves table-shaped fenced code literal', () => {
  const { container } = draw(
    '- **Внешний**\n  - Вложенный\n\n> **Цитата** с [источником](https://example.com)\n\n```md\n| a | b |\n|---|---|\n| 1 | 2 |\n```'
  );
  expect(container.querySelector('ul li ul li').textContent).toBe('Вложенный');
  expect(container.querySelector('blockquote strong').textContent).toBe(
    'Цитата'
  );
  expect(container.querySelector('pre code').textContent).toContain(
    '|---|---|'
  );
  expect(container.querySelector('table')).toBeNull();
});

test('a streamed table gains rows without duplicating its header', () => {
  const header = '| Группа | Доля |\n|---|---:|';
  const { container, rerender } = draw('| Группа | Доля |');
  expect(container.querySelector('table')).toBeNull();
  rerender(React.createElement(AgentMarkdown, { text: header }));
  expect(container.querySelectorAll('thead tr')).toHaveLength(1);
  rerender(
    React.createElement(AgentMarkdown, { text: header + '\n| A | 54% |' })
  );
  expect(container.querySelectorAll('table')).toHaveLength(1);
  expect(container.querySelectorAll('thead tr')).toHaveLength(1);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelector('tbody td:last-child').textContent).toBe(
    '54%'
  );
});

test('table cells cannot introduce active HTML, unsafe links or remote images', () => {
  const { container } = draw(
    '| Содержимое | Источник |\n|---|---|\n| <img src=x onerror=alert(1)> | [bad](javascript:alert(1)) |\n| ![Картинка](https://example.com/tracker.png) | [Почта](mailto:test@example.com) |'
  );
  expect(container.querySelector('table')).not.toBeNull();
  expect(container.querySelector('img, script, iframe')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(container.textContent).toContain('Картинка');
  expect(
    Array.from(container.querySelectorAll('a'), (a) => a.getAttribute('href'))
  ).toEqual(['mailto:test@example.com']);
});

test('renders the Sol answer’s inline and multiline formulas with accessible MathML', () => {
  const { container } =
    draw(String.raw`Доли: \(p_A(q)=0{,}54+0{,}10q\) и \(p_B(q)=0{,}42+0{,}40q\).

Границы без дополнительных предположений:
\[
\Delta(q)=-0{,}12+0{,}30q.
\]

Порог **40%**. [Источник](https://example.com)`);
  expect(container.querySelectorAll('.katex')).toHaveLength(3);
  expect(container.querySelectorAll('math')).toHaveLength(3);
  expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
  expect(container.querySelector('annotation').textContent).toBe(
    'p_A(q)=0{,}54+0{,}10q'
  );
  expect(container.querySelector('strong').textContent).toBe('40%');
  expect(container.querySelector('a').href).toBe('https://example.com/');
});

test('supports dollar delimiters without treating prices or code as mathematics', () => {
  const { container } = draw(
    'Цена $5 и $10. Формула $x^2$ и $$y=2$$.\n\n`\\(literal\\)`\n\n```tex\n\\[literal\\]\n$$literal$$\n```'
  );
  expect(container.querySelectorAll('.katex')).toHaveLength(2);
  expect(container.textContent).toContain('Цена $5 и $10.');
  expect(container.querySelector('code').textContent).toBe('\\(literal\\)');
  expect(container.querySelector('pre').textContent).toContain('$$literal$$');
});

test('currency ranges and escaped dollars stay literal beside valid TeX', () => {
  const { container } = draw(
    String.raw`Цена $5–$10 и \$20. Формулы: $x+1$, $$ x+2 $$ и \( x+3 \).`
  );
  expect(container.textContent).toContain('Цена $5–$10 и $20.');
  expect(
    Array.from(container.querySelectorAll('annotation'), (el) => el.textContent)
  ).toEqual(['x+1', 'x+2', 'x+3']);
});

test('a streamed incomplete formula stays readable and renders when completed', () => {
  const { container, rerender } = draw('Ответ:\n\n\\[\n\\frac{1}{2}');
  expect(container.querySelector('.katex')).toBeNull();
  expect(container.textContent).toContain('\\frac{1}{2}');
  rerender(
    React.createElement(AgentMarkdown, {
      text: 'Ответ:\n\n\\[\n\\frac{1}{2}\n\\]',
    })
  );
  expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
  expect(container.querySelector('annotation').textContent).toBe(
    '\\frac{1}{2}'
  );
  rerender(
    React.createElement(AgentMarkdown, {
      text: 'Ответ:\n\n\\[\n\\frac{1}{3}\n\\]',
    })
  );
  expect(container.querySelectorAll('.katex')).toHaveLength(1);
  expect(container.querySelector('annotation').textContent).toBe(
    '\\frac{1}{3}'
  );
});

test('invalid math remains text and TeX cannot create links, images or raw HTML', () => {
  const { container } = draw(
    String.raw`\(\frac{\) \(\href{javascript:alert(1)}{click}\) \(\includegraphics{https://example.com/tracker.png}\) <img src=x onerror=alert(1)>`
  );
  expect(container.querySelector('a, img, script, iframe')).toBeNull();
  expect(container.textContent).toContain('\\frac{');
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
});
