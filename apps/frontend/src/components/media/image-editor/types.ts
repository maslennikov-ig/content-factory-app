export const EDITOR_COMMANDS = [
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
] as const;

export type EditorCommandName = (typeof EDITOR_COMMANDS)[number];
export type RasterFormat = 'image/png' | 'image/jpeg';
/**
 * Faces offered for text set on the image. Content typography, not the
 * interface's: the product's own screens keep their two faces and nine tokens.
 */
export type EditorFont = 'Geologica' | 'JetBrains Mono' | 'Golos Text';
export type SocialPreset =
  | 'square'
  | 'portrait'
  | 'story'
  | 'landscape'
  | 'telegram';

export type MediaLibraryItem = {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  thumbnail: string | null;
  alt: string | null;
};

export type UploadedMedia = MediaLibraryItem;

export type EditorLayer = {
  id: string;
  name: string;
  type: string;
  selected: boolean;
};

export type EditorSnapshot = {
  revision: number;
  width: number;
  height: number;
  layers: EditorLayer[];
  canUndo: boolean;
  canRedo: boolean;
  selectedLayerId: string | null;
};

export interface ImageEditorEngineAdapter {
  mount(
    host: HTMLCanvasElement,
    source: HTMLImageElement,
    options: { width: number; height: number }
  ): Promise<void>;
  command(
    name: EditorCommandName,
    payload?: Record<string, unknown>
  ): Promise<void> | void;
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  exportRaster(options: {
    format: RasterFormat;
    quality?: number;
  }): Promise<Blob>;
  dispose(): void;
}

export type EditorUpload = (
  blob: Blob,
  filename: string,
  signal?: AbortSignal
) => Promise<UploadedMedia>;
