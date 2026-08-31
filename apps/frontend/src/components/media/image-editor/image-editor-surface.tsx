'use client';

import React, { type RefObject, useEffect, useRef } from 'react';
import { Button } from '../../../../../../libraries/react-shared-libraries/src/form/button';
import { CheckboxField } from '../../../../../../libraries/react-shared-libraries/src/form/checkbox.field';
import { Input } from '../../../../../../libraries/react-shared-libraries/src/form/input';
import { Select } from '../../../../../../libraries/react-shared-libraries/src/form/select';
import { SOCIAL_PRESETS } from './bounds';
import type {
  EditorCommandName,
  EditorFont,
  EditorSnapshot,
  RasterFormat,
} from './types';

export type EditorUiState =
  | 'loading'
  | 'default'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

type Copy = ReturnType<typeof editorCopy>;
const editorCopy = (ru: boolean) => ({
  title: ru ? 'Редактор изображения' : 'Image editor',
  close: ru ? 'Закрыть редактор' : 'Close editor',
  save: ru ? 'Сохранить копию' : 'Save a copy',
  source: ru
    ? 'Исходник не изменится. Результат сохранится как новый файл.'
    : 'The source stays unchanged. Your result is saved as a new file.',
  loading: ru ? 'Подготавливаем изображение…' : 'Preparing image…',
  tools: ru ? 'Инструменты' : 'Tools',
  layers: ru ? 'Слои' : 'Layers',
  canvas: ru ? 'Холст' : 'Canvas',
  width: ru ? 'Ширина' : 'Width',
  height: ru ? 'Высота' : 'Height',
  lock: ru ? 'Сохранять пропорции' : 'Lock aspect ratio',
  crop: ru ? 'Кадрировать' : 'Crop',
  cropX: ru ? 'Кадрирование: X' : 'Crop X',
  cropY: ru ? 'Кадрирование: Y' : 'Crop Y',
  cropWidth: ru ? 'Ширина кадра' : 'Crop width',
  cropHeight: ru ? 'Высота кадра' : 'Crop height',
  applyCrop: ru ? 'Применить кадрирование' : 'Apply crop',
  cancelCrop: ru ? 'Отменить кадрирование' : 'Cancel crop',
  rotate: ru ? 'Повернуть 90°' : 'Rotate 90°',
  flipH: ru ? 'Отразить по горизонтали' : 'Flip horizontally',
  flipV: ru ? 'Отразить по вертикали' : 'Flip vertically',
  text: ru ? 'Текст' : 'Text',
  font: ru ? 'Шрифт' : 'Font',
  textSize: ru ? 'Размер текста' : 'Text size',
  align: ru ? 'Выравнивание' : 'Alignment',
  textColor: ru ? 'Цвет текста' : 'Text color',
  drawColor: ru ? 'Цвет кисти' : 'Brush color',
  drawWidth: ru ? 'Толщина кисти' : 'Brush width',
  addText: ru ? 'Добавить текст' : 'Add text',
  editText: ru ? 'Изменить текст' : 'Edit text',
  shapes: ru ? 'Фигуры' : 'Shapes',
  rectangle: ru ? 'Прямоугольник' : 'Rectangle',
  ellipse: ru ? 'Эллипс' : 'Ellipse',
  line: ru ? 'Линия' : 'Line',
  draw: ru ? 'Рисование' : 'Draw',
  undo: ru ? 'Отменить' : 'Undo',
  redo: ru ? 'Повторить' : 'Redo',
  remove: ru ? 'Удалить слой' : 'Delete layer',
  front: ru ? 'На передний план' : 'Bring to front',
  back: ru ? 'На задний план' : 'Send to back',
  up: ru ? 'Поднять' : 'Raise',
  down: ru ? 'Опустить' : 'Lower',
  presets: ru ? 'Форматы соцсетей' : 'Social formats',
  square: ru ? 'Квадрат 1080 × 1080' : 'Square 1080 × 1080',
  portrait: ru ? 'Портрет 1080 × 1350' : 'Portrait 1080 × 1350',
  story: ru ? 'История 1080 × 1920' : 'Story 1080 × 1920',
  landscape: ru
    ? 'Превью ссылки 1200 × 630'
    : 'Link preview 1200 × 630',
  telegram: ru ? 'Telegram 1280 × 720' : 'Telegram 1280 × 720',
  format: ru ? 'Формат' : 'Format',
  jpegAlpha: ru
    ? 'JPEG не хранит прозрачность. Если в исходнике или слоях она есть, эти места станут чёрными — сохраните в PNG.'
    : 'JPEG cannot store transparency. Anywhere the source or a layer is transparent will come out black — save as PNG instead.',
  status: ru ? 'Состояние редактора' : 'Editor status',
  discardTitle: ru ? 'Отменить изменения?' : 'Discard changes?',
  discard: ru ? 'Отменить изменения' : 'Discard changes',
  keep: ru ? 'Продолжить редактирование' : 'Keep editing',
});

const toolButton =
  'relative whitespace-normal after:absolute after:-inset-[4px]';

export function ImageEditorSurface({
  locale,
  state,
  snapshot,
  canvasRef,
  status,
  error,
  activeMode,
  dirty,
  engineReady = true,
  operationBusy = false,
  format,
  sourceType,
  width,
  height,
  aspectLocked,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  textValue,
  textFont,
  textSize,
  textAlign,
  textColor,
  drawColor,
  drawWidth,
  onCommand,
  onClose,
  onSave,
  onFormat,
  onWidth,
  onHeight,
  onAspectLock,
  onCropX,
  onCropY,
  onCropWidth,
  onCropHeight,
  onApplyCrop,
  onText,
  onTextFont,
  onTextSize,
  onTextAlign,
  onTextColor,
  onDrawColor,
  onDrawWidth,
  onMode,
  confirmDiscard,
  onDiscard,
  onKeep,
}: {
  locale: 'en' | 'ru';
  state: EditorUiState;
  snapshot: EditorSnapshot;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  status?: string;
  error?: string;
  activeMode?: 'crop' | 'draw' | null;
  dirty?: boolean;
  engineReady?: boolean;
  operationBusy?: boolean;
  format: RasterFormat;
  sourceType: string;
  width: number;
  height: number;
  aspectLocked: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  textValue: string;
  textFont: EditorFont;
  textSize: number;
  textAlign: 'left' | 'center' | 'right';
  textColor: string;
  drawColor: string;
  drawWidth: number;
  onCommand: (
    name: EditorCommandName,
    payload?: Record<string, unknown>
  ) => void;
  onClose: () => void;
  onSave: () => void;
  onFormat: (format: RasterFormat) => void;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
  onAspectLock: (value: boolean) => void;
  onCropX?: (value: number) => void;
  onCropY?: (value: number) => void;
  onCropWidth?: (value: number) => void;
  onCropHeight?: (value: number) => void;
  onApplyCrop?: () => void;
  onText: (value: string) => void;
  onTextFont: (value: EditorFont) => void;
  onTextSize: (value: number) => void;
  onTextAlign: (value: 'left' | 'center' | 'right') => void;
  onTextColor: (value: string) => void;
  onDrawColor: (value: string) => void;
  onDrawWidth: (value: number) => void;
  onMode: (mode: 'crop' | 'draw' | null) => void;
  confirmDiscard?: boolean;
  onDiscard?: () => void;
  onKeep?: () => void;
}) {
  const c: Copy = editorCopy(locale === 'ru');
  const busy = state === 'loading';
  const disabled =
    state === 'disabled' ||
    state === 'restricted' ||
    state === 'error' ||
    state === 'success' ||
    busy ||
    operationBusy ||
    !engineReady;
  const selected = !!snapshot.selectedLayerId;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirmingDiscardRef = useRef(false);
  useEffect(() => {
    if (confirmDiscard) {
      wasConfirmingDiscardRef.current = true;
      keepButtonRef.current?.focus();
      return;
    }
    if (wasConfirmingDiscardRef.current) {
      wasConfirmingDiscardRef.current = false;
      closeButtonRef.current?.focus();
    }
  }, [confirmDiscard]);
  const command =
    (name: EditorCommandName, payload?: Record<string, unknown>) => () =>
      onCommand(name, payload);
  const applySize = () => onCommand('resize', { width, height });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
      data-product-surface="image-editor"
      data-surface-state={state}
      className="fixed inset-0 z-[60] flex min-h-0 flex-col overflow-hidden bg-cf-canvas text-cf-ink"
    >
      <div
        className="contents"
        aria-hidden={confirmDiscard || undefined}
        inert={confirmDiscard || undefined}
      >
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-[12px] border-b border-cf-border bg-cf-surface px-[16px] py-[12px]">
          <div className="min-w-0">
            <h1
              id="image-editor-title"
              tabIndex={-1}
              className="cf-heading-md text-balance"
            >
              {c.title}
            </h1>
            <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">
              {c.source}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              className={toolButton}
              onClick={command('undo')}
              disabled={!snapshot.canUndo || disabled}
            >
              {c.undo}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={toolButton}
              onClick={command('redo')}
              disabled={!snapshot.canRedo || disabled}
            >
              {c.redo}
            </Button>
            <Button
              type="button"
              variant="primary"
              className={toolButton}
              onClick={onSave}
              disabled={disabled}
            >
              {c.save}
            </Button>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="quiet"
              className={toolButton}
              onClick={onClose}
              disabled={operationBusy}
            >
              {c.close}
            </Button>
          </div>
        </header>
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(220px,280px)] lg:overflow-hidden">
          <aside
            aria-label={c.tools}
            className="min-w-0 border-b border-cf-border bg-cf-surface p-[12px] lg:overflow-y-auto lg:border-b-0 lg:border-e"
          >
            <h2 className="cf-label-md mb-[8px]">{c.tools}</h2>
            <fieldset
              disabled={disabled}
              className="flex min-w-0 flex-col gap-[12px] disabled:opacity-60"
            >
              <div className="grid grid-cols-2 gap-[8px]">
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.width}
                  <Input
                    standalone
                    density="dense"
                    aria-label={c.width}
                    type="number"
                    min={64}
                    max={4096}
                    value={width}
                    onChange={(event) => onWidth(Number(event.target.value))}
                  />
                </label>
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.height}
                  <Input
                    standalone
                    density="dense"
                    aria-label={c.height}
                    type="number"
                    min={64}
                    max={4096}
                    value={height}
                    onChange={(event) => onHeight(Number(event.target.value))}
                  />
                </label>
              </div>
              <CheckboxField
                checked={aspectLocked}
                onChange={(event) => onAspectLock(event.target.checked)}
                label={c.lock}
              />
              <Button
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={applySize}
              >
                {c.canvas}
              </Button>
              <div className="grid grid-cols-1 gap-[8px]">
                <Button
                  type="button"
                  variant={activeMode === 'crop' ? 'primary' : 'secondary'}
                  className={toolButton}
                  onClick={() => onMode(activeMode === 'crop' ? null : 'crop')}
                >
                  {c.crop}
                </Button>
                {activeMode === 'crop' && (
                  <div className="grid grid-cols-2 gap-[8px]">
                    <label className="cf-label-sm flex flex-col gap-[4px]">
                      {c.cropX}
                      <Input
                        standalone
                        density="dense"
                        aria-label={c.cropX}
                        type="number"
                        min={0}
                        max={snapshot.width - 64}
                        value={cropX}
                        onChange={(event) =>
                          onCropX?.(Number(event.target.value))
                        }
                      />
                    </label>
                    <label className="cf-label-sm flex flex-col gap-[4px]">
                      {c.cropY}
                      <Input
                        standalone
                        density="dense"
                        aria-label={c.cropY}
                        type="number"
                        min={0}
                        max={snapshot.height - 64}
                        value={cropY}
                        onChange={(event) =>
                          onCropY?.(Number(event.target.value))
                        }
                      />
                    </label>
                    <label className="cf-label-sm flex flex-col gap-[4px]">
                      {c.cropWidth}
                      <Input
                        standalone
                        density="dense"
                        aria-label={c.cropWidth}
                        type="number"
                        min={64}
                        max={snapshot.width}
                        value={cropWidth}
                        onChange={(event) =>
                          onCropWidth?.(Number(event.target.value))
                        }
                      />
                    </label>
                    <label className="cf-label-sm flex flex-col gap-[4px]">
                      {c.cropHeight}
                      <Input
                        standalone
                        density="dense"
                        aria-label={c.cropHeight}
                        type="number"
                        min={64}
                        max={snapshot.height}
                        value={cropHeight}
                        onChange={(event) =>
                          onCropHeight?.(Number(event.target.value))
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="primary"
                      className={`${toolButton} col-span-2`}
                      onClick={onApplyCrop}
                    >
                      {c.applyCrop}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className={`${toolButton} col-span-2`}
                      onClick={() => onMode(null)}
                    >
                      {c.cancelCrop}
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  onClick={command('rotate-90')}
                  disabled={!selected}
                >
                  {c.rotate}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  onClick={command('flip-horizontal')}
                  disabled={!selected}
                >
                  {c.flipH}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  onClick={command('flip-vertical')}
                  disabled={!selected}
                >
                  {c.flipV}
                </Button>
              </div>
              <label className="cf-label-sm flex flex-col gap-[4px]">
                {c.text}
                <Input
                  standalone
                  density="dense"
                  aria-label={c.text}
                  maxLength={2000}
                  value={textValue}
                  onChange={(event) => onText(event.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-[8px]">
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.font}
                  <Select
                    standalone
                    density="dense"
                    aria-label={c.font}
                    value={textFont}
                    onChange={(event) =>
                      onTextFont(event.target.value as EditorFont)
                    }
                  >
                    <option value="Geologica">Geologica</option>
                    <option value="Golos Text">Golos Text</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                  </Select>
                </label>
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.textSize}
                  <Input
                    standalone
                    density="dense"
                    aria-label={c.textSize}
                    type="number"
                    min={8}
                    max={512}
                    value={textSize}
                    onChange={(event) => onTextSize(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.align}
                  <Select
                    standalone
                    density="dense"
                    aria-label={c.align}
                    value={textAlign}
                    onChange={(event) =>
                      onTextAlign(
                        event.target.value as 'left' | 'center' | 'right'
                      )
                    }
                  >
                    <option value="left">
                      {locale === 'ru' ? 'Слева' : 'Left'}
                    </option>
                    <option value="center">
                      {locale === 'ru' ? 'По центру' : 'Center'}
                    </option>
                    <option value="right">
                      {locale === 'ru' ? 'Справа' : 'Right'}
                    </option>
                  </Select>
                </label>
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.textColor}
                  <Select
                    standalone
                    density="dense"
                    aria-label={c.textColor}
                    value={textColor}
                    onChange={(event) => onTextColor(event.target.value)}
                  >
                    <option value="--cf-ink">
                      {locale === 'ru' ? 'Чернила' : 'Ink'}
                    </option>
                    <option value="--cf-accent">
                      {locale === 'ru' ? 'Акцент' : 'Accent'}
                    </option>
                    <option value="--cf-signature">
                      {locale === 'ru' ? 'Подпись' : 'Signature'}
                    </option>
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                <Button
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  onClick={command('add-text', {
                    text: textValue,
                    fontFamily: textFont,
                    fontSize: textSize,
                    textAlign,
                    color: textColor,
                  })}
                >
                  {c.addText}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  onClick={command('edit-text', {
                    text: textValue,
                    fontFamily: textFont,
                    fontSize: textSize,
                    textAlign,
                    color: textColor,
                  })}
                  disabled={!selected}
                >
                  {c.editText}
                </Button>
              </div>
              <div>
                <p className="cf-label-sm mb-[4px]">{c.shapes}</p>
                <div className="grid grid-cols-2 gap-[8px]">
                  <Button
                    type="button"
                    variant="secondary"
                    className={toolButton}
                    onClick={command('add-rectangle', { color: '--cf-accent' })}
                  >
                    {c.rectangle}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={toolButton}
                    onClick={command('add-ellipse', {
                      color: '--cf-signature',
                    })}
                  >
                    {c.ellipse}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={toolButton}
                    onClick={command('add-line', { color: '--cf-ink' })}
                  >
                    {c.line}
                  </Button>
                  <Button
                    type="button"
                    variant={activeMode === 'draw' ? 'primary' : 'secondary'}
                    className={toolButton}
                    onClick={() =>
                      onMode(activeMode === 'draw' ? null : 'draw')
                    }
                  >
                    {c.draw}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-[8px]">
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.drawColor}
                  <Select
                    standalone
                    density="dense"
                    aria-label={c.drawColor}
                    value={drawColor}
                    onChange={(event) => onDrawColor(event.target.value)}
                  >
                    <option value="--cf-ink">
                      {locale === 'ru' ? 'Чернила' : 'Ink'}
                    </option>
                    <option value="--cf-accent">
                      {locale === 'ru' ? 'Акцент' : 'Accent'}
                    </option>
                    <option value="--cf-signature">
                      {locale === 'ru' ? 'Подпись' : 'Signature'}
                    </option>
                  </Select>
                </label>
                <label className="cf-label-sm flex flex-col gap-[4px]">
                  {c.drawWidth}
                  <Input
                    standalone
                    density="dense"
                    aria-label={c.drawWidth}
                    type="number"
                    min={1}
                    max={64}
                    value={drawWidth}
                    onChange={(event) =>
                      onDrawWidth(Number(event.target.value))
                    }
                  />
                </label>
              </div>
            </fieldset>
          </aside>
          <main
            className="flex min-h-[320px] min-w-0 items-center justify-center overflow-auto bg-cf-surface-subtle p-[16px]"
            aria-label={c.canvas}
          >
            <div className="relative max-h-full max-w-full overflow-auto border border-cf-border-strong bg-cf-surface-raised">
              <canvas
                ref={canvasRef}
                aria-label={
                  locale === 'ru' ? 'Холст изображения' : 'Image canvas'
                }
              />
              {busy && (
                <div
                  className="cf-body-md absolute inset-0 flex items-center justify-center bg-cf-surface-raised"
                  role="status"
                >
                  {c.loading}
                </div>
              )}
            </div>
          </main>
          <aside
            aria-label={c.layers}
            className="min-w-0 border-t border-cf-border bg-cf-surface p-[12px] lg:overflow-y-auto lg:border-s lg:border-t-0"
          >
            <h2 className="cf-label-md mb-[8px]">{c.layers}</h2>
            <div className="flex flex-col gap-[8px]">
              {snapshot.layers.map((layer) => (
                <Button
                  key={layer.id}
                  type="button"
                  variant={layer.selected ? 'primary' : 'secondary'}
                  className={`${toolButton} justify-start`}
                  onClick={command('select-layer', { id: layer.id })}
                >
                  {layer.name}
                </Button>
              ))}
            </div>
            <div className="mt-[12px] grid grid-cols-2 gap-[8px]">
              <Button
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={command('raise-layer')}
                disabled={!selected || disabled}
              >
                {c.up}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={command('lower-layer')}
                disabled={!selected || disabled}
              >
                {c.down}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={command('front-layer')}
                disabled={!selected || disabled}
              >
                {c.front}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={command('back-layer')}
                disabled={!selected || disabled}
              >
                {c.back}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className={`${toolButton} col-span-2`}
                onClick={command('delete-layer')}
                disabled={
                  !selected ||
                  snapshot.selectedLayerId === 'source-image' ||
                  disabled
                }
              >
                {c.remove}
              </Button>
            </div>
            <h2 className="cf-label-md mb-[8px] mt-[16px]">{c.presets}</h2>
            <div className="flex flex-col gap-[8px]">
              {(
                Object.keys(SOCIAL_PRESETS) as (keyof typeof SOCIAL_PRESETS)[]
              ).map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="secondary"
                  className={toolButton}
                  disabled={disabled}
                  onClick={command('apply-preset', SOCIAL_PRESETS[preset])}
                >
                  {c[preset]}
                </Button>
              ))}
            </div>
            <label className="cf-label-sm mt-[16px] flex flex-col gap-[4px]">
              {c.format}
              <Select
                standalone
                aria-label={c.format}
                value={format}
                onChange={(event) =>
                  onFormat(event.target.value as RasterFormat)
                }
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
              </Select>
            </label>
            {/* Decided by source format, not by reading pixels: a 20-megapixel
                alpha scan costs more than the warning is worth, and the answer
                would still be wrong the moment a transparent shape is drawn on
                an opaque photo. JPEG sources cannot be transparent, so this
                never fires falsely on the one case it would annoy. */}
            {format === 'image/jpeg' &&
              (sourceType === 'image/png' || sourceType === 'image/webp') && (
                <p
                  role="status"
                  className="cf-caption mt-[8px] text-cf-warning"
                >
                  {c.jpegAlpha}
                </p>
              )}
          </aside>
        </div>
        <div
          className="cf-caption min-h-[24px] border-t border-cf-border bg-cf-surface px-[16px] py-[4px]"
          aria-live="polite"
          aria-label={c.status}
        >
          {status ||
            (dirty
              ? locale === 'ru'
                ? 'Есть несохранённые изменения'
                : 'Unsaved changes'
              : '')}
        </div>
        {error && (
          <div
            role="alert"
            className="cf-body-sm border-t border-cf-danger bg-cf-danger-soft px-[16px] py-[8px] text-cf-danger"
          >
            {error}
          </div>
        )}
      </div>
      {confirmDiscard && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-[16px]"
          style={{ background: 'var(--cf-backdrop)' }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            className="w-full max-w-[420px] rounded-[12px] bg-cf-surface-raised p-[20px]"
            style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
          >
            <h2 id="discard-title" className="cf-heading-sm">
              {c.discardTitle}
            </h2>
            <div className="mt-[16px] flex flex-wrap justify-end gap-[8px]">
              <Button
                ref={keepButtonRef}
                type="button"
                variant="secondary"
                className={toolButton}
                onClick={onKeep}
              >
                {c.keep}
              </Button>
              <Button
                ref={discardButtonRef}
                type="button"
                variant="destructive"
                className={toolButton}
                onClick={onDiscard}
              >
                {c.discard}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
