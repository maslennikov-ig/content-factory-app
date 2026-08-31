const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

/**
 * `ChannelMark` sat at the centre of a shipped regression: it was used as a
 * provider label, and `linkedin`, `linkedin-page` and `listmonk` all rendered
 * as `LI`. The screen-level fence in `desert-lab-screen-review.test.cjs` can
 * only read source text, so the primitive's own behaviour is rendered here.
 */
const { ChannelMark } = loadTypeScriptModule(
  'apps/frontend/src/components/ui/brand/channel-mark.tsx'
);

const render = (props) =>
  renderToStaticMarkup(React.createElement(ChannelMark, props));

const text = (markup) => markup.replace(/<[^>]*>/g, '');

const fontSize = (markup) =>
  Number(markup.match(/font-size:\s*([\d.]+)px/)?.[1]);

describe('ChannelMark', () => {
  test('reads the channel name, so one provider can hold many channels', () => {
    const first = render({ name: 'Content Factory' });
    const second = render({ name: 'Cooking Diary' });

    expect(text(first)).toBe('CF');
    expect(text(second)).toBe('CD');
    expect(first).not.toBe(second);
  });

  test('takes two letters from a single-word name rather than one', () => {
    expect(text(render({ name: 'Telegram' }))).toBe('TE');
  });

  test('never renders an empty card', () => {
    expect(text(render({ name: '   ' }))).toBe('—');
    expect(text(render({ name: '!!!' }))).toBe('—');
  });

  test('keeps the 13px on 32px proportion where there is room for it', () => {
    expect(fontSize(render({ name: 'Telegram', size: 32 }))).toBe(13);
    expect(fontSize(render({ name: 'Telegram', size: 64 }))).toBe(26);
  });

  test.each([14, 16, 20, 24])(
    'never renders type below 10px at size %s',
    (size) => {
      expect(fontSize(render({ name: 'Telegram', size }))).toBeGreaterThanOrEqual(
        10
      );
    }
  );

  test('is hidden from assistive technology when a name is written beside it', () => {
    const markup = render({ name: 'Content Factory' });

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('aria-label');
  });

  test('announces the channel when it stands alone', () => {
    const markup = render({ name: 'Content Factory', decorative: false });

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Content Factory"');
    expect(markup).not.toContain('aria-hidden');
  });

  test('spends colour on the primary channel and on nothing else', () => {
    const primary = render({ name: 'Content Factory', primary: true });
    const ordinary = render({ name: 'Content Factory' });

    expect(primary).toContain('var(--cf-signature)');
    expect(ordinary).not.toContain('var(--cf-signature)');
    expect(ordinary).toContain('var(--cf-border-control)');
  });
});
