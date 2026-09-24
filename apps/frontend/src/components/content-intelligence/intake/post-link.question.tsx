'use client';

import { useId, useState } from 'react';
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
 * ссылки», or an http(s) address. Until «Сохранить ответ» nothing is written,
 * so switching between the two is changing one's mind, not an edit.
 *
 * `initial` — the answer already given, when the author reopened the
 * question to change it; then «Оставить как было» closes it untouched.
 *
 * «Текст ссылки» (`97dq.79`, fourteenth walk, B2) — optional, under the
 * address: the words that carry the link where a channel puts links on
 * words. Empty — the words are picked by meaning.
 */
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
  const baseId = useId();
  const [choice, setChoice] = useState<'none' | 'own'>(
    initial && initial.url === null ? 'none' : 'own'
  );
  const [address, setAddress] = useState(initial?.url ?? '');
  const [words, setWords] = useState(initial?.text ?? '');
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    let url: string | null = null;
    if (choice === 'own') {
      url = readLinkAddress(address);
      if (!url) {
        setInvalid(true);
        return;
      }
    }
    setSaving(true);
    setFailed(false);
    const text = url ? postLinkTextOf(words) : '';
    const ok = await (text ? onAnswer(url, text) : onAnswer(url)).catch(
      () => false
    );
    setSaving(false);
    if (!ok) setFailed(true);
  };

  return (
    <Panel
      className="min-w-0"
      contentClassName="flex min-w-0 flex-col gap-[12px]"
    >
      <div data-piece-link-question="true" className="flex min-w-0 flex-col gap-[12px]">
        <FieldLabel
          id={`${baseId}-question`}
          label={t.postLinkQuestion}
          hint={t.postLinkQuestionHint}
          hintLabel={t.profileHintFor(t.postLinkQuestion)}
        />
        <Segmented<'none' | 'own'>
          label={t.postLinkChoice}
          value={choice}
          data-piece-link-choice={choice}
          options={[
            { value: 'none', label: t.postLinkNone },
            { value: 'own', label: t.postLinkOwn },
          ]}
          onChange={(next) => {
            setChoice(next);
            setInvalid(false);
          }}
        />
        {choice === 'own' ? (
          <>
          <Input
            standalone
            density="dense"
            name="piece-post-link"
            type="url"
            inputMode="url"
            label={t.postLinkAddress}
            placeholder={t.postLinkPlaceholder}
            value={address}
            error={invalid ? t.postLinkInvalid : undefined}
            fieldClassName="min-w-0 max-w-[480px]"
            onChange={(event) => {
              setAddress(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
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
              value={words}
              onChange={(event) => setWords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          </>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <Button
            type="button"
            variant="primary"
            density="dense"
            loading={saving}
            loadingLabel={t.postLinkSaving}
            disabled={saving || (choice === 'own' && !address.trim())}
            data-piece-link-save="true"
            onClick={() => void submit()}
          >
            {t.postLinkSave}
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
      </div>
    </Panel>
  );
}

export default PostLinkQuestion;
