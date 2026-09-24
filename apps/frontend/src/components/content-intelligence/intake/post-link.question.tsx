'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Panel } from '@contentfactory/react/layout';
import { FieldLabel } from '../../ui/field-label';
import { Segmented } from '../../ui/segmented';
import {
  POST_LINK_TEXT_MAX,
  postLinkTextOf,
  readLinkAddress,
} from '../pieces/pieces.adapter';
import { piecesCopy } from '../pieces/pieces.copy';
import { intakeCopy } from './intake.copy';

/**
 * «Какую ссылку поставить в пост?» (`content-factory-next-97dq.75`,
 * thirteenth walk, E1).
 *
 * Owner: «это не обязательно модель спрашивает, это может быть
 * детерминированный вопрос… там же он может и передумать». So the question
 * is fixed, not generated, and stands next to the generated questions of the
 * piece. It is asked when a channel the piece goes to allows links; the
 * server decides that (`PieceDetailV1.linkQuestion`). Two answers: «Без
 * ссылки», or an http(s) address. Until «Дальше» nothing is written, so
 * switching between the two is changing one's mind, not an edit.
 *
 * One composition (`97dq.89`, fifteenth walk, A1: «нужно и «Сохранить
 * ответ» нажать, и «Дальше». Странно же это выглядит»): while the piece has
 * open questions, the link question stands inside their card
 * (`PostLinkFields` through `PieceQuestions`) and is saved by the card's one
 * «Дальше» together with the other answers. Alone — reopened, or asked after
 * the other questions — it keeps its own «Дальше». There is no separate
 * «Сохранить ответ» anywhere.
 *
 * `initial` — the answer already given, when the author reopened the
 * question to change it; then «Оставить как было» closes it untouched.
 *
 * «Текст ссылки» (`97dq.79`, fourteenth walk, B2) — optional, under the
 * address: the words that carry the link where a channel puts links on
 * words. Empty — the words are picked by meaning.
 */
/** What the fields hold, and how to read them as an answer. */
export type PostLinkDraft = {
  choice: 'none' | 'own';
  address: string;
  words: string;
  invalid: boolean;
  /**
   * Grows on every edit of the fields: a message about the last save
   * belongs to the revision it was about, and an edit retires it.
   */
  revision: number;
  /** Grows on every read of a wrong address: the field takes focus. */
  invalidTick: number;
  /** Nothing edited since the fields were filled from `initial`. */
  pristine: boolean;
  setChoice: (next: 'none' | 'own') => void;
  setAddress: (next: string) => void;
  setWords: (next: string) => void;
  /**
   * The answer the fields hold: `null` — nothing to save yet (an empty
   * address: the question stays open, like any unanswered one);
   * `'invalid'` — an address that is not http(s), marked on the field.
   */
  read: () => { url: string | null; text?: string } | null | 'invalid';
};

export function usePostLinkDraft(
  initial?: { url: string | null; text?: string | null } | null,
  /**
   * The saved answer the fields start from, as a key. When it changes — the
   * question was reopened, or a new answer was saved — the fields are filled
   * again from `initial` (`97dq.89` review, F2): otherwise a draft made while
   * the question was closed would show empty fields over a saved answer.
   */
  resetKey?: string
): PostLinkDraft {
  const choiceOf = (from: typeof initial): 'none' | 'own' =>
    from && from.url === null ? 'none' : 'own';
  const [choice, setChoiceState] = useState<'none' | 'own'>(choiceOf(initial));
  const [address, setAddressState] = useState(initial?.url ?? '');
  const [words, setWordsState] = useState(initial?.text ?? '');
  const [invalid, setInvalid] = useState(false);
  const [revision, setRevision] = useState(0);
  const [invalidTick, setInvalidTick] = useState(0);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    // Adjusting state to a changed prop during render: React re-renders at
    // once, before the stale fields are ever painted.
    setSeenKey(resetKey);
    setChoiceState(choiceOf(initial));
    setAddressState(initial?.url ?? '');
    setWordsState(initial?.text ?? '');
    setInvalid(false);
    setRevision(0);
  }

  const setChoice = useCallback((next: 'none' | 'own') => {
    setChoiceState(next);
    setInvalid(false);
    setRevision((value) => value + 1);
  }, []);
  const setAddress = useCallback((next: string) => {
    setAddressState(next);
    setInvalid(false);
    setRevision((value) => value + 1);
  }, []);
  const setWords = useCallback((next: string) => {
    setWordsState(next);
    setRevision((value) => value + 1);
  }, []);

  const read = useCallback((): ReturnType<PostLinkDraft['read']> => {
    if (choice === 'none') return { url: null };
    if (!address.trim()) return null;
    const url = readLinkAddress(address);
    if (!url) {
      setInvalid(true);
      setInvalidTick((value) => value + 1);
      return 'invalid';
    }
    const text = postLinkTextOf(words);
    return text ? { url, text } : { url };
  }, [address, choice, words]);

  return {
    choice,
    address,
    words,
    invalid,
    revision,
    invalidTick,
    pristine: revision === 0,
    setChoice,
    setAddress,
    setWords,
    read,
  };
}

/**
 * The question and its fields, without a button: the owner of the draft
 * decides what saves it — the questions card's «Дальше», or the standalone
 * question's own.
 */
export function PostLinkFields({
  locale,
  draft,
  disabled = false,
  onEnter,
}: {
  locale: 'ru' | 'en';
  draft: PostLinkDraft;
  disabled?: boolean;
  /** Enter in a field: the same step as «Дальше». */
  onEnter?: () => void;
}) {
  const t = intakeCopy[locale];
  const baseId = useId();
  const addressRef = useRef<HTMLInputElement | null>(null);
  // A wrong address is marked at the field and the field takes focus: the
  // step stays where it is, and the person is already where the fix goes.
  useEffect(() => {
    if (draft.invalidTick > 0) addressRef.current?.focus();
  }, [draft.invalidTick]);
  const enter = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter' && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };
  return (
    <div data-piece-link-question="true" className="flex min-w-0 flex-col gap-[12px]">
      <FieldLabel
        id={`${baseId}-question`}
        label={t.postLinkQuestion}
        hint={t.postLinkQuestionHint}
        hintLabel={t.profileHintFor(t.postLinkQuestion)}
      />
      <Segmented<'none' | 'own'>
        label={t.postLinkChoice}
        value={draft.choice}
        data-piece-link-choice={draft.choice}
        options={[
          { value: 'none', label: t.postLinkNone },
          { value: 'own', label: t.postLinkOwn },
        ]}
        onChange={draft.setChoice}
      />
      {draft.choice === 'own' ? (
        <>
          <Input
            ref={addressRef}
            standalone
            density="dense"
            name="piece-post-link"
            type="url"
            inputMode="url"
            label={t.postLinkAddress}
            placeholder={t.postLinkPlaceholder}
            value={draft.address}
            disabled={disabled}
            error={draft.invalid ? t.postLinkInvalid : undefined}
            fieldClassName="min-w-0 max-w-[480px]"
            onChange={(event) => draft.setAddress(event.target.value)}
            onKeyDown={enter}
          />
          <div className="flex min-w-0 max-w-[480px] flex-col gap-[4px]">
            <FieldLabel
              htmlFor={`${baseId}-text`}
              label={t.postLinkText}
              hint={t.postLinkTextHint}
              hintLabel={t.profileHintFor(t.postLinkText)}
            />
            <Input
              standalone
              density="dense"
              id={`${baseId}-text`}
              name="piece-post-link-text"
              maxLength={POST_LINK_TEXT_MAX}
              placeholder={t.postLinkTextPlaceholder}
              value={draft.words}
              disabled={disabled}
              onChange={(event) => draft.setWords(event.target.value)}
              onKeyDown={enter}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Saves a read answer through `onAnswer`; `false` — not saved. */
export const savePostLink = (
  answer: { url: string | null; text?: string },
  onAnswer: (url: string | null, text?: string) => Promise<boolean>
): Promise<boolean> =>
  (answer.text ? onAnswer(answer.url, answer.text) : onAnswer(answer.url)).catch(
    () => false
  );

export function PostLinkQuestion({
  locale,
  initial,
  onAnswer,
  onKeep,
}: {
  locale: 'ru' | 'en';
  initial?: { url: string | null; text?: string | null } | null;
  /** Writes the answer; `false` — it was not saved. */
  onAnswer: (url: string | null, text?: string) => Promise<boolean>;
  /** Present when an answer exists: close without changing it. */
  onKeep?: () => void;
}) {
  const t = intakeCopy[locale];
  const draft = usePostLinkDraft(initial);
  const [saving, setSaving] = useState(false);
  /** The revision a save failed on; an edit after it retires the message. */
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const failed = failedAt !== null && failedAt === draft.revision;

  const submit = async () => {
    const answer = draft.read();
    if (!answer || answer === 'invalid') return;
    const revision = draft.revision;
    setSaving(true);
    setFailedAt(null);
    const ok = await savePostLink(answer, onAnswer);
    setSaving(false);
    if (!ok) setFailedAt(revision);
  };

  return (
    <Panel
      className="min-w-0"
      contentClassName="flex min-w-0 flex-col gap-[12px]"
    >
      <PostLinkFields
        locale={locale}
        draft={draft}
        disabled={saving}
        onEnter={() => void submit()}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
        <Button
          type="button"
          variant="primary"
          density="dense"
          loading={saving}
          loadingLabel={t.postLinkSaving}
          disabled={saving || (draft.choice === 'own' && !draft.address.trim())}
          data-piece-link-save="true"
          onClick={() => void submit()}
        >
          {/* The same word and key as the questions card: one step, one name. */}
          {piecesCopy[locale].interviewSend}
        </Button>
        {onKeep ? (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            disabled={saving}
            onClick={onKeep}
          >
            {t.postLinkKeep}
          </Button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.postLinkFailed}
        </p>
      ) : null}
    </Panel>
  );
}

export default PostLinkQuestion;
