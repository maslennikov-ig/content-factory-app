'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const editorRoot = 'apps/frontend/src/components/media/image-editor';

test('pins the audited Fabric foundation exactly', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  expect(pkg.dependencies.fabric).toBe('7.4.0');
});

test('publishes the complete, library-neutral command surface', () => {
  const { EDITOR_COMMANDS } = loadTypeScriptModule(`${editorRoot}/types.ts`);
  expect(EDITOR_COMMANDS).toEqual([
    'crop',
    'resize',
    'rotate-90',
    'flip-horizontal',
    'flip-vertical',
    'add-text',
    'edit-text',
    'add-rectangle',
    'add-ellipse',
    'add-line',
    'draw-stroke',
    'select-layer',
    'move-layer',
    'delete-layer',
    'raise-layer',
    'lower-layer',
    'front-layer',
    'back-layer',
    'apply-preset',
    'undo',
    'redo',
  ]);
});

describe('editor bounds and local presets', () => {
  const bounds = () => loadTypeScriptModule(`${editorRoot}/bounds.ts`);

  test('accepts only PNG, JPEG and WebP sources within encoded/decoded limits', () => {
    const { validateSourceMetadata } = bounds();
    expect(
      validateSourceMetadata({
        type: 'image/png',
        bytes: 10 * 1024 * 1024,
        width: 4000,
        height: 4000,
      })
    ).toEqual({ width: 4000, height: 4000 });
    expect(() =>
      validateSourceMetadata({
        type: 'image/gif',
        bytes: 10,
        width: 10,
        height: 10,
      })
    ).toThrow(/PNG, JPEG, or WebP/);
    expect(() =>
      validateSourceMetadata({
        type: 'image/png',
        bytes: 10 * 1024 * 1024 + 1,
        width: 10,
        height: 10,
      })
    ).toThrow(/10 MiB/);
    expect(() =>
      validateSourceMetadata({
        type: 'image/png',
        bytes: 10,
        width: 5000,
        height: 5000,
      })
    ).toThrow(/20 megapixels/);
  });

  test('enforces output, layer, text, drawing and export limits', () => {
    const {
      validateCanvasSize,
      validateCropRect,
      validateLayerCount,
      validateText,
      validateDrawPoints,
      validateExportBlob,
    } = bounds();
    expect(validateCanvasSize(1080, 1920)).toEqual({
      width: 1080,
      height: 1920,
    });
    for (const invalid of [
      [63, 1080],
      [4097, 1080],
      [4096, 4096 + 1],
    ]) {
      expect(() => validateCanvasSize(...invalid)).toThrow();
    }
    expect(() => validateLayerCount(101)).toThrow(/100/);
    expect(() => validateText('я'.repeat(2001))).toThrow(/2,000/);
    expect(() => validateDrawPoints(50001)).toThrow(/50,000/);
    expect(
      validateCropRect(
        { x: 123, y: 45, width: 700, height: 900 },
        { width: 1080, height: 1350 }
      )
    ).toEqual({ x: 123, y: 45, width: 700, height: 900 });
    expect(() =>
      validateCropRect(
        { x: -1, y: 0, width: 700, height: 900 },
        { width: 1080, height: 1350 }
      )
    ).toThrow(/crop/i);
    expect(() =>
      validateCropRect(
        { x: 500, y: 0, width: 700, height: 900 },
        { width: 1080, height: 1350 }
      )
    ).toThrow(/bounds/i);
    expect(() =>
      validateExportBlob(
        { size: 0, type: 'image/png' },
        { width: 1080, height: 1080 }
      )
    ).toThrow(/empty/i);
    expect(() =>
      validateExportBlob(
        { size: 10, type: 'text/plain' },
        { width: 1080, height: 1080 }
      )
    ).toThrow(/PNG or JPEG/i);
    expect(() =>
      validateExportBlob(
        { size: 10 * 1024 * 1024 + 1, type: 'image/png' },
        { width: 1080, height: 1080 }
      )
    ).toThrow(/10 MiB/);
    expect(() =>
      validateExportBlob(
        { size: 10, type: 'image/png' },
        { width: 63, height: 1080 }
      )
    ).toThrow(/64/);
  });

  test('ships the five exact social presets without remote templates', () => {
    const { SOCIAL_PRESETS, validateCanvasSize } = bounds();
    expect(SOCIAL_PRESETS).toEqual({
      square: { width: 1080, height: 1080 },
      portrait: { width: 1080, height: 1350 },
      story: { width: 1080, height: 1920 },
      landscape: { width: 1200, height: 630 },
      telegram: { width: 1280, height: 720 },
    });
    // A preset the canvas would refuse is worse than a missing one: the button
    // is there, and pressing it throws.
    for (const size of Object.values(SOCIAL_PRESETS)) {
      expect(validateCanvasSize(size.width, size.height)).toEqual(size);
    }
  });

  test('decodes the exported raster and rejects dimensions that differ from the canvas', async () => {
    const { validateExportRaster } = bounds();
    const previous = global.createImageBitmap;
    const close = jest.fn();
    global.createImageBitmap = jest.fn(async () => ({
      width: 1080,
      height: 1079,
      close,
    }));
    try {
      await expect(
        validateExportRaster(new Blob(['png'], { type: 'image/png' }), {
          width: 1080,
          height: 1080,
        })
      ).rejects.toThrow(/dimensions/i);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      global.createImageBitmap = previous;
    }
  });

  test('fails closed when the runtime cannot decode export dimensions', async () => {
    const { validateExportRaster } = bounds();
    const previousBitmap = global.createImageBitmap;
    const previousImage = global.Image;
    global.createImageBitmap = undefined;
    global.Image = undefined;
    try {
      await expect(
        validateExportRaster(new Blob(['png'], { type: 'image/png' }), {
          width: 1080,
          height: 1080,
        })
      ).rejects.toThrow(/could not be validated/i);
    } finally {
      global.createImageBitmap = previousBitmap;
      global.Image = previousImage;
    }
  });
});

describe('bounded editor history', () => {
  test('keeps at most 50 immutable scene snapshots and supports undo/redo', () => {
    const { EditorHistory } = loadTypeScriptModule(
      `${editorRoot}/editor-session.ts`
    );
    const initial = { width: 100, height: 100, objects: [] };
    const history = new EditorHistory(initial);
    for (let width = 101; width <= 170; width += 1)
      history.push({ ...initial, width });
    expect(history.length).toBe(50);
    expect(history.undo().width).toBe(169);
    expect(history.redo().width).toBe(170);
    expect(initial.width).toBe(100);
  });

  test('coalesces one pointer or text gesture into one history entry', () => {
    const { EditorHistory } = loadTypeScriptModule(
      `${editorRoot}/editor-session.ts`
    );
    const history = new EditorHistory({ value: 0 });
    history.push({ value: 1 }, 'drag:layer-1');
    history.push({ value: 2 }, 'drag:layer-1');
    history.push({ value: 3 }, 'text:layer-2');
    history.push({ value: 4 }, 'text:layer-2');
    expect(history.length).toBe(3);
    expect(history.undo()).toEqual({ value: 2 });
  });

  test('keeps every completed freehand stroke as a separate undo step', () => {
    const { EditorHistory } = loadTypeScriptModule(
      `${editorRoot}/editor-session.ts`
    );
    const history = new EditorHistory({ strokes: [] });
    history.push({ strokes: ['one'] }, 'draw:1');
    history.push({ strokes: ['one', 'two'] }, 'draw:2');
    expect(history.undo()).toEqual({ strokes: ['one'] });
  });

  test('exposes the current scene revision and restores it through undo and redo', () => {
    const { EditorHistory } = loadTypeScriptModule(
      `${editorRoot}/editor-session.ts`
    );
    const history = new EditorHistory({ value: 0 });
    expect(history.revision).toBe(0);
    history.push({ value: 1 });
    const changed = history.revision;
    expect(changed).toBeGreaterThan(0);
    history.undo();
    expect(history.revision).toBe(0);
    history.redo();
    expect(history.revision).toBe(changed);
  });
});

describe('edited media upload and completion', () => {
  test('posts one FormData file to the same-origin simple endpoint and validates the result', async () => {
    const { uploadEditedMedia } = loadTypeScriptModule(
      `${editorRoot}/upload-edited-media.ts`
    );
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push([url, options]);
      return {
        ok: true,
        json: async () => ({
          id: 'new-media',
          name: 'edit.png',
          originalName: 'edit.png',
          path: '/uploads/edit.png',
          thumbnail: null,
          alt: null,
        }),
      };
    };
    const blob = new Blob(['png'], { type: 'image/png' });
    const result = await uploadEditedMedia(fetcher, blob, 'edited-source.png');
    expect(result).toMatchObject({
      id: 'new-media',
      path: '/uploads/edit.png',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/media/upload-simple');
    expect(calls[0][1].method).toBe('POST');
    expect(calls[0][1].body).toBeInstanceOf(FormData);
    expect(calls[0][1].body.get('file')).toBeInstanceOf(Blob);
  });

  test.each([
    [{ ok: false, status: 413, json: async () => ({}) }, /upload/i],
    [
      { ok: true, json: async () => ({ id: '', path: '/partial' }) },
      /response/i,
    ],
    [
      { ok: true, json: async () => ({ id: 'partial', path: '' }) },
      /response/i,
    ],
  ])(
    'rejects failed or partial upload responses',
    async (response, expected) => {
      const { uploadEditedMedia } = loadTypeScriptModule(
        `${editorRoot}/upload-edited-media.ts`
      );
      await expect(
        uploadEditedMedia(
          async () => response,
          new Blob(['x'], { type: 'image/png' }),
          'x.png'
        )
      ).rejects.toThrow(expected);
    }
  );

  test('standalone refreshes only while picker refreshes and selects the new item once', async () => {
    const { completeEditedMedia, completeMediaBoxEditorSave } =
      loadTypeScriptModule(`${editorRoot}/media-completion.ts`);
    const old = { id: 'old', path: '/old.png' };
    const edited = { id: 'edited', path: '/edited.png' };
    expect(
      completeEditedMedia({
        standalone: true,
        selected: [old],
        uploaded: edited,
      })
    ).toEqual({ selected: [old], shouldSelect: false });
    expect(
      completeEditedMedia({
        standalone: false,
        selected: [old, edited],
        uploaded: edited,
      })
    ).toEqual({ selected: [old, edited], shouldSelect: true });
    const events = [];
    const selected = [];
    await expect(
      completeMediaBoxEditorSave({
        standalone: false,
        uploaded: edited,
        mutate: async () => {
          events.push('mutate');
        },
        select: (item) => {
          events.push('select');
          selected.push(item);
        },
        close: () => events.push('close'),
        onRefreshError: () => events.push('warn'),
      })
    ).resolves.toEqual({ refreshed: true });
    expect(events).toEqual(['select', 'close', 'mutate']);
    expect(selected).toEqual([edited]);
  });

  test('an edited attachment replaces the one the post carried, in place', () => {
    const { replaceEditedAttachment } = loadTypeScriptModule(
      `${editorRoot}/media-completion.ts`
    );
    const attachments = [
      { id: 'a', path: '/a.png', alt: 'Left' },
      { id: 'b', path: '/b.png', alt: 'Middle' },
      { id: 'c', path: '/c.png', alt: 'Right' },
    ];
    const uploaded = { id: 'edited', path: '/edited.png' };

    // Same length, same order, same neighbours: appending would leave the
    // pre-edit picture in the post, which is the mistake this feature fixes.
    expect(
      replaceEditedAttachment({ attachments, index: 1, uploaded })
    ).toEqual([
      { id: 'a', path: '/a.png', alt: 'Left' },
      { id: 'edited', path: '/edited.png', alt: 'Middle' },
      { id: 'c', path: '/c.png', alt: 'Right' },
    ]);
    // Alt text describes what the picture shows, and cropping it does not make
    // the description wrong. Dropping it would charge a re-write per edit.
    expect(
      replaceEditedAttachment({ attachments, index: 1, uploaded })[1].alt
    ).toBe('Middle');
    expect(attachments[1]).toEqual({ id: 'b', path: '/b.png', alt: 'Middle' });

    // A slot removed while the editor was open must not silently write over a
    // neighbour or append a stray picture.
    for (const index of [-1, 3, 1.5, Number.NaN]) {
      expect(() =>
        replaceEditedAttachment({ attachments, index, uploaded })
      ).toThrow('The edited attachment is no longer in the draft.');
    }
  });

  test('keeps a successful upload selected and closed when the library refresh rejects', async () => {
    const { completeMediaBoxEditorSave } = loadTypeScriptModule(
      `${editorRoot}/media-completion.ts`
    );
    const select = jest.fn();
    const close = jest.fn();
    const warn = jest.fn();
    await expect(
      completeMediaBoxEditorSave({
        standalone: false,
        uploaded: { id: 'edited', path: '/edited.png' },
        mutate: async () => {
          throw new Error('refresh rejected');
        },
        select,
        close,
        onRefreshError: warn,
      })
    ).resolves.toEqual({ refreshed: false });
    expect(select).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('exact source loading boundary', () => {
  test('accepts only a readable image response for the exact requested URL', () => {
    const { validateSourceResponse } = loadTypeScriptModule(
      `${editorRoot}/source-loader.ts`
    );
    expect(
      validateSourceResponse(
        '/media/source.png',
        {
          ok: true,
          redirected: false,
          type: 'basic',
          url: 'http://localhost/media/source.png',
          headers: { get: () => 'image/png' },
        },
        'http://localhost/library'
      )
    ).toBe('image/png');
    expect(() =>
      validateSourceResponse(
        '/media/source.png',
        {
          ok: true,
          redirected: true,
          type: 'basic',
          url: 'http://cdn.invalid/source.png',
          headers: { get: () => 'image/png' },
        },
        'http://localhost/library'
      )
    ).toThrow(/redirect/i);
    expect(() =>
      validateSourceResponse(
        '/media/source.png',
        {
          ok: true,
          redirected: false,
          type: 'opaque',
          url: '',
          headers: { get: () => null },
        },
        'http://localhost/library'
      )
    ).toThrow(/readable/i);
    expect(() =>
      validateSourceResponse(
        '/media/source.png',
        {
          ok: true,
          redirected: false,
          type: 'basic',
          url: 'http://localhost/media/source.png',
          headers: { get: () => 'text/html' },
        },
        'http://localhost/library'
      )
    ).toThrow(/image/i);
  });
});
