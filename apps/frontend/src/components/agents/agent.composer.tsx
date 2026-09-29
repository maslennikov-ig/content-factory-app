'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import type { FileUIPart } from 'ai';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Select } from '@contentfactory/react/form/select';
import { FileInput } from '@contentfactory/react/form/file-input';
import { AllowanceHint } from '@contentfactory/frontend/components/ui/allowance-hint';
import {
  containsSecretShape,
  withoutSecretShapes,
} from '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes';
import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENTS_TOTAL_MAX_BYTES,
  ATTACHMENT_ACCEPT,
  attachmentLimit,
  attachmentMediaType,
  linksIn,
  type LibraryUploadReceipt,
  type AgentSamplesUpload,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';
import {
  SAMPLES_ACCEPT,
  SAMPLES_LIMITS,
  isSamplesFile,
  type SamplesSent,
} from './agent.samples';
import { compressLibraryImage } from '@contentfactory/frontend/components/media/library-image-compression';
import {
  MEDIA_LIMITS,
  isLibraryImage,
  keepShownPicture,
  type LibrarySaved,
} from './agent.media';

/**
 * The composer (`content-factory-next-kcxz.10`, canvas C): text, pasted links
 * and attachments, one allowance line above it (spec §6.2 «Остаток» — the full
 * card only when too little is left, and that is the line's own danger state).
 *
 * Enter sends, Shift+Enter breaks the line. While the agent works the field
 * stays open: the next message waits and goes as soon as the turn ends, and
 * the send button becomes «Остановить».
 *
 * A Telegram export or a document (`kcxz.18`) is marked «в образцы аватара»
 * and on sending goes from here straight to the avatar's samples; the message
 * carries only the receipt, never the file (`agent.samples.ts`). The line
 * under the files names that avatar and lets the person pick another (review
 * W3-18 F2); while the agent is answering, the files wait for the turn to end
 * rather than change the corpus an analysis may be reading (F6).
 *
 * A picture (owner decision 28.09.2026, «агент видит картинки») is shown to
 * the AI by default: it goes inline in the message — compressed by the media
 * library's own compressor — and is saved nowhere; this page keeps it under a
 * key the message names, so that when the person wants it on a post the agent
 * asks (`media.keep`) and the page puts it into the library
 * (`agent.media.ts`). A role that may upload can switch a picture on its chip
 * to «в медиатеку» instead (`kcxz.25`): it goes from here straight to the
 * media library through the library's own request, the message carries only
 * the receipt — library ids — and a retry does not upload it twice (review
 * W4-25 F5). The line under the files says which path each takes (F2). Any
 * role may show a picture; only an editor puts one into the library.
 *
 * A message that holds a key shape is not sent (`kcxz.20`): the key is taken
 * out of the field and the notice sends the person to the key card.
 */

/** Which avatar the attached samples go to, and the others to pick from. */
export type SamplesTarget = {
  /** The avatars were read: the line may name them. */
  known: boolean;
  /** The avatars of the workspace, named for the person. */
  options: ReadonlyArray<{ id: string; label: string }>;
  /** The chosen avatar; `null` — the workspace default. */
  value: string | null;
  /** The default avatar's name, when there is one. */
  defaultName: string | null;
  onChange: (avatarId: string | null) => void;
};

export type ComposerSubmit = {
  text: string;
  files: FileUIPart[];
  /** Sample files already added to an avatar: the receipt, not the files. */
  samples?: AgentSamplesUpload;
  /** Pictures already in the media library: the receipt, not the pictures. */
  media?: LibraryUploadReceipt;
};

/** A refusal of the samples upload, in the words the screen has for it. */
export type SamplesFailure = { code: string | null; message: string | null };

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
  uploadSamples,
  samplesTarget,
  samplesAllowed = true,
  uploadMedia,
  mediaAllowed = true,
  describeFailure,
  words,
  autoFocus,
  draft = null,
  onDraftUsed,
}: {
  /** The agent is answering. */
  busy: boolean;
  /** A message is already waiting for the turn to end. */
  queued: boolean;
  onSubmit: (message: ComposerSubmit) => void;
  onStop: () => void;
  /** Sends sample files to the target avatar's door; the receipt comes back. */
  uploadSamples?: (files: File[], avatarId: string | null) => Promise<SamplesSent>;
  /** Where attached samples go; absent — the workspace default, unnamed. */
  samplesTarget?: SamplesTarget;
  /** The role may add samples (the door's `Sections.EDITOR`). */
  samplesAllowed?: boolean;
  /**
   * Puts pictures into the media library; the receipt comes back (`kcxz.25`).
   * `saved`: the pictures already there from an earlier try (review W4-25 F5).
   */
  uploadMedia?: (files: File[], saved: LibrarySaved) => Promise<LibraryUploadReceipt>;
  /** The role may upload media (the library doors' `Sections.EDITOR`). */
  mediaAllowed?: boolean;
  /** The sentence for a refused upload, from the product's error words. */
  describeFailure?: (failure: SamplesFailure) => string;
  words: AgentWords;
  autoFocus?: boolean;
  /**
   * Words to write into the field once, left for the person to send or edit
   * («Сделать в чате», review W3-21 P2-2). Never sent from here.
   */
  draft?: string | null;
  onDraftUsed?: () => void;
}) {
  const w = words.composer;
  const [text, setText] = useState('');
  useEffect(() => {
    if (draft === null) return;
    setText(draft);
    onDraftUsed?.();
  }, [draft, onDraftUsed]);
  const [files, setFiles] = useState<File[]>([]);
  /** Pictures of this message already in the library (review W4-25 F5). */
  const savedPictures = useRef<LibrarySaved>(new Map());
  /** Pictures switched to the library; the rest are shown to the AI (28.09). */
  const [toLibrary, setToLibrary] = useState<ReadonlySet<File>>(() => new Set());
  const canKeepInLibrary = mediaAllowed && !!uploadMedia;
  const goesToLibrary = useCallback(
    (file: File) => isLibraryImage(file) && canKeepInLibrary && toLibrary.has(file),
    [canKeepInLibrary, toLibrary]
  );
  const [notice, setNotice] = useState<string | null>(null);
  /** What is being sent before the message: pictures, then samples. */
  const [uploading, setUploading] = useState<'media' | 'samples' | null>(null);
  /** A line that is not a refusal: the samples went to the default instead. */
  const [info, setInfo] = useState<string | null>(null);
  /** Sample files wait for the agent's answer to end (F6). */
  const [held, setHeld] = useState(false);
  const noticeId = useId();
  const hintId = useId();
  const targetId = useId();

  const links = linksIn(text);
  const hasSamples = files.some(isSamplesFile);
  const viewedPictures = files.filter((file) => isLibraryImage(file) && !goesToLibrary(file));
  const libraryPictures = files.filter(goesToLibrary);
  const canSend =
    (text.trim().length > 0 || files.length > 0) && !queued && !uploading && !held;

  const addFiles = useCallback(
    (incoming: readonly File[]) => {
      setInfo(null);
      const next = [...files];
      const chatFiles = () =>
        next.filter((file) => !isSamplesFile(file) && !isLibraryImage(file));
      const sampleFiles = () => next.filter(isSamplesFile);
      const pictures = () => next.filter(isLibraryImage);
      let total = chatFiles().reduce((sum, file) => sum + file.size, 0);
      let samplesTotal = sampleFiles().reduce((sum, file) => sum + file.size, 0);
      for (const file of incoming) {
        // A Telegram export or a document goes to the avatar's samples, under
        // the avatar door's own ceilings (`kcxz.18`).
        if (isSamplesFile(file)) {
          if (!samplesAllowed || !uploadSamples) {
            setNotice(w.samplesNotAllowed(file.name));
            continue;
          }
          if (sampleFiles().length >= SAMPLES_LIMITS.maxFiles) {
            setNotice(w.tooMany(SAMPLES_LIMITS.maxFiles));
            continue;
          }
          if (file.size > SAMPLES_LIMITS.maxFileBytes) {
            setNotice(w.tooBig(file.name, SAMPLES_LIMITS.maxFileBytes / 1024));
            continue;
          }
          if (samplesTotal + file.size > SAMPLES_LIMITS.maxBatchBytes) {
            setNotice(w.tooBigTogether(SAMPLES_LIMITS.maxBatchBytes / 1024 / 1024));
            continue;
          }
          samplesTotal += file.size;
          next.push(file);
          continue;
        }
        // A picture is shown to the AI (28.09) — compressed on sending — or,
        // switched on its chip, put into the library (`kcxz.25`); either way
        // under the library's own ceiling. Shown, it rides with the files.
        if (isLibraryImage(file)) {
          if (
            pictures().length >= MEDIA_LIMITS.maxFiles ||
            chatFiles().length + pictures().length >= AGENT_ATTACHMENT_MAX_FILES
          ) {
            setNotice(w.tooMany(MEDIA_LIMITS.maxFiles));
            continue;
          }
          if (file.size > MEDIA_LIMITS.maxFileBytes) {
            setNotice(w.tooBig(file.name, MEDIA_LIMITS.maxFileBytes / 1024));
            continue;
          }
          next.push(file);
          continue;
        }
        if (chatFiles().length + pictures().length >= AGENT_ATTACHMENT_MAX_FILES) {
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
    [files, samplesAllowed, uploadSamples, w]
  );

  const send = useCallback(async () => {
    // A key pasted by mistake never leaves the page (`kcxz.20`, spec §1.5):
    // it is taken out of the field, nothing is sent, and the line says where
    // a key goes. The door redacts one again for any other client.
    if (containsSecretShape(text)) {
      setText(withoutSecretShapes(text));
      setInfo(null);
      setNotice(w.keyPasted);
      return;
    }
    const pictureFiles = files.filter(goesToLibrary);
    let media: LibraryUploadReceipt | undefined;
    if (pictureFiles.length && uploadMedia) {
      // Sent first, from here: a refusal keeps the files and the words, and
      // nothing goes to the chat — as with samples below.
      setUploading('media');
      setNotice(null);
      setInfo(null);
      try {
        media = await uploadMedia(pictureFiles, savedPictures.current);
      } catch {
        setNotice(w.mediaFailed);
        return;
      } finally {
        setUploading(null);
      }
    }
    const samplesFiles = files.filter(isSamplesFile);
    let samples: AgentSamplesUpload | undefined;
    if (samplesFiles.length && uploadSamples) {
      // Sent first, from here: a refusal keeps the files and the words, and
      // nothing goes to the chat (no message is spent on a failed upload).
      setUploading('samples');
      setNotice(null);
      setInfo(null);
      const target = samplesTarget?.value ?? null;
      try {
        const sent = await uploadSamples(samplesFiles, target);
        samples = sent.receipt;
        if (sent.fellBack) {
          setInfo(
            w.samplesFellBack(
              samplesTarget?.options.find((one) => one.id === target)?.label ?? null
            )
          );
          samplesTarget?.onChange(null);
        }
      } catch (error) {
        const failure = error as { code?: unknown; message?: unknown };
        setNotice(
          describeFailure?.({
            code: typeof failure?.code === 'string' ? failure.code : null,
            message: typeof failure?.message === 'string' ? failure.message : null,
          }) ?? w.samplesFailed
        );
        return;
      } finally {
        setUploading(null);
      }
    }
    const parts: FileUIPart[] = [];
    // Registered only once the message really leaves (review W4-25 vision F8).
    const shown: Array<[File, string]> = [];
    let inlineBytes = 0;
    for (const file of files) {
      if (isSamplesFile(file) || goesToLibrary(file)) continue;
      if (isLibraryImage(file)) {
        // Shown to the AI: compressed by the library's compressor, inline,
        // under the door's own ceilings; the page keeps the picture so the
        // agent can have it put into the library later (`media.keep`).
        const compressed = await compressLibraryImage(file);
        const mediaType = attachmentMediaType(compressed) ?? attachmentMediaType(file) ?? 'image/png';
        const limit = attachmentLimit(mediaType);
        if (compressed.size > limit) {
          setNotice(w.tooBig(file.name, limit / 1024));
          return;
        }
        inlineBytes += compressed.size;
        if (inlineBytes > AGENT_ATTACHMENTS_TOTAL_MAX_BYTES) {
          setNotice(w.tooBigTogether(AGENT_ATTACHMENTS_TOTAL_MAX_BYTES / 1024 / 1024));
          return;
        }
        const pictureKey = crypto.randomUUID();
        shown.push([file, pictureKey]);
        parts.push({
          type: 'file',
          mediaType,
          filename: file.name,
          url: await inlineAs(compressed, mediaType),
          providerMetadata: { contentFactory: { pictureKey } },
        });
        continue;
      }
      // Checked when it was added; the list only ever holds taken files.
      const mediaType = attachmentMediaType(file) ?? 'text/plain';
      inlineBytes += file.size;
      parts.push({
        type: 'file',
        mediaType,
        filename: file.name,
        url: await inlineAs(file, mediaType),
      });
    }
    for (const [file, pictureKey] of shown) keepShownPicture(file, pictureKey);
    onSubmit({
      text: text.trim(),
      files: parts,
      ...(samples ? { samples } : {}),
      ...(media?.media.length ? { media } : {}),
    });
    setText('');
    setFiles([]);
    setNotice(null);
    savedPictures.current = new Map();
    setToLibrary(new Set());
  }, [describeFailure, files, goesToLibrary, onSubmit, samplesTarget, text, uploadMedia, uploadSamples, w]);

  const submit = useCallback(async () => {
    if (!canSend) return;
    // Samples sent while the agent answers would change the corpus an
    // analysis in this turn may be reading: they wait for the turn (F6).
    if (busy && hasSamples && uploadSamples) {
      setHeld(true);
      return;
    }
    await send();
  }, [busy, canSend, hasSamples, send, uploadSamples]);

  useEffect(() => {
    if (!held || busy) return;
    setHeld(false);
    void send();
  }, [busy, held, send]);

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
                {isSamplesFile(file) ? (
                  <span className="shrink-0 cf-label-sm text-cf-ink-muted">{w.samplesChip}</span>
                ) : isLibraryImage(file) ? (
                  canKeepInLibrary ? (
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      aria-pressed={goesToLibrary(file)}
                      aria-label={w.pictureRoute(file.name, goesToLibrary(file))}
                      disabled={!!uploading || held}
                      onClick={() =>
                        setToLibrary((current) => {
                          const next = new Set(current);
                          if (next.has(file)) next.delete(file);
                          else next.add(file);
                          return next;
                        })
                      }
                    >
                      <span className="cf-label-sm">
                        {goesToLibrary(file) ? w.mediaChip : w.pictureViewChip}
                      </span>
                    </Button>
                  ) : (
                    <span className="shrink-0 cf-label-sm text-cf-ink-muted">{w.pictureViewChip}</span>
                  )
                ) : null}
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
        {viewedPictures.length ? (
          <p className="inline-flex min-w-0 items-start gap-[4px] cf-caption text-cf-ink-muted">
            <AgentGlyph name="image" size={12} />
            <span className="min-w-0">
              {canKeepInLibrary
                ? `${w.pictureViewNote} ${w.pictureViewNoteEditor}`
                : w.pictureViewNote}
            </span>
          </p>
        ) : null}
        {libraryPictures.length ? (
          <p className="inline-flex min-w-0 items-start gap-[4px] cf-caption text-cf-ink-muted">
            <AgentGlyph name="image" size={12} />
            <span className="min-w-0">{w.mediaNote}</span>
          </p>
        ) : null}
        {hasSamples && uploadSamples && samplesTarget?.known ? (
          samplesTarget.options.length || samplesTarget.defaultName !== null ? (
            <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
              <label htmlFor={targetId} className="shrink-0 cf-body-sm text-cf-ink-muted">
                {w.samplesTarget}
              </label>
              <Select
                standalone
                disableForm
                density="dense"
                id={targetId}
                value={samplesTarget.value ?? ''}
                disabled={!!uploading || held}
                fieldClassName="min-w-0 flex-1 sm:flex-none"
                className="w-full min-w-0 sm:w-auto [&>option]:text-cf-ink"
                onChange={(event) => samplesTarget.onChange(event.target.value || null)}
              >
                <option value="">{w.samplesTargetDefault(samplesTarget.defaultName)}</option>
                {samplesTarget.options.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="cf-caption text-cf-ink-muted">{w.samplesTargetFirst}</p>
          )
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
            accept={
              samplesAllowed && uploadSamples
                ? `${ATTACHMENT_ACCEPT},${SAMPLES_ACCEPT}`
                : ATTACHMENT_ACCEPT
            }
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
        {uploading ? (
          <p role="status" aria-live="polite" className="cf-caption text-cf-ink-muted">
            {uploading === 'media' ? w.mediaSending : w.samplesSending}
          </p>
        ) : held ? (
          <p role="status" aria-live="polite" className="cf-caption text-cf-ink-muted">
            {w.samplesHeld}
          </p>
        ) : null}
        {info && !notice ? (
          <p role="status" className="cf-caption text-cf-ink-muted">
            {info}
          </p>
        ) : null}
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
