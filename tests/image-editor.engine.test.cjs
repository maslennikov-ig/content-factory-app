'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

class FakeObject {
  constructor(props = {}) {
    Object.assign(
      this,
      {
        type: 'object',
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        flipX: false,
        flipY: false,
      },
      props
    );
  }
  set(key, value) {
    if (typeof key === 'string') this[key] = value;
    else Object.assign(this, key);
    return this;
  }
  rotate(value) {
    this.angle = value;
    return this;
  }
}
FakeObject.customProperties = [];
class FabricImage extends FakeObject {
  constructor(source, props) {
    super({
      type: 'image',
      sourceWidth: source.naturalWidth,
      sourceHeight: source.naturalHeight,
      ...props,
    });
  }
}
class IText extends FakeObject {
  constructor(text, props) {
    super({ type: 'i-text', text, ...props });
  }
}
class Rect extends FakeObject {
  constructor(props) {
    super({ type: 'rect', ...props });
  }
}
class Ellipse extends FakeObject {
  constructor(props) {
    super({ type: 'ellipse', ...props });
  }
}
class Line extends FakeObject {
  constructor(points, props) {
    super({ type: 'line', points, ...props });
  }
}
class PencilBrush {
  constructor(canvas) {
    this.canvas = canvas;
  }
}

class Canvas {
  static last;
  constructor(_host, options) {
    this.width = options.width;
    this.height = options.height;
    this.objects = [];
    this.handlers = new Map();
    this.active = null;
    this.loadCalls = 0;
    Canvas.last = this;
  }
  add(object) {
    this.objects.push(object);
    return object;
  }
  remove(object) {
    this.objects = this.objects.filter((item) => item !== object);
    if (this.active === object) this.active = null;
  }
  setActiveObject(object) {
    this.active = object;
    this.fire('selection:updated', {});
  }
  getActiveObject() {
    return this.active;
  }
  getObjects() {
    return this.objects;
  }
  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
  setDimensions({ width, height }) {
    this.width = width;
    this.height = height;
  }
  bringObjectForward(object) {
    const index = this.objects.indexOf(object);
    if (index >= 0 && index < this.objects.length - 1)
      [this.objects[index], this.objects[index + 1]] = [
        this.objects[index + 1],
        this.objects[index],
      ];
  }
  sendObjectBackwards(object) {
    const index = this.objects.indexOf(object);
    if (index > 0)
      [this.objects[index], this.objects[index - 1]] = [
        this.objects[index - 1],
        this.objects[index],
      ];
  }
  bringObjectToFront(object) {
    this.remove(object);
    this.objects.push(object);
    this.active = object;
  }
  sendObjectToBack(object) {
    this.remove(object);
    this.objects.unshift(object);
    this.active = object;
  }
  on(name, listener) {
    this.handlers.set(name, listener);
  }
  fire(name, payload) {
    this.handlers.get(name)?.(payload);
  }
  requestRenderAll() {}
  toJSON() {
    return structuredClone({
      width: this.width,
      height: this.height,
      objects: this.objects,
    });
  }
  async loadFromJSON(scene) {
    this.loadCalls += 1;
    await new Promise((resolve) =>
      setTimeout(resolve, this.loadCalls === 1 ? 20 : 1)
    );
    this.width = scene.width;
    this.height = scene.height;
    this.objects = scene.objects.map((item) =>
      Object.assign(new FakeObject(), item)
    );
    this.active = this.objects.at(-1) || null;
  }
  async toBlob({ format }) {
    return new Blob(['raster'], { type: `image/${format}` });
  }
  dispose() {
    this.objects = [];
  }
}

function loadEngine() {
  const filename = path.join(
    root,
    'apps/frontend/src/components/media/image-editor/fabric-engine.ts'
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (request === 'fabric')
      return {
        Canvas,
        Ellipse,
        FabricObject: FakeObject,
        FabricImage,
        IText,
        Line,
        PencilBrush,
        Rect,
      };
    if (request.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), request + '.ts');
      const source = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2021,
        },
      }).outputText;
      const child = { exports: {} };
      new Function('exports', 'require', 'module', source)(
        child.exports,
        localRequire,
        child
      );
      return child.exports;
    }
    return require(request);
  };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    localRequire,
    loaded
  );
  return loaded.exports;
}

beforeAll(() => {
  global.crypto = {
    randomUUID: (() => {
      let value = 0;
      return () => String(++value);
    })(),
  };
  global.document = {
    documentElement: {},
    fonts: { ready: Promise.resolve() },
  };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
});

async function mountedEngine() {
  const { FabricImageEditorEngine } = loadEngine();
  const engine = new FabricImageEditorEngine();
  await engine.mount(
    {},
    { naturalWidth: 320, naturalHeight: 240 },
    { width: 320, height: 240 }
  );
  return engine;
}

test('real engine applies asymmetric crop and undo restores the exact prior scene', async () => {
  const engine = await mountedEngine();
  await engine.command('add-rectangle', { color: 'red' });
  const before = Canvas.last.toJSON();
  await engine.command('crop', { x: 17, y: 29, width: 201, height: 173 });
  expect(engine.getSnapshot()).toMatchObject({ width: 201, height: 173 });
  expect(Canvas.last.getObjects()[0]).toMatchObject({ left: -17, top: -29 });
  await engine.command('undo');
  expect(Canvas.last.toJSON()).toEqual(before);
});

test('real engine runs flip, resize, reorder and delete against its production command boundary', async () => {
  const engine = await mountedEngine();
  await engine.command('add-rectangle', { color: 'red' });
  const rectangle = Canvas.last.getActiveObject();
  await engine.command('flip-horizontal');
  expect(rectangle.flipX).toBe(true);
  await engine.command('resize', { width: 256, height: 192 });
  expect(engine.getSnapshot()).toMatchObject({ width: 256, height: 192 });
  await engine.command('back-layer');
  expect(Canvas.last.getObjects()[0].editorName).toBe('Rectangle');
  await engine.command('delete-layer');
  expect(engine.getSnapshot().layers).toHaveLength(1);
});

test('real engine records each completed freehand stroke as one undo step', async () => {
  const engine = await mountedEngine();
  for (const marker of [1, 2]) {
    const pathObject = new FakeObject({
      type: 'path',
      path: [[marker], [marker + 1]],
    });
    Canvas.last.add(pathObject);
    Canvas.last.fire('path:created', { path: pathObject });
  }
  expect(engine.getSnapshot().layers).toHaveLength(3);
  await engine.command('undo');
  expect(engine.getSnapshot().layers).toHaveLength(2);
});

test('real engine serializes rapid undo operations instead of racing async restores', async () => {
  const engine = await mountedEngine();
  await engine.command('add-rectangle');
  await engine.command('add-ellipse');
  await engine.command('add-line');
  await Promise.all([engine.command('undo'), engine.command('undo')]);
  expect(engine.getSnapshot().layers.map((layer) => layer.name)).toEqual([
    'Rectangle',
    'Source image',
  ]);
});

test('a Fabric object transform advances the scene revision without a toolbar command', async () => {
  const engine = await mountedEngine();
  const before = engine.getSnapshot().revision;
  Canvas.last.getActiveObject().set({ left: 41, top: 23 });
  Canvas.last.fire('object:modified', {});
  expect(engine.getSnapshot().revision).toBeGreaterThan(before);
});

// Canvas bakes the face that was loaded when it painted; it never repaints for
// a font that arrives later. `document.fonts.ready` does not cover a face the
// page has not painted yet, so the editor has to ask for each by name — with a
// Cyrillic sample, or a subsetted face would answer with Latin only.
test('real engine requests every offered face with a Cyrillic sample before mounting and before export', async () => {
  const previousStyle = global.getComputedStyle;
  const previousFonts = global.document.fonts;
  const requested = [];
  const families = {
    '--font-cf-sans': 'TestSans',
    '--font-cf-mono': 'TestMono',
    '--font-cf-editor-text': 'TestEditorText',
  };
  global.getComputedStyle = () => ({
    getPropertyValue: (name) => families[name] || '',
  });
  global.document.fonts = {
    ready: Promise.resolve(),
    load: (font, sample) => {
      requested.push([font, sample]);
      return Promise.resolve([]);
    },
  };
  try {
    const { FabricImageEditorEngine } = loadEngine();
    const engine = new FabricImageEditorEngine();
    await engine.mount(
      {},
      { naturalWidth: 320, naturalHeight: 240 },
      { width: 320, height: 240 }
    );
    const afterMount = requested.length;
    await engine.exportRaster({ format: 'image/png' });

    // Every face the text tool offers, not just the two the interface uses.
    // A face left out here is a face that renders as a fallback in the file a
    // person downloads.
    expect(afterMount).toBe(3);
    expect(requested.length).toBe(6);
    expect(requested.map(([font]) => font)).toEqual([
      '48px TestSans',
      '48px TestMono',
      '48px TestEditorText',
      '48px TestSans',
      '48px TestMono',
      '48px TestEditorText',
    ]);
    for (const [, sample] of requested) {
      expect(sample).toMatch(/[Ѐ-ӿ]/);
    }
  } finally {
    global.getComputedStyle = previousStyle;
    global.document.fonts = previousFonts;
  }
});

test('a browser that cannot resolve a face still opens the editor', async () => {
  const previousFonts = global.document.fonts;
  global.document.fonts = {
    ready: Promise.resolve(),
    load: () => Promise.reject(new Error('unresolvable face')),
  };
  try {
    const { FabricImageEditorEngine } = loadEngine();
    const engine = new FabricImageEditorEngine();
    await expect(
      engine.mount(
        {},
        { naturalWidth: 320, naturalHeight: 240 },
        { width: 320, height: 240 }
      )
    ).resolves.toBeUndefined();
  } finally {
    global.document.fonts = previousFonts;
  }
});

// Each offered face has to reach its own file. A mapping that quietly points
// two names at one variable would show up as a font picker that changes the
// label and nothing else — and only in the downloaded image.
test('every offered face resolves to its own product variable', async () => {
  const previousStyle = global.getComputedStyle;
  const asked = [];
  global.getComputedStyle = () => ({
    getPropertyValue: (name) => {
      asked.push(name);
      return `resolved(${name})`;
    },
  });
  try {
    const { FabricImageEditorEngine } = loadEngine();
    const engine = new FabricImageEditorEngine();
    await engine.mount(
      {},
      { naturalWidth: 320, naturalHeight: 240 },
      { width: 320, height: 240 }
    );
    asked.length = 0;
    for (const fontFamily of ['Geologica', 'Golos Text', 'JetBrains Mono']) {
      await engine.command('add-text', { text: 'Пример', fontFamily });
    }
    const used = engine
      .getSnapshot()
      .layers.filter((layer) => layer.type === 'i-text');
    expect(used.length).toBe(3);
    expect(asked).toEqual([
      '--font-cf-sans',
      '--font-cf-editor-text',
      '--font-cf-mono',
    ]);
    expect(new Set(asked).size).toBe(3);
  } finally {
    global.getComputedStyle = previousStyle;
  }
});
