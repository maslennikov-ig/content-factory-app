'use client';

import { Fragment } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * The library, and the recut panel that opens from it.
 *
 * The panel is the same panel at every width. At 1024 it sits over the
 * content, at 390 it becomes a bottom sheet — layouts of one action rather
 * than three implementations of it, which is the difference between a
 * component and three components that drift.
 *
 * "Что изменится" is arithmetic and says so: length 312 → 1 400, lists inline
 * → bulleted, photos 1 → 3. A change that loses something is marked as losing
 * it rather than described as adaptation.
 *
 * Nothing here reaches a platform. The recut prepares text; publishing sends
 * it, the same as for any other post, and the line under the panel says so
 * because a person about to press a button deserves to know which button it is.
 */

export type MaterialRow = Readonly<{
  code: string;
  title: string;
  format: string;
  postCount: number;
  queuedCount?: number;
  date: string;
  voiceVersion?: string;
}>;

export type RecutPlatform = 'site' | 'telegram' | 'vk' | 'newsletter';

export type RecutChange = Readonly<{
  aspect: 'length' | 'lists' | 'images' | 'links';
  from: string;
  to: string;
  lossy: boolean;
}>;

export type DerivedPost = Readonly<{
  platform: RecutPlatform;
  state: 'DRAFT' | 'QUEUED' | 'PUBLISHED';
  date: string;
}>;

export type VoiceMaterialsState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

const PLATFORMS: readonly RecutPlatform[] = [
  'site',
  'telegram',
  'vk',
  'newsletter',
];

const platformLabel = (
  platform: RecutPlatform,
  t: (typeof voiceCopy)['ru'] | (typeof voiceCopy)['en']
) =>
  ({
    site: t.platformSite,
    telegram: t.platformTelegram,
    vk: t.platformVk,
    newsletter: t.platformNewsletter,
  }[platform]);

const aspectLabel = (
  aspect: RecutChange['aspect'],
  t: (typeof voiceCopy)['ru'] | (typeof voiceCopy)['en']
) =>
  ({
    length: t.aspectLength,
    lists: t.aspectLists,
    images: t.aspectImages,
    links: t.aspectLinks,
  }[aspect]);

const shapeWord = (
  value: string,
  t: (typeof voiceCopy)['ru'] | (typeof voiceCopy)['en']
) =>
  value === 'bullets'
    ? t.listsBullets
    : value === 'inline'
    ? t.listsInline
    : value;

export function VoiceMaterialsScreen({
  locale,
  state = 'default',
  materials,
  expandedCode,
  derived = [],
  recut,
  onReuse,
  onExpand,
  onPlatform,
  onOpenEditor,
  onCancelRecut,
  notice,
}: {
  locale: VoiceLocale;
  state?: VoiceMaterialsState;
  materials: readonly MaterialRow[];
  expandedCode?: string;
  derived?: readonly DerivedPost[];
  /** Present while the recut panel is open. */
  recut?: {
    code: string;
    platform: RecutPlatform;
    voiceVersion?: string;
    changes: readonly RecutChange[];
  };
  onReuse?: (code: string) => void;
  onExpand?: (code: string) => void;
  onPlatform?: (platform: RecutPlatform) => void;
  onOpenEditor?: () => void;
  onCancelRecut?: () => void;
  notice?: string;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const readOnly = state === 'restricted';

  return (
    <section
      data-voice-surface="materials"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.materialsTitle}
        </h2>
        <p className="mt-[4px] cf-caption text-cf-ink-muted">
          {t.materialsSubtitle(materials.length)}
        </p>
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {notice ??
            (locale === 'ru'
              ? 'Библиотека не загрузилась. Материалы на месте — попробуйте ещё раз.'
              : 'The library did not load. The material is intact — try again.')}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {notice ??
            (locale === 'ru'
              ? 'Перекройка готова, черновик открыт в редакторе.'
              : 'The recut is ready and the draft is open in the editor.')}
        </p>
      ) : null}

      {materials.length === 0 ? (
        <div
          className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
          data-voice-materials-empty="true"
        >
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.materialsEmptyTitle}
          </h3>
          <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.materialsEmptyBody}
          </p>
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-[8px] border border-cf-border bg-cf-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-cf-border">
                {[
                  t.materialsColumnCode,
                  t.materialsColumnTitle,
                  t.materialsColumnFormat,
                  t.materialsColumnPosts,
                  t.materialsColumnDate,
                  '',
                ].map((column, index) => (
                  <th
                    key={column || index}
                    className={clsx(
                      'px-[12px] py-[8px] cf-label-sm uppercase text-cf-ink-muted',
                      index === 3 || index === 4 ? 'text-end' : 'text-start'
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => {
                const open = expandedCode === material.code;
                return (
                  <Fragment key={material.code}>
                    <tr
                      data-voice-material={material.code}
                      data-voice-material-open={open ? 'true' : undefined}
                      className={clsx(
                        'border-b border-cf-border',
                        open && 'bg-cf-accent-soft'
                      )}
                    >
                      <td className="px-[12px] py-[8px] align-top">
                        <Button
                          type="button"
                          variant="quiet"
                          aria-expanded={open}
                          onClick={() => onExpand?.(material.code)}
                        >
                          {material.code}
                        </Button>
                      </td>
                      <td className="px-[12px] py-[8px] align-top cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                        {material.title}
                      </td>
                      <td className="px-[12px] py-[8px] align-top cf-caption text-cf-ink-muted">
                        {material.format}
                      </td>
                      <td className="px-[12px] py-[8px] text-end align-top cf-label-sm text-cf-ink">
                        {material.postCount}
                      </td>
                      <td className="px-[12px] py-[8px] text-end align-top cf-caption text-cf-ink-muted">
                        {material.date}
                      </td>
                      <td className="px-[12px] py-[8px] text-end align-top">
                        {readOnly ? null : (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => onReuse?.(material.code)}
                          >
                            {t.materialsReuse}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr
                        key={`${material.code}-origin`}
                        data-voice-material-origin={material.code}
                      >
                        <td colSpan={6} className="px-[12px] pb-[12px]">
                          <p className="cf-label-sm uppercase text-cf-ink-muted">
                            {t.materialsDerived}
                          </p>
                          <ul className="mt-[8px] flex flex-wrap gap-[8px]">
                            {derived.map((post) => (
                              <li
                                key={`${post.platform}-${post.date}`}
                                className="rounded-[4px] border border-cf-border bg-cf-surface-subtle px-[8px] py-[4px] cf-caption text-cf-ink-muted"
                              >
                                {platformLabel(post.platform, t)} ·{' '}
                                {post.state === 'QUEUED'
                                  ? t.materialsQueued
                                  : post.date}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {recut ? (
        <aside
          data-voice-recut={recut.platform}
          aria-label={t.recutTitle}
          className="min-w-0 rounded-[8px] border border-cf-accent bg-cf-surface p-[16px]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
            <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
              {t.recutTitle}
            </h3>
            {recut.voiceVersion ? (
              // The voice that will write the recut, named in the header of
              // the thing it is about to write.
              <span className="cf-label-sm text-cf-ink-muted">
                {t.recutVoice(recut.voiceVersion)}
              </span>
            ) : null}
          </div>

          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            {PLATFORMS.map((platform) => (
              <Button
                key={platform}
                type="button"
                variant={platform === recut.platform ? 'primary' : 'secondary'}
                onClick={() => onPlatform?.(platform)}
              >
                {platformLabel(platform, t)}
              </Button>
            ))}
          </div>

          <p className="mt-[16px] cf-label-sm uppercase text-cf-ink-muted">
            {t.recutWhatChanges}
          </p>

          {recut.changes.length === 0 ? (
            <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.recutNothingChanges}
            </p>
          ) : (
            <ul className="mt-[8px] flex flex-col gap-[4px]">
              {recut.changes.map((change) => (
                <li
                  key={change.aspect}
                  data-voice-change={change.aspect}
                  data-voice-change-lossy={change.lossy ? 'true' : undefined}
                  className="cf-body-sm text-cf-ink"
                >
                  {aspectLabel(change.aspect, t)}:{' '}
                  <span className="text-cf-ink-muted">
                    {shapeWord(change.from, t)}
                  </span>{' '}
                  → {shapeWord(change.to, t)}
                  {change.lossy ? (
                    // Cutting text away is a loss, and it is named as one
                    // rather than described as adaptation.
                    <span className="ms-[8px] cf-caption text-cf-warning">
                      {t.recutLossy}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-[16px] flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="primary"
              disabled={state === 'disabled'}
              onClick={onOpenEditor}
            >
              {t.recutOpenEditor}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancelRecut}>
              {t.recutCancel}
            </Button>
          </div>

          <p className="mt-[12px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.recutDelivery}
          </p>
        </aside>
      ) : null}
    </section>
  );
}
