import {
  Canvas,
  Ellipse,
  FabricObject,
  FabricImage,
  IText,
  Line,
  PencilBrush,
  Rect,
} from 'fabric';
import {
  validateCanvasSize,
  validateCropRect,
  validateDrawPoints,
  validateLayerCount,
  validateText,
} from './bounds';
import { EditorHistory } from './editor-session';
import type {
  EditorCommandName,
  EditorFont,
  EditorSnapshot,
  ImageEditorEngineAdapter,
  RasterFormat,
} from './types';

type SceneJson = Record<string, unknown>;
const SERIALIZED_PROPERTIES = ['editorId', 'editorName'];
FabricObject.customProperties = SERIALIZED_PROPERTIES;
const id = () => `layer-${crypto.randomUUID()}`;
const resolvedCssValue = (value: unknown, fallback: string) => {
  if (typeof value !== 'string' || !value) return fallback;
  if (!value.startsWith('--')) return value;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(value).trim() ||
    fallback
  );
};
/**
 * The faces the text tool offers, and the CSS variable each one resolves to.
 *
 * Named rather than switched on a boolean: a third face turned every
 * `mono ? a : b` in this file into a question with no answer, and a fourth
 * would do it again.
 */
const EDITOR_FONTS: Record<EditorFont, { variable: string; fallback: string }> =
  {
    Geologica: { variable: '--font-cf-sans', fallback: 'sans-serif' },
    'JetBrains Mono': { variable: '--font-cf-mono', fallback: 'monospace' },
    'Golos Text': { variable: '--font-cf-editor-text', fallback: 'Georgia' },
  };

const resolvedFont = (font: EditorFont) => {
  const choice = EDITOR_FONTS[font] || EDITOR_FONTS.Geologica;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(choice.variable)
      .trim() || choice.fallback
  );
};

/**
 * Canvas paints text with whatever face is loaded at that instant and never
 * repaints when a later one arrives, so an unloaded face is not a flash — it is
 * baked into the exported file.
 *
 * `document.fonts.ready` alone does not prevent that: it settles the loads
 * already in flight, and a face the page has not painted yet was never
 * requested. Both faces here are reachable that way — the monospaced one on a
 * screen showing no monospaced text, either one on an English interface that
 * has never rendered a Cyrillic glyph.
 *
 * The sample carries Cyrillic deliberately. Both faces ship as one unsplit file
 * today, so a Latin sample would be enough; it would stop being enough the day
 * anyone subsets them, and the failure would show up as Russian text silently
 * exported in a fallback face.
 */
const FONT_WARMUP_SAMPLE = 'Пример Аа Bb 123';

const warmUpEditorFonts = async () => {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    (Object.keys(EDITOR_FONTS) as EditorFont[])
      .map(resolvedFont)
      .map((family) =>
      // A face the browser cannot resolve must not stop the editor opening.
      Promise.resolve()
        .then(() => document.fonts.load(`48px ${family}`, FONT_WARMUP_SAMPLE))
        .catch(() => undefined)
      )
  );
  await document.fonts.ready;
};

export class FabricImageEditorEngine implements ImageEditorEngineAdapter {
  private canvas: Canvas | null = null;
  private history: EditorHistory<SceneJson> | null = null;
  private listeners = new Set<(snapshot: EditorSnapshot) => void>();
  private restoring = false;
  private drawPoints = 0;
  private drawStroke = 0;
  private commandQueue: Promise<void> = Promise.resolve();

  async mount(
    host: HTMLCanvasElement,
    source: HTMLImageElement,
    options: { width: number; height: number }
  ) {
    const size = validateCanvasSize(options.width, options.height);
    // Before the first text layer can exist, not after: a warm-up that runs on
    // export only would still let the on-screen canvas differ from the file.
    await warmUpEditorFonts();
    this.canvas = new Canvas(host, {
      width: size.width,
      height: size.height,
      preserveObjectStacking: true,
      selection: true,
    });
    const background = new FabricImage(source, {
      left: 0,
      top: 0,
      scaleX: size.width / source.naturalWidth,
      scaleY: size.height / source.naturalHeight,
      selectable: true,
    });
    Object.assign(background, {
      editorId: 'source-image',
      editorName: 'Source image',
    });
    this.canvas.add(background);
    this.canvas.setActiveObject(background);
    this.history = new EditorHistory(this.serialize());
    this.canvas.on('object:modified', () => this.record());
    this.canvas.on('selection:created', () => this.emit());
    this.canvas.on('selection:updated', () => this.emit());
    this.canvas.on('selection:cleared', () => this.emit());
    this.canvas.on('path:created', ({ path }) => {
      const points = ((path as unknown as { path?: unknown[] }).path || [])
        .length;
      this.drawPoints += points;
      try {
        validateDrawPoints(this.drawPoints);
        validateLayerCount(this.requireCanvas().getObjects().length);
      } catch {
        this.canvas?.remove(path);
        return;
      }
      Object.assign(path, { editorId: id(), editorName: 'Drawing' });
      this.record(`draw:${++this.drawStroke}`);
    });
    this.emit();
  }

  subscribe(listener: (snapshot: EditorSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }
  getSnapshot(): EditorSnapshot {
    const canvas = this.requireCanvas();
    const active = canvas.getActiveObject() as
      | (FabricObject & { editorId?: string })
      | undefined;
    return {
      revision: this.history?.revision ?? 0,
      width: canvas.getWidth(),
      height: canvas.getHeight(),
      canUndo: !!this.history?.canUndo,
      canRedo: !!this.history?.canRedo,
      selectedLayerId: active?.editorId || null,
      layers: [...canvas.getObjects()].reverse().map((object, index) => ({
        id:
          (object as FabricObject & { editorId?: string }).editorId ||
          `layer-${index}`,
        name:
          (object as FabricObject & { editorName?: string }).editorName ||
          object.type ||
          'Layer',
        type: object.type || 'object',
        selected: object === active,
      })),
    };
  }

  command(name: EditorCommandName, payload: Record<string, unknown> = {}) {
    const queued = this.commandQueue.then(() =>
      this.performCommand(name, payload)
    );
    this.commandQueue = queued.catch(() => undefined);
    return queued;
  }

  private async performCommand(
    name: EditorCommandName,
    payload: Record<string, unknown>
  ) {
    const canvas = this.requireCanvas();
    const before = JSON.stringify(this.serialize());
    const active = canvas.getActiveObject();
    const color = resolvedCssValue(payload.color, 'rgb(34 35 26)');
    if (name === 'undo' || name === 'redo')
      return this.restore(
        name === 'undo' ? this.history?.undo() : this.history?.redo()
      );
    if (name === 'select-layer') {
      const found = canvas
        .getObjects()
        .find(
          (object) =>
            (object as FabricObject & { editorId?: string }).editorId ===
            payload.id
        );
      if (found) canvas.setActiveObject(found);
    } else if (name === 'delete-layer') {
      if (
        active &&
        (active as FabricObject & { editorId?: string }).editorId !==
          'source-image'
      )
        canvas.remove(active);
    } else if (name === 'add-text') {
      this.guardLayer();
      validateText(String(payload.text || 'Text'));
      const text = new IText(String(payload.text || 'Text'), {
        left: 48,
        top: 48,
        fill: color,
        fontSize: Math.max(8, Math.min(512, Number(payload.fontSize) || 48)),
        fontFamily: resolvedFont(payload.fontFamily as EditorFont),
        textAlign:
          payload.textAlign === 'center' || payload.textAlign === 'right'
            ? payload.textAlign
            : 'left',
      });
      Object.assign(text, { editorId: id(), editorName: 'Text' });
      canvas.add(text);
      canvas.setActiveObject(text);
    } else if (name === 'edit-text' && active instanceof IText) {
      const text = validateText(String(payload.text ?? active.text));
      active.set({
        text,
        fill: color,
        fontSize: Math.max(
          8,
          Math.min(512, Number(payload.fontSize) || active.fontSize)
        ),
        fontFamily: resolvedFont(payload.fontFamily as EditorFont),
        textAlign:
          payload.textAlign === 'center' || payload.textAlign === 'right'
            ? payload.textAlign
            : 'left',
      });
      this.record(`text:${(active as IText & { editorId?: string }).editorId}`);
    } else if (name === 'add-rectangle') {
      this.addShape(
        new Rect({ left: 64, top: 64, width: 220, height: 140, fill: color }),
        'Rectangle'
      );
    } else if (name === 'add-ellipse') {
      this.addShape(
        new Ellipse({ left: 64, top: 64, rx: 110, ry: 70, fill: color }),
        'Ellipse'
      );
    } else if (name === 'add-line') {
      this.addShape(
        new Line([64, 64, 284, 204], { stroke: color, strokeWidth: 8 }),
        'Line'
      );
    } else if (name === 'draw-stroke') {
      canvas.isDrawingMode = Boolean(payload.active);
      if (canvas.isDrawingMode) {
        const brush = new PencilBrush(canvas);
        brush.color = color;
        brush.width = Math.max(1, Math.min(64, Number(payload.width) || 8));
        canvas.freeDrawingBrush = brush;
      }
    } else if (name === 'resize' || name === 'apply-preset') {
      const size = validateCanvasSize(
        Number(payload.width),
        Number(payload.height)
      );
      const x = size.width / canvas.getWidth(),
        y = size.height / canvas.getHeight();
      canvas.getObjects().forEach((object) =>
        object.set({
          left: (object.left || 0) * x,
          top: (object.top || 0) * y,
          scaleX: (object.scaleX || 1) * x,
          scaleY: (object.scaleY || 1) * y,
        })
      );
      canvas.setDimensions(size);
    } else if (name === 'crop') {
      const crop = validateCropRect(
        {
          x: Number(payload.x),
          y: Number(payload.y),
          width: Number(payload.width),
          height: Number(payload.height),
        },
        { width: canvas.getWidth(), height: canvas.getHeight() }
      );
      canvas.getObjects().forEach((object) =>
        object.set({
          left: (object.left || 0) - crop.x,
          top: (object.top || 0) - crop.y,
        })
      );
      canvas.setDimensions({ width: crop.width, height: crop.height });
    } else if (name === 'rotate-90' && active)
      active.rotate(((active.angle || 0) + 90) % 360);
    else if (name === 'flip-horizontal' && active)
      active.set('flipX', !active.flipX);
    else if (name === 'flip-vertical' && active)
      active.set('flipY', !active.flipY);
    else if (active && name === 'raise-layer')
      canvas.bringObjectForward(active);
    else if (active && name === 'lower-layer')
      canvas.sendObjectBackwards(active);
    else if (active && name === 'front-layer')
      canvas.bringObjectToFront(active);
    else if (active && name === 'back-layer') canvas.sendObjectToBack(active);
    else if (active && name === 'move-layer')
      active.set({
        left: Number(payload.left) || 0,
        top: Number(payload.top) || 0,
      });
    canvas.requestRenderAll();
    if (
      !['select-layer', 'draw-stroke', 'edit-text'].includes(name) &&
      before !== JSON.stringify(this.serialize())
    )
      this.record();
    else this.emit();
  }

  async exportRaster({
    format,
    quality = 0.92,
  }: {
    format: RasterFormat;
    quality?: number;
  }) {
    await this.commandQueue;
    await warmUpEditorFonts();
    const blob = await this.requireCanvas().toBlob({
      format: format === 'image/png' ? 'png' : 'jpeg',
      quality,
      multiplier: 1,
    });
    if (!blob) throw new Error('The image could not be exported.');
    return blob;
  }

  dispose() {
    this.listeners.clear();
    this.canvas?.dispose();
    this.canvas = null;
    this.history = null;
  }

  private requireCanvas() {
    if (!this.canvas) throw new Error('The editor engine is not mounted.');
    return this.canvas;
  }
  private guardLayer() {
    validateLayerCount(this.requireCanvas().getObjects().length + 1);
  }
  private addShape(object: FabricObject, name: string) {
    this.guardLayer();
    Object.assign(object, { editorId: id(), editorName: name });
    this.requireCanvas().add(object);
    this.requireCanvas().setActiveObject(object);
  }
  private serialize() {
    return this.requireCanvas().toJSON() as SceneJson;
  }
  private record(group?: string) {
    if (this.restoring || !this.history) return;
    this.history.push(this.serialize(), group);
    this.emit();
  }
  private async restore(scene?: SceneJson) {
    if (!scene || !this.canvas) return;
    this.restoring = true;
    await this.canvas.loadFromJSON(scene);
    this.restoring = false;
    this.canvas.requestRenderAll();
    this.emit();
  }
  private emit() {
    if (!this.canvas) return;
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const createFabricImageEditorEngine = () =>
  new FabricImageEditorEngine();
