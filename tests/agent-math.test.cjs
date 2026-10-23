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
