'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Link from '@tiptap/extension-link';
import { History } from '@tiptap/extension-history';
import { docToStored, storedToDoc } from './adaptation-rich-text.doc';

/**
 * Поле правки адаптации на TipTap 3 (`97dq.46`).
 *
 * Библиотека та же, что у редактора поста (`new-launch/editor.tsx`), и те же
 * её расширения — но только те, которые хранимое тело умеет записать: абзац,
 * жирное и ссылка адресом. Курсива и подчёркивания здесь нет намеренно: в
 * теле для них нет знака, и выделение, которое не доживёт до канала, было бы
 * обещанием, которое продукт не сдержит.
 *
 * Снаружи поле говорит только хранимой формой (`**жирный**`): перевод туда и
 * обратно живёт в `adaptation-rich-text.doc.ts`, и автосохранение, счётчик и
 * строка качества видят ровно то, что видели до редактора.
 *
 * Экземпляр редактора отдаётся наверх через `onEditor`, потому что кнопки
 * «Ж» и «Ссылка» стоят в общей полосе инструментов рамки, а не внутри поля.
 */
export function AdaptationRichText({
  value,
  onChange,
  ariaLabel,
  onEditor,
  autoFocus = false,
}: {
  value: string;
  onChange: (stored: string) => void;
  ariaLabel: string;
  onEditor?: (editor: Editor | null) => void;
  autoFocus?: boolean;
}) {
  const latest = useRef(onChange);
  latest.current = onChange;

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Вставка адреса поверх выделения сделала бы слова ссылкой, а тело
        // хранит ссылку только адресом: слова остались бы, адрес пропал бы.
        linkOnPaste: false,
        defaultProtocol: 'https',
        protocols: ['http', 'https'],
        HTMLAttributes: {
          class: 'text-cf-accent underline underline-offset-2',
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      History.configure({ depth: 100, newGroupDelay: 500 }),
    ],
    content: storedToDoc(value),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        'data-editor-field': 'true',
        // The inset is pulled back out by the negative margin, so the text
        // stands where the read view has it and the focus ring moves out
        // instead: with no inset the words touched the ring (twelfth stand
        // walk, 04-editor-open-d).
        class:
          '-mx-[8px] -my-[4px] px-[8px] py-[4px] min-h-[160px] max-w-[calc(72ch+16px)] rounded-[4px] cf-body-lg text-cf-ink [overflow-wrap:anywhere] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
      },
    },
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => {
      latest.current(docToStored(current.getJSON()));
    },
  });

  // Текст мог смениться снаружи: другой вариант, «Убрать следы ИИ», откат
  // сохранения. Поле догоняет его, не посылая правку обратно.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (docToStored(editor.getJSON()) === value) return;
    editor.commands.setContent(storedToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} />;
}

export default AdaptationRichText;
