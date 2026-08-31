'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { Hint } from '@contentfactory/react/layout/hint';
import { Dialog } from '../ui/layers';
import type { AvatarKind } from './voice-avatars.screen';
import type { VoiceLocale } from './voice-copy';

/**
 * The first step of making an avatar, asked before anything is written.
 *
 * «Создать аватар» used to POST an empty row and leave a card called «Без
 * имени» at the bottom of the list, where the only thing it offered was
 * «Собрать образцы». Nothing had been decided at that point except that a row
 * now existed — so the button did not start the work, it created a chore.
 *
 * Two answers are enough to start, and they are the two the product cannot
 * infer. The name is what every other screen will call this voice. The kind is
 * the one thing the model behaves differently on — a person writes «я», a
 * brand writes «мы» — and it is asked here rather than buried in a card menu
 * because changing it later changes every text already planned in that voice.
 *
 * The step after this one is the analysis, and it is not duplicated here: the
 * dialog closes onto the avatar's own page, which already knows that a voice
 * with no corpus needs the collection wizard and opens it. A second copy of
 * that flow inside a modal is a second place for it to be wrong.
 */

const copy = {
  ru: {
    // Своё имя, отличное от подписи рядом: подсказка про «Имя» и само поле
    // «Имя» — два разных элемента, и одинаковое имя делает их неразличимыми.
    hint: (subject: string) => `Подсказка: ${subject}`,
    title: 'Новый аватар',
    lead: 'Аватар — тот, от чьего лица пишутся тексты. Дайте ему имя и скажите, человек это или бренд; тексты для разбора соберём на следующем шаге.',
    name: 'Имя',
    namePlaceholder: 'Например, Алексей Ким или Отдел заботы',
    nameHint:
      'Так этот голос будет называться в календаре, в черновиках и в списке аватаров. Имя можно поменять в любой момент — оно ни на что в текстах не влияет.',
    kind: 'Кто это',
    kindHint:
      'Единственное, что здесь меняет сами тексты. Человек пишет от «я», бренд — от «мы». Поменять можно позже, но уже написанные тексты не перепишутся.',
    person: 'Человек',
    personBody: 'Пишет от первого лица: «я считаю», «я проверил».',
    brand: 'Бренд',
    brandBody: 'Пишет от лица команды: «мы выпустили», «у нас».',
    next: 'Создать и собрать тексты',
    cancel: 'Отмена',
    nameRequired: 'Напишите имя — по нему аватар будет видно в списке.',
  },
  en: {
    hint: (subject: string) => `Hint: ${subject}`,
    title: 'New avatar',
    lead: 'An avatar is whoever the texts are written as. Give it a name and say whether it is a person or a brand; the texts to measure it from come on the next step.',
    name: 'Name',
    namePlaceholder: 'Alexey Kim, or Customer Care',
    nameHint:
      'This is what the voice is called in the calendar, in drafts and in the avatar list. It can be changed at any time and affects nothing in the texts.',
    kind: 'Who this is',
    kindHint:
      'The only answer here that changes the texts. A person writes as "I", a brand as "we". It can be changed later, but texts already written are not rewritten.',
    person: 'Person',
    personBody: 'Writes in the first person: "I think", "I checked".',
    brand: 'Brand',
    brandBody: 'Writes as the team: "we shipped", "our".',
    next: 'Create and collect texts',
    cancel: 'Cancel',
    nameRequired: 'Write a name — it is how the avatar is found in the list.',
  },
} as const;

export function VoiceAvatarCreateDialog({
  open,
  locale,
  busy = false,
  failure,
  onCancel,
  onCreate,
}: {
  open: boolean;
  locale: VoiceLocale;
  busy?: boolean;
  /** A refusal from the server, shown where the decision was made. */
  failure?: string;
  onCancel: () => void;
  onCreate: (input: { name: string; kind: AvatarKind }) => void;
}) {
  const t = copy[locale];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AvatarKind>('PERSON');
  const [touched, setTouched] = useState(false);

  // Opening the dialog a second time must not offer the first attempt's
  // half-typed name back as though it had been saved.
  useEffect(() => {
    if (!open) return;
    setName('');
    setKind('PERSON');
    setTouched(false);
  }, [open]);

  const missingName = touched && !name.trim();
  const nameErrorId = 'voice-avatar-create-name-error';

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t.title}
      footer={
        <div className="flex flex-wrap justify-end gap-[8px]">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            form="voice-avatar-create"
            variant="primary"
            loading={busy}
          >
            {t.next}
          </Button>
        </div>
      }
    >
      <form
        id="voice-avatar-create"
        data-voice-avatar-create="open"
        className="flex min-w-0 flex-col gap-[16px]"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          const trimmed = name.trim();
          if (!trimmed) return;
          onCreate({ name: trimmed, kind });
        }}
      >
        <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.lead}
        </p>

        {failure ? (
          <p
            role="alert"
            className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
          >
            {failure}
          </p>
        ) : null}

        <div className="flex min-w-0 flex-col gap-[8px]">
          <span className="flex items-center gap-[8px]">
            <label
              htmlFor="voice-avatar-create-name"
              className="cf-label-sm uppercase text-cf-ink-muted"
            >
              {t.name}
            </label>
            <Hint label={t.hint(t.name)}>{t.nameHint}</Hint>
          </span>
          <Input
            standalone
            removeError
            id="voice-avatar-create-name"
            name="name"
            value={name}
            maxLength={120}
            placeholder={t.namePlaceholder}
            aria-invalid={missingName || undefined}
            aria-describedby={missingName ? nameErrorId : undefined}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          {/* The row is always present so the form does not jump by a line
              when the message appears. */}
          <p
            id={nameErrorId}
            className={clsx(
              'min-h-[16px] cf-caption',
              missingName ? 'text-cf-danger' : 'text-cf-ink-muted'
            )}
          >
            {missingName ? t.nameRequired : ''}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-[8px]">
          <span className="flex items-center gap-[8px]">
            <span
              id="voice-avatar-create-kind"
              className="cf-label-sm uppercase text-cf-ink-muted"
            >
              {t.kind}
            </span>
            <Hint label={t.hint(t.kind)}>{t.kindHint}</Hint>
          </span>
          <RadioGroup
            value={kind}
            onChange={(value) => setKind(value as AvatarKind)}
            aria-labelledby="voice-avatar-create-kind"
            className="grid min-w-0 gap-[8px] sm:grid-cols-2"
          >
            {(
              [
                ['PERSON', t.person, t.personBody],
                ['BRAND', t.brand, t.brandBody],
              ] as const
            ).map(([value, label, body]) => (
              <RadioOption
                key={value}
                value={value}
                layout="card"
                density="card"
                className={clsx(
                  'flex min-w-0 flex-col items-start gap-[4px] rounded-[8px] border p-[12px] text-start',
                  'transition-colors duration-state motion-reduce:transition-none',
                  kind === value
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-cf-border-control bg-cf-surface hover:bg-cf-surface-subtle'
                )}
              >
                <span
                  className={clsx(
                    'cf-label-md',
                    kind === value ? 'text-cf-accent' : 'text-cf-ink'
                  )}
                >
                  {label}
                </span>
                <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                  {body}
                </span>
              </RadioOption>
            ))}
          </RadioGroup>
        </div>
      </form>
    </Dialog>
  );
}

export default VoiceAvatarCreateDialog;
