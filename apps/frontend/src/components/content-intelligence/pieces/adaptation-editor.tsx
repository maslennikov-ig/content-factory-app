'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Textarea } from '@contentfactory/react/form/textarea';
import {
  CloseIcon,
  InsertMediaIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { formatStoredMarkup } from './adaptation-markup';
import {
  insertText,
  readLinkAddress,
  toggleBold,
  visibleLength,
  type AdaptationImageV1,
  type TextEdit,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * Текст адаптации, который правят руками (`97dq.37`, §3.2).
 *
 * Хранится текст с одним знаком выделения — `**жирный**`, — и правится он
 * же: панель «Ж / ссылка / картинка» пишет в ту же разметку, которую сервер
 * превращает в `<strong>` перед публикацией. Своего редактора с HTML здесь
 * нет намеренно: второе представление текста разошлось бы с тем, что уйдёт в
 * канал.
 *
 * По умолчанию текст показан так, как его прочтут, — жирным, без звёздочек.
 * «Показать разметку» открывает поле правки с исходными знаками; «Ж» и
 * «ссылка», нажатые на показанном тексте, сами открывают поле, потому что
 * выделять им больше нечего.
 *
 * Счётчик считает то, что увидит читатель, — звёздочки выделения в него не
 * входят — и сравнивает с пределом площадки. Превышение сказано словами и
 * цветом: публикацию оно не запрещает здесь, это решает дверь расписания.
 */
export function AdaptationEditor({
  locale,
  platformLabel,
  value,
  onChange,
  maxLength,
  readOnly = false,
  image,
  onPickImage,
  onRemoveImage,
  draftId,
}: {
  locale: PiecesLocale;
  /** Имя площадки для доступных имён: «Текст поста для Telegram». */
  platformLabel: string;
  value: string;
  onChange: (text: string) => void;
  /** Предел площадки в знаках; неизвестен — счётчик без «из N». */
  maxLength: number | null;
  readOnly?: boolean;
  image?: AdaptationImageV1 | null;
  onPickImage?: () => void;
  onRemoveImage?: () => void;
  /** Метка для стенда и тестов: какая адаптация сейчас в поле. */
  draftId?: string;
}) {
  const t = piecesCopy[locale];
  const [raw, setRaw] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const selection = useRef<{ start: number; end: number }>({
    start: value.length,
    end: value.length,
  });

  const count = visibleLength(value);
  const over = maxLength !== null && maxLength > 0 && count > maxLength;

  const remember = () => {
    const node = field.current;
    if (node)
      selection.current = {
        start: node.selectionStart ?? value.length,
        end: node.selectionEnd ?? value.length,
      };
  };

  const apply = (edit: TextEdit) => {
    onChange(edit.text);
    selection.current = { start: edit.start, end: edit.end };
    window.setTimeout(() => {
      const node = field.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(edit.start, edit.end);
    });
  };

  const bold = () => {
    if (!raw) {
      // На показанном тексте выделять нечего: открываем поле, и следующее
      // нажатие «Ж» обернёт то, что человек выделит в нём.
      setRaw(true);
      window.setTimeout(() => field.current?.focus());
      return;
    }
    remember();
    apply(toggleBold(value, selection.current.start, selection.current.end));
  };

  const insertLink = () => {
    const address = readLinkAddress(link);
    if (!address) {
      setLinkError(true);
      return;
    }
    apply(
      insertText(value, selection.current.start, selection.current.end, address)
    );
    setLink('');
    setLinkError(false);
    setLinkOpen(false);
  };

  const tool = 'min-w-[32px]';

  return (
    <div
      data-adaptation-editor={draftId ?? 'text'}
      className="flex min-w-0 flex-col rounded-[8px] border border-cf-border bg-cf-surface"
    >
      {!readOnly ? (
        <div
          role="toolbar"
          aria-label={t.toolbarLabel}
          className="flex min-w-0 flex-wrap items-center gap-[4px] border-b border-cf-border px-[8px] py-[4px]"
        >
          <Button
            type="button"
            variant="quiet"
            density="dense"
            className={tool}
            aria-label={t.toolBold}
            title={t.toolBold}
            data-editor-tool="bold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={bold}
          >
            <span aria-hidden="true" className="cf-label-md">
              {t.toolBoldGlyph}
            </span>
          </Button>
          <Button
            type="button"
            variant="quiet"
            density="dense"
            className={tool}
            aria-label={t.toolLink}
            title={t.toolLink}
            aria-expanded={linkOpen}
            data-editor-tool="link"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              remember();
              if (!raw) setRaw(true);
              setLinkOpen((open) => !open);
            }}
          >
            <LinkGlyph />
          </Button>
          {onPickImage ? (
            <Button
              type="button"
              variant="quiet"
              density="dense"
              className={tool}
              aria-label={t.toolImage}
              title={t.toolImage}
              data-editor-tool="image"
              onClick={onPickImage}
            >
              <InsertMediaIcon aria-hidden="true" />
            </Button>
          ) : null}
          <span className="min-w-[8px] flex-1" />
          <span
            data-editor-counter={over ? 'over' : 'within'}
            className={clsx(
              'cf-caption tabular-nums',
              over ? 'text-cf-danger' : 'text-cf-ink-muted'
            )}
          >
            {maxLength ? t.counter(count, maxLength) : t.counterNoMax(count)}
          </span>
          <Button
            type="button"
            variant="quiet"
            density="dense"
            aria-pressed={raw}
            data-adaptation-markup={raw ? 'raw' : 'formatted'}
            onClick={() => setRaw((shown) => !shown)}
          >
            {raw ? t.hideMarkup : t.showMarkup}
          </Button>
        </div>
      ) : null}

      {linkOpen && !readOnly ? (
        <div className="flex min-w-0 flex-wrap items-end gap-[8px] border-b border-cf-border px-[12px] py-[8px]">
          <Input
            standalone
            density="dense"
            label={t.linkAddress}
            placeholder={t.linkPlaceholder}
            value={link}
            error={linkError ? t.linkInvalid : undefined}
            fieldClassName="min-w-0 flex-1"
            onChange={(event) => {
              setLink(event.target.value);
              setLinkError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                insertLink();
              }
            }}
          />
          <div className="flex gap-[8px] pb-[4px]">
            <Button
              type="button"
              variant="secondary"
              density="dense"
              disabled={!link.trim()}
              onClick={insertLink}
            >
              {t.linkInsert}
            </Button>
            <Button
              type="button"
              variant="quiet"
              density="dense"
              onClick={() => {
                setLinkOpen(false);
                setLinkError(false);
              }}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-[12px] p-[16px]">
        {raw && !readOnly ? (
          <Textarea
            ref={field}
            standalone
            layout="composer"
            aria-label={t.editorLabel(platformLabel)}
            value={value}
            data-editor-field="true"
            fieldClassName="w-full"
            className="w-full cf-body-md [overflow-wrap:anywhere]"
            onChange={(event) => onChange(event.target.value)}
            onSelect={remember}
            onKeyUp={remember}
            onClick={remember}
          />
        ) : (
          <article
            data-intake-draft="true"
            data-piece-draft-id={draftId}
            className="max-w-[72ch] whitespace-pre-wrap cf-body-lg text-cf-ink [overflow-wrap:anywhere]"
          >
            {formatStoredMarkup(value)}
          </article>
        )}

        {image ? (
          <figure
            data-editor-image="true"
            className="flex min-w-0 items-start gap-[12px]"
          >
            {image.path ? (
              <img
                src={image.path}
                alt={t.imageAlt}
                className="size-[96px] shrink-0 rounded-[8px] border border-cf-border object-cover"
              />
            ) : null}
            <figcaption className="flex min-w-0 flex-col gap-[8px]">
              <span className="cf-caption text-cf-ink-muted">
                {t.imageAttached}
              </span>
              {onRemoveImage && !readOnly ? (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  className="self-start"
                  onClick={onRemoveImage}
                >
                  <CloseIcon aria-hidden="true" />
                  {t.imageRemove}
                </Button>
              ) : null}
            </figcaption>
          </figure>
        ) : null}

        {over ? (
          <p role="status" className="cf-body-sm text-cf-danger">
            {t.overLimit(count - (maxLength ?? 0))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Звено цепи: 16 px, штрих `currentColor`, как значки клетки. */
function LinkGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.5 9.5l3-3" />
      <path d="M7.2 4.6l1-1a2.6 2.6 0 013.7 3.7l-1 1" />
      <path d="M8.8 11.4l-1 1a2.6 2.6 0 01-3.7-3.7l1-1" />
    </svg>
  );
}

export default AdaptationEditor;
