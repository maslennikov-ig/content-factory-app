'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Hint } from '@contentfactory/react/layout/hint';
import { VoiceWizardContainer } from './voice-wizard.container';
import { VoiceProfileContainer } from './voice-profile.container';
import { AVATAR_ROUTES, mapAvatars } from './voice-avatars.adapter';
import { readVoice } from './voice-profile.adapter';
import { voiceCopy, type VoiceLocale } from './voice-copy';
import { VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * One avatar's own page.
 *
 * What used to happen here happened on top of the list, on a piece of state
 * nothing outside the component could see. That cost three ordinary things:
 * the browser's back button left the section instead of returning to the list,
 * a reload dropped the reader onto the list again, and there was no address to
 * send anybody who should look at this particular voice. All three are what an
 * address buys, and an avatar — long-lived, named, edited over months — is
 * exactly the kind of object that should have one.
 *
 * The frame here deliberately does not repeat the section's tab strip. A
 * breadcrumb says where this page sits and leads back in one click; a second
 * copy of the five tabs would invite a person to switch to «Источники» from
 * inside an avatar, which is a different page pretending to be this one.
 */

const copy = {
  ru: {
    section: 'Контент',
    avatars: 'Аватары',
    rebuild: 'Собрать голос заново',
    rebuildHint:
      'Мастер заново измерит голос по вашим текстам и предложит новую версию. Действующая версия работает всё это время и меняется только когда вы примете новую.',
    rebuildNote:
      'Мастер соберёт новую версию голоса из ваших текстов. Действующий голос работает, пока новая версия не принята.',
    back: 'Вернуться к аватару',
    loading: 'Открываем аватар…',
    missing: 'Такого аватара нет',
    missingBody:
      'Возможно, его удалили или ссылка ведёт в другое пространство. Вернитесь к списку и выберите аватар заново.',
    toList: 'Ко всем аватарам',
  },
  en: {
    section: 'Content',
    avatars: 'Avatars',
    rebuild: 'Build the voice again',
    rebuildHint:
      'The wizard measures the voice from your texts again and offers a new version. The version in force keeps working throughout and changes only when you accept the new one.',
    rebuildNote:
      'The wizard measures a new version from your texts. The voice in force keeps working until a new version is accepted.',
    back: 'Back to the avatar',
    loading: 'Opening the avatar…',
    missing: 'No such avatar',
    missingBody:
      'It may have been deleted, or the link points at another workspace. Go back to the list and pick an avatar again.',
    toList: 'All avatars',
  },
} as const;

export function VoiceAvatarScreen({ avatarId }: { avatarId: string }) {
  const request = useFetch();
  const { language } = useVariables();
  const locale: VoiceLocale = String(language ?? 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
  const t = copy[locale];
  const words = voiceCopy[locale];

  const [rebuilding, setRebuilding] = useState(false);

  const list = useSWR(
    AVATAR_ROUTES.list,
    () => readVoice(request, AVATAR_ROUTES.list),
    { revalidateOnFocus: false }
  );
  const view = useMemo(() => mapAvatars(list.data), [list.data]);
  const avatar = view.avatars.find((one) => one.id === avatarId);

  /**
   * Whether this reader may rebuild, asked of the server rather than assumed.
   *
   * The same `canCreate` the tab used before the page existed. It is read from
   * the overview and not from the avatar list's `canManage`, because those two
   * answer different questions — managing the list is renaming and deleting,
   * creating is starting a run that costs a model call.
   */
  const overview = useSWR(
    `${VOICE_API_BASE}/overview`,
    (path: string) => readVoice(request, path),
    { revalidateOnFocus: false }
  );
  const canCreate = Boolean(
    (overview.data as { permissions?: { canCreate?: boolean } } | undefined)
      ?.permissions?.canCreate
  );

  const name = avatar?.name ?? words.avatarsNoName;

  /**
   * An avatar with no corpus opens on the collection step, not on a passport.
   *
   * This is the second half of «Создать аватар»: the dialog asked the two
   * questions it could, and the answer to the third — what does this person
   * write like — is measured, not typed. A passport with every line empty is
   * not an alternative worth showing first.
   *
   * `rebuilding` is the explicit ask, and it is kept separate so that pressing
   * «Собрать голос заново» over a working voice reads the same as arriving at
   * an empty one, while «Вернуться к аватару» stays absent where there is
   * genuinely nothing to return to.
   */
  const collecting = rebuilding || Boolean(avatar && !avatar.analysed);

  return (
    <div
      data-production-surface="content/avatar"
      data-voice-avatar={avatarId}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-cf-canvas text-cf-ink"
    >
      <header className="border-b border-cf-border bg-cf-surface px-[20px] py-[20px] md:px-[24px]">
        <nav aria-label={t.section} className="cf-label-sm text-cf-ink-muted">
          <Link
            href="/content"
            className="rounded-[4px] underline underline-offset-2 hover:text-cf-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-focus focus-visible:ring-offset-2"
          >
            {t.avatars}
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-cf-ink">{name}</span>
        </nav>

        <div className="mt-[8px] flex flex-wrap items-center justify-between gap-[12px]">
          <h1 className="min-w-0 cf-heading-lg text-cf-ink [text-wrap:balance]">
            {name}
          </h1>
          {canCreate && !collecting ? (
            <span className="flex items-center gap-[8px]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRebuilding(true)}
              >
                {t.rebuild}
              </Button>
              {/* «Собрать голос заново» names what starts and not what it does
                  to the voice already in force — which is the question a
                  person actually hesitates over before pressing it. */}
              <Hint side="start" label={words.hintFor(t.rebuild)}>
                {t.rebuildHint}
              </Hint>
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-[16px] p-[20px] md:p-[24px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0">
        {list.isLoading ? (
          <p className="cf-body-sm text-cf-ink-muted" aria-busy="true">
            {t.loading}
          </p>
        ) : !avatar && !list.error ? (
          // A link to an avatar this workspace does not hold is a dead end,
          // and saying so beats rendering four empty screens about nothing.
          <div
            data-voice-avatar-missing="true"
            className="flex flex-col items-start gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
          >
            <h2 className="cf-heading-md text-cf-ink">{t.missing}</h2>
            <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.missingBody}
            </p>
            <Link
              href="/content"
              className="inline-flex min-h-[40px] items-center rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink transition-colors duration-state hover:bg-cf-surface-subtle motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-focus focus-visible:ring-offset-2"
            >
              {t.toList}
            </Link>
          </div>
        ) : collecting ? (
          <>
            {rebuilding ? (
              <div className="flex flex-wrap items-center justify-between gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]">
                <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                  {t.rebuildNote}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRebuilding(false)}
                >
                  {t.back}
                </Button>
              </div>
            ) : null}
            <VoiceWizardContainer avatarId={avatarId} />
          </>
        ) : (
          <VoiceProfileContainer avatarId={avatarId} />
        )}
      </div>
    </div>
  );
}

export default VoiceAvatarScreen;
