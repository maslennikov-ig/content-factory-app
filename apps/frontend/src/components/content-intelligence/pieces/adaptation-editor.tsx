'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Editor } from '@tiptap/react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Hint } from '@contentfactory/react/layout/hint';
import {
  CloseIcon,
  EmojiIcon,
  InsertMediaIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { editorToolsFor } from './adaptation-toolbar';
import { formatStoredMarkup } from './adaptation-markup';
import { AdaptationRichText } from './adaptation-rich-text';
import {
  readLinkAddress,
  visibleLength,
  type AdaptationImageV1,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * Текст адаптации, который правят руками (`97dq.37`, §3.2; `97dq.46`).
 *
 * По умолчанию текст показан так, как его прочтут, — жирным, без звёздочек.
 * «Редактировать» открывает поле TipTap на том же месте и с тем же видом:
 * жирное остаётся жирным, адрес — ссылкой. «Готово» возвращает показ.
 * До 23.09.2026 здесь была «Показать разметку» — поле с сырыми `**`, и
 * владелец на одиннадцатом заходе назвал её нелогичной: править хотят текст,
 * а не разметку.
 *
 * Хранится по-прежнему текст с одним знаком выделения — `**жирный**`: его
 * читает сервер, превращая в `<strong>` перед публикацией, и черновик поста.
 * Поле говорит наружу только этой формой (`adaptation-rich-text.doc.ts`),
 * поэтому автосохранение, счётчик и строка качества не заметили замены.
 *
 * Счётчик считает то, что увидит читатель, — звёздочки выделения в него не
 * входят — и сравнивает с пределом площадки. Превышение сказано словами и
 * цветом: публикацию оно не запрещает здесь, это решает дверь расписания.
 *
 * Кнопки панели зависят от формата канала (`97dq.61`): набор берётся из
 * таблицы `adaptation-toolbar.ts`, новый формат — это новая строка там.
 * Эмодзи вставляются туда, где стоит курсор, из той же библиотеки, что в окне
 * поста (`emoji-picker-react`), с поиском и системным шрифтом вместо картинок
 * с CDN.
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
  format,
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
  /** Формат канала — идентификатор провайдера; решает набор кнопок панели. */
  format?: string | null;
}) {
  const t = piecesCopy[locale];
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const onEditor = useCallback((next: Editor | null) => setEditor(next), []);
  const tools = editorToolsFor(format);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRoot = useRef<HTMLSpanElement | null>(null);

  /*
    Щелчок мимо и Escape закрывают выбор эмодзи — тем же порядком, что у
    меню продукта. Фокус возвращается в поле, чтобы следующая буква шла
    туда, где стоял курсор.
  */
  useEffect(() => {
    if (!emojiOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!emojiRoot.current?.contains(event.target as Node))
        setEmojiOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEmojiOpen(false);
      editor?.commands.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiOpen, editor]);

  /** Вставка в позицию курсора: TipTap помнит выделение, пока фокус в поиске. */
  const insertEmoji = (emoji: string) => {
    editor?.chain().focus().insertContent(emoji).run();
    setEmojiOpen(false);
  };

  const count = visibleLength(value);
  const over = maxLength !== null && maxLength > 0 && count > maxLength;
  const inEdit = editing && !readOnly;
  const ready = inEdit && editor !== null;

  const closeLink = () => {
    setLinkOpen(false);
    setLinkError(false);
  };

  const leave = () => {
    closeLink();
    setEmojiOpen(false);
    setLink('');
    setEditing(false);
  };

  /** Курсор стоит в ссылке: панель правит её, а не вставляет новую. */
  const inLink = ready && editor.isActive('link');

  /*
    «Ссылка» открывает панель адреса. Стоит курсор в ссылке — в поле её адрес
    и рядом «Убрать ссылку»; иначе поле пустое (`97dq.52`).
  */
  const toggleLinkPanel = () => {
    if (linkOpen) {
      closeLink();
      return;
    }
    const current = inLink ? editor?.getAttributes('link')?.href : '';
    setLink(typeof current === 'string' ? current : '');
    setLinkError(false);
    setLinkOpen(true);
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setLink('');
    closeLink();
  };

  const insertLink = () => {
    const address = readLinkAddress(link);
    if (!address) {
      setLinkError(true);
      return;
    }
    if (editor) {
      /*
        Выделенные слова или ссылка под курсором становятся ссылкой на этот
        адрес: тело хранит её парой «слова и адрес» (`97dq.52`). Без выделения
        адрес встаёт после курсора самим собой — как вставлялся и раньше.
      */
      const { from, to } = editor.state.selection;
      if (from !== to || editor.isActive('link')) {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: address })
          .run();
        setLink('');
        closeLink();
        return;
      }
      const doc = editor.state.doc;
      const before = doc.textBetween(Math.max(0, to - 1), to, '\n', '\n');
      const after = doc.textBetween(
        to,
        Math.min(doc.content.size, to + 1),
        '\n',
        '\n'
      );
      const pad = before && !/\s/u.test(before) ? ' ' : '';
      const tail = after && !/\s/u.test(after) ? ' ' : '';
      const nodes = [
        ...(pad ? [{ type: 'text', text: pad }] : []),
        {
          type: 'text',
          text: address,
          marks: [{ type: 'link', attrs: { href: address } }],
        },
        ...(tail ? [{ type: 'text', text: tail }] : []),
      ];
      editor
        .chain()
        .focus()
        .setTextSelection(to)
        .insertContent(nodes)
        .unsetMark('link')
        .run();
    }
    setLink('');
    closeLink();
  };

  const tool = 'min-w-[32px]';
  const boldActive = ready && editor.isActive('bold');
  const italicActive = ready && editor.isActive('italic');
  const underlineActive = ready && editor.isActive('underline');

  return (
    <div
      data-adaptation-editor={draftId ?? 'text'}
      data-adaptation-mode={inEdit ? 'edit' : 'read'}
      className="flex min-w-0 flex-col rounded-[8px] border border-cf-border bg-cf-surface"
    >
      {!readOnly ? (
        <div
          role="toolbar"
          aria-label={t.toolbarLabel}
          className="flex min-w-0 flex-wrap items-center gap-[4px] border-b border-cf-border px-[8px] py-[4px]"
        >
          {inEdit ? (
            <>
              {tools.includes('bold') ? (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  className={tool}
                  aria-label={t.toolBold}
                  title={t.toolBold}
                  aria-pressed={boldActive}
                  disabled={!ready}
                  data-editor-tool="bold"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <span aria-hidden="true" className="cf-label-md">
                    {t.toolBoldGlyph}
                  </span>
                </Button>
              ) : null}
              {tools.includes('italic') ? (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  className={tool}
                  aria-label={t.toolItalic}
                  title={t.toolItalic}
                  aria-pressed={italicActive}
                  disabled={!ready}
                  data-editor-tool="italic"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <span aria-hidden="true" className="cf-label-md italic">
                    {t.toolItalicGlyph}
                  </span>
                </Button>
              ) : null}
              {tools.includes('underline') ? (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  className={tool}
                  aria-label={t.toolUnderline}
                  title={t.toolUnderline}
                  aria-pressed={underlineActive}
                  disabled={!ready}
                  data-editor-tool="underline"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    editor?.chain().focus().toggleUnderline().run()
                  }
                >
                  <span
                    aria-hidden="true"
                    className="cf-label-md underline underline-offset-2"
                  >
                    {t.toolUnderlineGlyph}
                  </span>
                </Button>
              ) : null}
              {tools.includes('link') ? (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  className={tool}
                  aria-label={t.toolLink}
                  title={t.toolLink}
                  aria-expanded={linkOpen}
                  aria-pressed={inLink}
                  disabled={!ready}
                  data-editor-tool="link"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleLinkPanel}
                >
                  <LinkGlyph />
                </Button>
              ) : null}
              {tools.includes('emoji') ? (
                <span ref={emojiRoot} className="relative inline-flex">
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    className={tool}
                    aria-label={t.toolEmoji}
                    title={t.toolEmoji}
                    aria-expanded={emojiOpen}
                    aria-haspopup="dialog"
                    disabled={!ready}
                    data-editor-tool="emoji"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setEmojiOpen((open) => !open)}
                  >
                    <EmojiIcon aria-hidden="true" />
                  </Button>
                  {emojiOpen ? (
                    <span
                      role="dialog"
                      aria-label={t.toolEmoji}
                      data-editor-emoji-picker="true"
                      className="absolute start-0 top-[calc(100%+4px)] z-[300] max-w-[calc(100vw-32px)] rounded-[8px] shadow-menu"
                    >
                      <EmojiPicker
                        open
                        width={320}
                        height={360}
                        // Системный шрифт, а не картинки с cdn.jsdelivr.net:
                        // открытый выбор иначе сообщал бы CDN, кто пишет пост.
                        emojiStyle={EmojiStyle.NATIVE}
                        theme={
                          typeof window !== 'undefined' &&
                          window.localStorage?.getItem('mode') === 'light'
                            ? Theme.LIGHT
                            : Theme.DARK
                        }
                        searchPlaceholder={t.emojiSearch}
                        autoFocusSearch
                        skinTonesDisabled
                        lazyLoadEmojis
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(data) => insertEmoji(data.emoji)}
                      />
                    </span>
                  ) : null}
                </span>
              ) : null}
            </>
          ) : null}
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
            variant={inEdit ? 'secondary' : 'quiet'}
            density="dense"
            data-adaptation-edit={inEdit ? 'done' : 'edit'}
            onClick={() => (inEdit ? leave() : setEditing(true))}
          >
            {inEdit ? t.editDone : t.editText}
          </Button>
        </div>
      ) : null}

      {linkOpen && inEdit ? (
        <div
          data-editor-link-panel={inLink ? 'edit' : 'add'}
          className="flex min-w-0 flex-wrap items-end gap-[8px] border-b border-cf-border px-[12px] py-[8px]"
        >
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
              if (event.key === 'Escape') {
                event.preventDefault();
                closeLink();
                editor?.commands.focus();
              }
            }}
          />
          <div className="flex items-center gap-[8px] pb-[4px]">
            <Hint label={t.linkHintLabel}>{t.linkHint}</Hint>
            <Button
              type="button"
              variant="secondary"
              density="dense"
              disabled={!link.trim()}
              data-editor-link-save="true"
              onClick={insertLink}
            >
              {inLink ? t.linkSave : t.linkInsert}
            </Button>
            {inLink ? (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                data-editor-link-remove="true"
                onClick={removeLink}
              >
                {t.linkRemove}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="quiet"
              density="dense"
              onClick={closeLink}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-[12px] p-[16px]">
        {inEdit ? (
          <div data-piece-draft-id={draftId} className="min-w-0">
            {!ready ? (
              <p
                role="status"
                aria-busy="true"
                className="max-w-[72ch] whitespace-pre-wrap cf-body-lg text-cf-ink-muted [overflow-wrap:anywhere]"
              >
                <span className="sr-only">{t.editOpening}</span>
                {formatStoredMarkup(value)}
              </p>
            ) : null}
            <AdaptationRichText
              value={value}
              onChange={onChange}
              ariaLabel={t.editorLabel(platformLabel)}
              onEditor={onEditor}
              autoFocus
            />
          </div>
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
