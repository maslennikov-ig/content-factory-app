'use client';

import React from 'react';
import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  type InterfaceReviewContext,
} from '../../interface-review/fixture-contract';
import { appMono, appSans, editorText } from '../../../styles/fonts';
import { ImageEditorModal } from './image-editor-modal';
import { ImageEditorSurface, type EditorUiState } from './image-editor-surface';
import type { EditorSnapshot } from './types';

export const scene = defineInterfaceReviewScene({
  id: 'image-editor/editor',
  states: [
    'loading',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ],
  fixture: {
    source: {
      id: 'review-source',
      name: 'field-notes.png',
      originalName: 'field-notes.png',
      path: 'synthetic-local-image',
      thumbnail: null,
      alt: 'Desert field notes',
    },
    text: 'Привет, мир',
  },
});

const selectedSnapshot: EditorSnapshot = {
  revision: 3,
  width: 1080,
  height: 1350,
  canUndo: true,
  canRedo: true,
  selectedLayerId: 'cyrillic-text',
  layers: [
    {
      id: 'cyrillic-text',
      name: 'Привет, мир',
      type: 'i-text',
      selected: true,
    },
    { id: 'shape', name: 'Rectangle', type: 'rect', selected: false },
    {
      id: 'source-image',
      name: 'Source image',
      type: 'image',
      selected: false,
    },
  ],
};

const blank = (state: EditorUiState): EditorSnapshot =>
  state === 'loading'
    ? {
        ...selectedSnapshot,
        layers: [],
        selectedLayerId: null,
        canUndo: false,
        canRedo: false,
      }
    : selectedSnapshot;

function StaticReviewEditor({ context }: { context: InterfaceReviewContext }) {
  const state = context.state as EditorUiState;
  return (
    <ImageEditorSurface
      locale={context.locale}
      state={state}
      snapshot={blank(state)}
      format="image/png"
      sourceType="image/png"
      width={1080}
      height={1350}
      aspectLocked
      textValue="Привет, мир"
      textFont="Geologica"
      textSize={48}
      textAlign="left"
      textColor="--cf-ink"
      drawColor="--cf-accent"
      drawWidth={8}
      status={
        state === 'success'
          ? context.locale === 'ru'
            ? 'Новая копия сохранена'
            : 'New copy saved'
          : undefined
      }
      error={
        state === 'error'
          ? context.locale === 'ru'
            ? 'Не удалось загрузить копию. Редактор остаётся открытым.'
            : 'The copy could not be uploaded. The editor stays open.'
          : undefined
      }
      dirty={state !== 'success'}
      onCommand={() => {}}
      onClose={() => {}}
      onSave={() => {}}
      onFormat={() => {}}
      onWidth={() => {}}
      onHeight={() => {}}
      onAspectLock={() => {}}
      onText={() => {}}
      onTextFont={() => {}}
      onTextSize={() => {}}
      onTextAlign={() => {}}
      onTextColor={() => {}}
      onDrawColor={() => {}}
      onDrawWidth={() => {}}
      onMode={() => {}}
    />
  );
}

export function ImageEditorReviewScene({
  context,
}: {
  context: InterfaceReviewContext;
}) {
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <div
        className={`${appSans.variable} ${appMono.variable} ${editorText.variable} ${appSans.className} min-h-screen`}
        data-product-surface="image-editor"
        data-surface-state={context.state}
        data-review-network="local-only"
        data-review-upload="in-memory"
        data-review-cyrillic="Привет, мир"
      >
        {context.state === 'default' ? (
          <ImageEditorInteractiveReview locale={context.locale} />
        ) : (
          <StaticReviewEditor context={context} />
        )}
      </div>
    </InterfaceReviewFrame>
  );
}

export const ImageEditorInteractiveReview = ({
  locale = 'ru',
}: {
  locale?: 'en' | 'ru';
}) => {
  const [receipt, setReceipt] = React.useState({
    type: '',
    bytes: 0,
    filename: '',
    savedId: '',
  });
  const [downloadUrl, setDownloadUrl] = React.useState('');
  React.useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl]
  );
  return (
    <div
      data-review-original-id={scene.fixture.source.id}
      data-review-export-type={receipt.type}
      data-review-export-bytes={receipt.bytes}
      data-review-export-name={receipt.filename}
      data-review-saved-id={receipt.savedId}
    >
      <ImageEditorModal
        locale={locale}
        source={scene.fixture.source}
        upload={async (blob, filename) => {
          setDownloadUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(blob);
          });
          setReceipt((current) => ({
            ...current,
            type: blob.type,
            bytes: blob.size,
            filename,
          }));
          return {
            ...scene.fixture.source,
            id: 'review-edited',
            name: filename,
            originalName: filename,
            path: '/interface-review/image-editor/in-memory.png',
          };
        }}
        onSaved={(media) =>
          setReceipt((current) => ({ ...current, savedId: media.id }))
        }
        onClose={() => {}}
        sourceLoader={async (_url, signal) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1080;
          const context = canvas.getContext('2d')!;
          context.fillStyle = getComputedStyle(
            document.documentElement
          ).getPropertyValue('--cf-surface-raised');
          context.fillRect(0, 0, 1080, 1080);
          context.fillStyle = getComputedStyle(
            document.documentElement
          ).getPropertyValue('--cf-accent');
          context.fillRect(72, 72, 936, 936);
          const image = new Image();
          image.src = canvas.toDataURL('image/png');
          await image.decode();
          return {
            image,
            width: 1080,
            height: 1080,
            type: 'image/png',
            bytes: 1,
            dispose: () => {
              image.src = '';
            },
          };
        }}
      />
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={receipt.filename}
          data-review-export-download
        >
          Download review export
        </a>
      )}
    </div>
  );
};

export const Scene = ImageEditorReviewScene;
