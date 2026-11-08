'use client';

import { FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLaunchStore } from './store';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { useMediaDirectory } from '@contentfactory/react/helpers/use.media.directory';
import { hasExtension } from '@contentfactory/helpers/utils/has.extension';
import { VideoFrame } from '@contentfactory/react/helpers/video.frame';
import { MediaComponentInner } from '@contentfactory/frontend/components/launches/helpers/media.settings.component';
import { Button } from '@contentfactory/react/form/button';

export const useMediaSettingsValues = () =>
  useLaunchStore(
    useShallow(
      (state) =>
        state.internal.find((item) => item.integration.id === state.current)
          ?.integrationValue ?? state.global
    )
  );

/** One editor for the same media fields in the text toolbar and settings panel. */
export const MediaSettingsSection: FC<{ disabled?: boolean }> = ({
  disabled = false,
}) => {
  const t = useT();
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();
  const values = useMediaSettingsValues();
  const current = useLaunchStore((state) => state.current);
  const customized = useLaunchStore((state) =>
    state.internal.some((item) => item.integration.id === state.current)
  );
  if (!values.some((value) => value.media?.length)) return null;
  const readOnly = disabled || (current !== 'global' && !customized);

  return (
    <section className="flex flex-col gap-3 border-b border-cf-border p-3">
      <h3 className="cf-label-md text-cf-ink">
        {t('media_settings', 'Media Settings')}
      </h3>
      <p className="cf-body-sm text-cf-muted">
        {t(
          'media_settings_provider_support',
          'Reels and YouTube support cover images; Reels and TikTok support video frames. Each platform applies the settings it supports.'
        )}
      </p>
      {values.map((value, index) =>
        !value.media?.length ? null : (
          <div key={value.id} className="flex flex-col gap-2">
            {values.length > 1 && (
              <span className="cf-caption text-cf-muted">
                {index === 0
                  ? t('post', 'Post')
                  : `${t('comment', 'Comment')} ${index}`}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {value.media.map((media, mediaIndex) => (
                <Button
                  key={media.id}
                  variant="quiet"
                  disabled={readOnly}
                  className="min-w-0 gap-2"
                  onClick={() =>
                    modals.openModal({
                      title: t('media_settings', 'Media Settings'),
                      children: (close) => (
                        <MediaComponentInner
                          media={media as any}
                          onClose={close}
                          onSelect={(updated) => {
                            if (!updated) return;
                            // Read at save time so unrelated media edits are retained.
                            const state = useLaunchStore.getState();
                            const internal = state.internal.find(
                              (item) => item.integration.id === current
                            );
                            const latest =
                              internal?.integrationValue ?? state.global;
                            const at = latest.findIndex(
                              (item) => item.id === value.id
                            );
                            if (at < 0) return;
                            const next = latest[at].media.map((item) =>
                              item.id === media.id
                                ? { ...item, ...updated }
                                : item
                            );
                            if (internal)
                              state.setInternalValueMedia(current, at, next);
                            else if (current === 'global')
                              state.setGlobalValueMedia(at, next);
                          }}
                        />
                      ),
                    })
                  }
                >
                  <span
                    aria-hidden="true"
                    className="block h-6 w-6 shrink-0 overflow-hidden rounded border border-cf-border"
                  >
                    {hasExtension(media.path, 'mp4') ? (
                      <VideoFrame url={mediaDirectory.set(media.path)} />
                    ) : (
                      <img
                        src={mediaDirectory.set(media.path)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>
                  <span className="cf-body-sm">{`${t(
                    'media_settings',
                    'Media Settings'
                  )} ${mediaIndex + 1}`}</span>
                </Button>
              ))}
            </div>
          </div>
        )
      )}
    </section>
  );
};
