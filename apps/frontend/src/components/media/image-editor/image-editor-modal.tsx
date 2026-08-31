'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { validateExportRaster } from './bounds';
import { loadExactImageSource, type LoadedSource } from './source-loader';
import { ImageEditorSurface, type EditorUiState } from './image-editor-surface';
import type {
  EditorCommandName,
  EditorFont,
  EditorSnapshot,
  EditorUpload,
  ImageEditorEngineAdapter,
  MediaLibraryItem,
  RasterFormat,
  UploadedMedia,
} from './types';

const EMPTY: EditorSnapshot = {
  revision: 0,
  width: 1080,
  height: 1080,
  layers: [],
  canUndo: false,
  canRedo: false,
  selectedLayerId: null,
};
const isInput = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

export function ImageEditorModal({
  source,
  upload,
  onSaved,
  onClose,
  returnFocus,
  locale = 'en',
  createEngine,
  sourceLoader = loadExactImageSource,
}: {
  source: MediaLibraryItem;
  upload: EditorUpload;
  onSaved: (media: UploadedMedia) => Promise<void> | void;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  locale?: 'en' | 'ru';
  createEngine?: () =>
    | Promise<ImageEditorEngineAdapter>
    | ImageEditorEngineAdapter;
  sourceLoader?: (url: string, signal: AbortSignal) => Promise<LoadedSource>;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ImageEditorEngineAdapter | null>(null);
  const loadedRef = useRef<LoadedSource | null>(null);
  const operationAbortRef = useRef<AbortController | null>(null);
  const operationInFlightRef = useRef(false);
  const [state, setState] = useState<EditorUiState>('loading');
  const [engineReady, setEngineReady] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [savedRevision, setSavedRevision] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState<RasterFormat>('image/png');
  // JPEG has no alpha channel. Kept as state rather than read from the ref so
  // the warning appears with the source, not one render later.
  const [sourceType, setSourceType] = useState('');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(1080);
  const [cropHeight, setCropHeight] = useState(1080);
  const [textValue, setTextValue] = useState(
    locale === 'ru' ? 'Привет, мир' : 'Hello, world'
  );
  const [textFont, setTextFont] = useState<EditorFont>(
    'Geologica'
  );
  const [textSize, setTextSize] = useState(48);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(
    'left'
  );
  const [textColor, setTextColor] = useState('--cf-ink');
  const [drawColor, setDrawColor] = useState('--cf-ink');
  const [drawWidth, setDrawWidth] = useState(8);
  const [activeMode, setActiveModeState] = useState<'crop' | 'draw' | null>(
    null
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const ratio = useRef(1);
  const dirty = engineReady && snapshot.revision !== savedRevision;

  useEffect(() => {
    const abort = new AbortController();
    let unsubscribe = () => {};
    let active = true;
    (async () => {
      try {
        setEngineReady(false);
        setStatus('source:loading');
        const loaded = await sourceLoader(source.path, abort.signal);
        if (!active) {
          loaded.dispose();
          return;
        }
        loadedRef.current = loaded;
        setSourceType(loaded.type);
        setStatus('source:decoded');
        let w = loaded.width;
        let h = loaded.height;
        const scale = Math.min(
          1,
          4096 / w,
          4096 / h,
          Math.sqrt(16_777_216 / (w * h))
        );
        w = Math.max(64, Math.round(w * scale));
        h = Math.max(64, Math.round(h * scale));
        setStatus('engine:loading');
        const engine = createEngine
          ? await createEngine()
          : (await import('./fabric-engine')).createFabricImageEditorEngine();
        if (!active || !canvasRef.current) {
          engine.dispose();
          return;
        }
        setStatus('engine:mounting');
        engineRef.current = engine;
        await engine.mount(canvasRef.current, loaded.image, {
          width: w,
          height: h,
        });
        const initial = engine.getSnapshot();
        setSavedRevision(initial.revision);
        unsubscribe = engine.subscribe((next) => {
          setSnapshot(next);
          setWidth(next.width);
          setHeight(next.height);
          ratio.current = next.width / next.height;
        });
        setEngineReady(true);
        setState('default');
        setStatus(locale === 'ru' ? 'Изображение готово' : 'Image ready');
        requestAnimationFrame(() =>
          document.getElementById('image-editor-title')?.focus()
        );
      } catch (cause) {
        if (!abort.signal.aborted) {
          setEngineReady(false);
          setState('error');
          setError(
            cause instanceof Error
              ? cause.message
              : 'The editor could not be opened.'
          );
        }
      }
    })();
    return () => {
      active = false;
      abort.abort();
      operationAbortRef.current?.abort();
      unsubscribe();
      engineRef.current?.dispose();
      engineRef.current = null;
      loadedRef.current?.dispose();
      loadedRef.current = null;
      returnFocus?.focus();
    };
  }, [source.id, source.path]);

  const command = useCallback(
    async (name: EditorCommandName, payload?: Record<string, unknown>) => {
      const engine = engineRef.current;
      if (!engine) {
        setError(
          (current) =>
            current ||
            (locale === 'ru'
              ? 'Редактор ещё не готов.'
              : 'The editor is not ready.')
        );
        return false;
      }
      try {
        setError('');
        await engine.command(name, payload);
        setStatus(locale === 'ru' ? 'Изменение применено' : 'Change applied');
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The change could not be applied.'
        );
        return false;
      }
    },
    [locale]
  );

  const setActiveMode = useCallback(
    (mode: 'crop' | 'draw' | null) => {
      setActiveModeState(mode);
      if (mode === 'crop') {
        setCropX(0);
        setCropY(0);
        setCropWidth(snapshot.width);
        setCropHeight(snapshot.height);
      }
      if (engineRef.current && (mode === 'draw' || activeMode === 'draw'))
        void command('draw-stroke', {
          active: mode === 'draw',
          color: drawColor,
          width: drawWidth,
        });
      setStatus(
        mode ? (locale === 'ru' ? `Режим: ${mode}` : `Mode: ${mode}`) : ''
      );
    },
    [
      activeMode,
      command,
      drawColor,
      drawWidth,
      locale,
      snapshot.height,
      snapshot.width,
    ]
  );

  const applyCrop = useCallback(async () => {
    if (
      await command('crop', {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      })
    )
      setActiveModeState(null);
  }, [command, cropHeight, cropWidth, cropX, cropY]);
  const changeDrawColor = useCallback(
    (value: string) => {
      setDrawColor(value);
      if (activeMode === 'draw')
        void command('draw-stroke', {
          active: true,
          color: value,
          width: drawWidth,
        });
    },
    [activeMode, command, drawWidth]
  );
  const changeDrawWidth = useCallback(
    (value: number) => {
      setDrawWidth(value);
      if (activeMode === 'draw')
        void command('draw-stroke', {
          active: true,
          color: drawColor,
          width: value,
        });
    },
    [activeMode, command, drawColor]
  );
  const close = useCallback(() => {
    if (operationBusy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [dirty, onClose, operationBusy]);

  const save = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !engineReady || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    const abort = new AbortController();
    operationAbortRef.current = abort;
    let uploaded = false;
    try {
      setError('');
      setOperationBusy(true);
      setStatus(
        locale === 'ru'
          ? 'Экспортируем и загружаем…'
          : 'Exporting and uploading…'
      );
      const blob = await validateExportRaster(
        await engine.exportRaster({ format, quality: 0.92 }),
        { width: snapshot.width, height: snapshot.height }
      );
      const stem =
        (source.originalName || source.name || 'image')
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '-')
          .slice(0, 80) || 'image';
      const media = await upload(
        blob,
        `edited-${stem}.${format === 'image/png' ? 'png' : 'jpg'}`,
        abort.signal
      );
      uploaded = true;
      setSavedRevision(snapshot.revision);
      setState('success');
      setStatus(
        locale === 'ru'
          ? 'Новая копия сохранена в медиатеке'
          : 'A new copy was saved to the media library'
      );
      await onSaved(media);
    } catch (cause) {
      if (!abort.signal.aborted) {
        if (uploaded) {
          setSavedRevision(snapshot.revision);
          setState('success');
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'The image could not be saved.'
        );
      }
    } finally {
      operationAbortRef.current = null;
      operationInFlightRef.current = false;
      setOperationBusy(false);
    }
  }, [
    engineReady,
    format,
    locale,
    onSaved,
    operationBusy,
    snapshot.height,
    snapshot.revision,
    snapshot.width,
    source.name,
    source.originalName,
    upload,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        operationBusy &&
        (event.key === 'Escape' ||
          event.key === 'Delete' ||
          ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopImmediatePropagation();
        void command(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        if (activeMode) setActiveMode(null);
        else close();
        return;
      }
      if (!isInput(event.target) && event.key === 'Delete') {
        event.preventDefault();
        void command('delete-layer');
      }
      if (event.key === 'Tab' && confirmDiscard && dialogRef.current) {
        const focusable = [
          ...dialogRef.current.querySelectorAll<HTMLElement>(
            '[role="alertdialog"] button:not([disabled])'
          ),
        ];
        if (!focusable.length) return;
        event.preventDefault();
        const current = focusable.indexOf(
          document.activeElement as HTMLElement
        );
        const next = event.shiftKey
          ? current <= 0
            ? focusable.length - 1
            : current - 1
          : current < 0 || current === focusable.length - 1
          ? 0
          : current + 1;
        focusable[next].focus();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [
          ...dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [
    activeMode,
    close,
    command,
    confirmDiscard,
    operationBusy,
    setActiveMode,
  ]);

  const handleWidth = (value: number) => {
    setWidth(value);
    if (aspectLocked && Number.isFinite(value))
      setHeight(Math.round(value / ratio.current));
  };
  const handleHeight = (value: number) => {
    setHeight(value);
    if (aspectLocked && Number.isFinite(value))
      setWidth(Math.round(value * ratio.current));
  };

  return (
    <div ref={dialogRef}>
      <ImageEditorSurface
        locale={locale}
        state={state}
        snapshot={snapshot}
        canvasRef={canvasRef}
        status={status}
        error={error}
        activeMode={activeMode}
        dirty={dirty}
        engineReady={engineReady}
        operationBusy={operationBusy}
        format={format}
        sourceType={sourceType}
        width={width}
        height={height}
        aspectLocked={aspectLocked}
        cropX={cropX}
        cropY={cropY}
        cropWidth={cropWidth}
        cropHeight={cropHeight}
        textValue={textValue}
        textFont={textFont}
        textSize={textSize}
        textAlign={textAlign}
        textColor={textColor}
        drawColor={drawColor}
        drawWidth={drawWidth}
        onCommand={command}
        onClose={close}
        onSave={save}
        onFormat={setFormat}
        onWidth={handleWidth}
        onHeight={handleHeight}
        onAspectLock={setAspectLocked}
        onCropX={setCropX}
        onCropY={setCropY}
        onCropWidth={setCropWidth}
        onCropHeight={setCropHeight}
        onApplyCrop={applyCrop}
        onText={setTextValue}
        onTextFont={setTextFont}
        onTextSize={setTextSize}
        onTextAlign={setTextAlign}
        onTextColor={setTextColor}
        onDrawColor={changeDrawColor}
        onDrawWidth={changeDrawWidth}
        onMode={setActiveMode}
        confirmDiscard={confirmDiscard}
        onDiscard={onClose}
        onKeep={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
