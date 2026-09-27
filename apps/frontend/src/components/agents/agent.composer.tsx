'use client';

import {
  useCallback,
  useId,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import type { FileUIPart } from 'ai';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { FileInput } from '@contentfactory/react/form/file-input';
import { AllowanceHint } from '@contentfactory/frontend/components/ui/allowance-hint';
import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENTS_TOTAL_MAX_BYTES,
  ATTACHMENT_ACCEPT,
  attachmentLimit,
  attachmentMediaType,
  linksIn,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';

/**
 * The composer (`content-factory-next-kcxz.10`, canvas C): text, pasted links
 * and attachments, one allowance line above it (spec §6.2 «Остаток» — the full
 * card only when too little is left, and that is the line's own danger state).
 *
 * Enter sends, Shift+Enter breaks the line. While the agent works the field
 * stays open: the next message waits and goes as soon as the turn ends, and
 * the send button becomes «Остановить».
 */

export type ComposerSubmit = { text: string; files: FileUIPart[] };

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * The file inline, under the type the door reads it as: the browser may have
 * named a `.md` `application/octet-stream`, and the door takes only its own
 * list (review W1 F2).
 */
const inlineAs = async (file: File, mediaType: string) => {
  const url = await readAsDataUrl(file);
  const comma = url.indexOf(';base64,');
  return comma === -1 ? url : `data:${mediaType}${url.slice(comma)}`;
};

export function AgentComposer({
  busy,
  queued,
  onSubmit,
  onStop,
  words,
  autoFocus,
}: {
  /** The agent is answering. */
  busy: boolean;
  /** A message is already waiting for the turn to end. */
  queued: boolean;
  onSubmit: (message: ComposerSubmit) => void;
  onStop: () => void;
  words: AgentWords;
  autoFocus?: boolean;
}) {
  const w = words.composer;
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeId = useId();
  const hintId = useId();

  const links = linksIn(text);
  const canSend = (text.trim().length > 0 || files.length > 0) && !queued;

  const addFiles = useCallback(
    (incoming: readonly File[]) => {
      const next = [...files];
      let total = next.reduce((sum, file) => sum + file.size, 0);
      for (const file of incoming) {
        if (next.length >= AGENT_ATTACHMENT_MAX_FILES) {
          setNotice(w.tooMany(AGENT_ATTACHMENT_MAX_FILES));
          break;
        }
        const mediaType = attachmentMediaType(file);
        if (!mediaType) {
          setNotice(w.unsupported(file.name));
          continue;
        }
        const limit = attachmentLimit(mediaType);
        if (file.size > limit) {
          setNotice(w.tooBig(file.name, limit / 1024));
          continue;
        }
        if (total + file.size > AGENT_ATTACHMENTS_TOTAL_MAX_BYTES) {
          setNotice(w.tooBigTogether(AGENT_ATTACHMENTS_TOTAL_MAX_BYTES / 1024 / 1024));
          continue;
        }
        total += file.size;
        next.push(file);
      }
      setFiles(next);
    },
    [files, w]
  );

  const submit = useCallback(async () => {
    if (!canSend) return;
    const parts = await Promise.all(
      files.map(async (file) => {
        // Checked when it was added; the list only ever holds taken files.
        const mediaType = attachmentMediaType(file) ?? 'text/plain';
        return {
          type: 'file' as const,
          mediaType,
          filename: file.name,
          url: await inlineAs(file, mediaType),
        };
      })
    );
    onSubmit({ text: text.trim(), files: parts });
    setText('');
    setFiles([]);
    setNotice(null);
  }, [canSend, files, onSubmit, text]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  // A pasted picture becomes an attachment; pasted words stay words.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files ?? []);
    if (pasted.length) {
      event.preventDefault();
      addFiles(pasted);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-[8px]">
      <span className="inline-flex min-w-0 items-center gap-[8px] text-cf-ink-muted">
        <AgentGlyph name="gauge" size={14} />
        <AllowanceHint />
      </span>
      <form
        className="flex min-w-0 flex-col gap-[8px]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {files.length || links.length ? (
          <ul className="flex flex-wrap gap-[8px]" aria-label={w.attach}>
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="inline-flex max-w-full items-center gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface ps-[8px] cf-caption text-cf-ink"
              >
                <AgentGlyph name="clip" size={12} />
                <span className="min-w-0 truncate">{file.name}</span>
                <Button
                  iconOnly
                  type="button"
                  variant="quiet"
                  density="dense"
                  aria-label={w.removeFile(file.name)}
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <AgentGlyph name="close" size={12} />
                </Button>
              </li>
            ))}
            {links.map((link) => (
              <li
                key={link}
                title={link}
                className="inline-flex max-w-full items-center gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface px-[8px] py-[4px] cf-caption text-cf-ink-muted"
              >
                <AgentGlyph name="link" size={12} />
                <span className="sr-only">{w.linkNote}:</span>
                <span className="min-w-0 truncate">{hostOf(link)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="sr-only" htmlFor={`${hintId}-field`}>
          {w.label}
        </label>
        <Textarea
          standalone
          id={`${hintId}-field`}
          layout="content"
          value={text}
          autoFocus={autoFocus}
          placeholder={busy ? w.placeholderBusy : w.placeholder}
          aria-describedby={notice ? `${noticeId} ${hintId}` : hintId}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="w-full resize-none"
        />
        <div className="flex min-w-0 items-center gap-[8px]">
          <FileInput
            name="attachments"
            className="shrink-0"
            label={w.attach}
            variant="quiet"
            multiple
            accept={ATTACHMENT_ACCEPT}
            onFiles={addFiles}
          />
          <span className="hidden min-w-0 flex-1 truncate cf-caption text-cf-ink-muted sm:inline">
            {w.attachHint}
          </span>
          <span className="ms-auto inline-flex shrink-0 items-center gap-[8px]">
            {busy ? (
              <Button type="button" variant="secondary" onClick={onStop}>
                <AgentGlyph name="stop" size={14} />
                {w.stop}
              </Button>
            ) : null}
            <Button
              iconOnly
              type="submit"
              aria-label={w.send}
              disabled={!canSend}
            >
              <AgentGlyph name="send" />
            </Button>
          </span>
        </div>
        <p id={hintId} className="sr-only">
          {w.keyboard}
        </p>
        {notice ? (
          <p id={noticeId} role="status" className="cf-caption text-cf-danger">
            {notice}
          </p>
        ) : null}
      </form>
    </div>
  );
}

const hostOf = (link: string) => {
  try {
    const url = new URL(link);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return link;
  }
};
