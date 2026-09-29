'use strict';

/**
 * Pictures in the agent composer (owner decision 28.09.2026, «агент видит
 * картинки»; `kcxz.25`, review W4-25 F2, F5). By default a picture is shown to
 * the AI: it goes inline, compressed by the library's compressor, with the key
 * this page keeps it under, and nothing is uploaded; the line under the files
 * says it is saved nowhere. Any role may show one. A role that may upload can
 * switch a picture to «в медиатеку» on its chip: then the line says who sees
 * it, it goes to the library before the message, and a retry after a refused
 * send hands the uploader the pictures already saved, so none is uploaded
 * twice.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/t1',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.FileReader = dom.window.FileReader;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const { ru, en } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy;
/** What went through the library's compressor on the way to the AI. */
const compressed = [];
const composer = loadWithMocks('apps/frontend/src/components/agents/agent.composer.tsx', {
  react: React,
  '@contentfactory/frontend/components/ui/allowance-hint': { AllowanceHint: () => null },
  '@contentfactory/frontend/components/media/library-image-compression': {
    compressLibraryImage: async (file) => {
      compressed.push(file.name);
      return file;
    },
  },
});
const held = new Map();
const cards = loadWithMocks('apps/frontend/src/components/agents/agent.cards.tsx', {
  react: React,
  './agent.media': { shownPicture: (key) => held.get(key) ?? null, pictureAvailable: (key) => held.get(key) ?? null },
});

afterEach(cleanup);

const picture = (name = 'кофейня.png') =>
  new dom.window.File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

const mount = async (props) => {
  const sent = [];
  await act(async () => {
    render(
      h(composer.AgentComposer, {
        busy: false,
        queued: false,
        onSubmit: (message) => sent.push(message),
        onStop: () => {},
        words: ru,
        ...props,
      })
    );
  });
  return sent;
};

const paste = async (files) => {
  await act(async () => {
    fireEvent.paste(document.querySelector('textarea'), { clipboardData: { files } });
  });
};

const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form'));
  });
};
const switchToLibrary = async (name = 'кофейня.png') => {
  await act(async () => {
    fireEvent.click(document.querySelector(`button[aria-label="${ru.composer.pictureRoute(name, false)}"]`));
  });
};

describe('pictures in the composer', () => {
  test('the words exist in both languages and say which path a picture takes', () => {
    expect(ru.composer.pictureViewNote).toMatch(/нигде её не сохранит/);
    expect(en.composer.pictureViewNote).toMatch(/saves it nowhere/);
    expect(ru.composer.mediaNote).toMatch(/медиатек/);
    expect(ru.composer.mediaNote).toMatch(/ИИ их не увидит/);
    expect(en.composer.mediaNote).toMatch(/media library/);
    expect(en.composer.mediaNote).toMatch(/does not see them/);
    expect(ru.composer.pictureRoute('a.png', true)).not.toBe(ru.composer.pictureRoute('a.png', false));
  });

  test('by default a picture is shown to the AI inline, with the key this page keeps it under', async () => {
    const uploads = [];
    compressed.length = 0;
    const sent = await mount({ uploadMedia: async (files) => (uploads.push(files), { media: [] }) });
    await paste([picture()]);
    expect(document.body.textContent).toContain(ru.composer.pictureViewChip);
    expect(document.body.textContent).toContain(ru.composer.pictureViewNote);
    expect(document.body.textContent).toContain(ru.composer.pictureViewNoteEditor);
    expect(document.body.textContent).not.toContain(ru.composer.mediaNote);
    await submit();
    // The picture is read into the message after the click (a file read).
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(uploads).toEqual([]);
    expect(compressed).toEqual(['кофейня.png']);
    const [part] = sent[0].files;
    expect(part).toMatchObject({ type: 'file', mediaType: 'image/png', filename: 'кофейня.png' });
    expect(part.url.startsWith('data:image/png;base64,')).toBe(true);
    // The page keeps the picture under the key the message names.
    const key = part.providerMetadata.contentFactory.pictureKey;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0].media).toBeUndefined();
  });

  test('a reader may show a picture; there is no switch to the library', async () => {
    const uploads = [];
    const sent = await mount({ mediaAllowed: false, uploadMedia: async (files) => (uploads.push(files), { media: [] }) });
    await paste([picture()]);
    expect(document.body.textContent).toContain(ru.composer.pictureViewChip);
    expect(document.body.textContent).toContain(ru.composer.pictureViewNote);
    expect(document.body.textContent).not.toContain(ru.composer.pictureViewNoteEditor);
    expect(document.querySelector(`button[aria-label="${ru.composer.pictureRoute('кофейня.png', false)}"]`)).toBeNull();
    await submit();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(uploads).toEqual([]);
    expect(sent[0].files[0].mediaType).toBe('image/png');
  });

  test('switched to the library, the line says who sees it, and a retry reuses what was saved', async () => {
    const seen = [];
    let refuse = true;
    const sent = await mount({
      uploadMedia: async (files, saved) => {
        seen.push(saved);
        if (!saved.has(files[0])) saved.set(files[0], { id: 'm1', name: files[0].name, type: 'image/png' });
        if (refuse) throw new Error('refused');
        return { media: [...saved.values()] };
      },
    });
    await paste([picture()]);
    await switchToLibrary();
    expect(document.body.textContent).toContain(ru.composer.mediaChip);
    expect(document.body.textContent).toContain(ru.composer.mediaNote);
    expect(document.body.textContent).not.toContain(ru.composer.pictureViewNote);
    await submit();
    expect(sent).toEqual([]);
    expect(document.body.textContent).toContain(ru.composer.mediaFailed);
    refuse = false;
    await submit();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(sent).toHaveLength(1);
    expect(sent[0].files).toEqual([]);
    expect(sent[0].media).toEqual({ media: [{ id: 'm1', name: 'кофейня.png', type: 'image/png' }] });
    // The next message starts afresh: shown by default, a new saved set.
    await paste([picture('b.png')]);
    await switchToLibrary('b.png');
    await submit();
    expect(seen[2]).not.toBe(seen[0]);
  });
});

describe('the «в медиатеку» card of a picture the agent was shown (media.keep)', () => {
  const KEY = '22222222-0000-4000-8000-000000000001';
  const question = { kind: 'keep-picture', text: 'Положить эту картинку в медиатеку?', pictureKey: KEY, cardId: 'c1' };
  const show = async (keepPicture) => {
    const answers = [];
    await act(async () => {
      render(
        h(cards.QuestionCard, {
          title: null,
          question,
          answered: false,
          busy: false,
          onAnswer: (data) => answers.push(data),
          keepPicture,
          words: ru,
        })
      );
    });
    return answers;
  };
  const press = async (text) => {
    const button = [...document.querySelectorAll('button')].find((one) => one.textContent.includes(text));
    await act(async () => {
      fireEvent.click(button);
    });
  };

  test('the page puts the picture it holds into the library and answers with its id', async () => {
    held.set(KEY, { name: 'кофейня.png' });
    const asked = [];
    const answers = await show(async (key) => (asked.push(key), { id: '11111111-0000-4000-8000-000000000001' }));
    expect(document.body.textContent).toContain(ru.question.keepPictureName('кофейня.png'));
    await press(ru.question.keepPicture);
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(asked).toEqual([KEY]);
    expect(answers).toEqual([{ kept: true, mediaId: '11111111-0000-4000-8000-000000000001' }]);
  });

  test('a refused upload stays on the card with its words, for another try', async () => {
    held.set(KEY, { name: 'кофейня.png' });
    const answers = await show(async () => {
      throw new Error('403');
    });
    await press(ru.question.keepPicture);
    await waitFor(() => expect(document.body.textContent).toContain(ru.question.keepPictureFailed));
    expect(answers).toEqual([]);
  });

  test('«Не надо» keeps nothing; a page that no longer holds the picture says so', async () => {
    held.set(KEY, { name: 'кофейня.png' });
    const declined = await show(async () => ({ id: 'x' }));
    await press(ru.question.keepPictureSkip);
    expect(declined).toEqual([{ kept: false }]);
    cleanup();
    held.clear();
    const gone = await show(async () => ({ id: 'x' }));
    expect(document.body.textContent).toContain(ru.question.keepPictureGone);
    await press(ru.question.keepPictureGoneAnswer);
    expect(gone).toEqual([{ kept: false, gone: true }]);
  });
});
