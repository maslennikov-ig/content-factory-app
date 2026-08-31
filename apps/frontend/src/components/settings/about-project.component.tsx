'use client';

import React from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { SourceLink } from '@contentfactory/frontend/components/layout/source.link';

/**
 * Settings → About.
 *
 * The AGPL-3.0 section 13 offer, for someone who is signed in. It used to be a
 * permanent row in the navigation rail, where it competed with the product's
 * own destinations on every screen; here it sits next to the two things that
 * make it meaningful — which version this deployment is running, and under
 * which licence — so the link is an answer to a question rather than an errand
 * nobody asked for.
 *
 * `tests/source.archive.test.cjs` holds this panel and the public footer
 * together: between them the source has to stay reachable with a session and
 * without one.
 */
export const AboutProjectComponent = () => {
  const t = useT();
  // The same value the calendar footer prints. It is stamped into the image at
  // build time, so a deployment built without it says nothing rather than
  // claiming a version it cannot know.
  const version = process.env.NEXT_PUBLIC_VERSION || '';

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="cf-heading-lg text-cf-ink">{t('about_project', 'About')}</h3>

      <dl className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
        <div className="flex flex-wrap items-baseline gap-[8px]">
          <dt className="cf-body-sm text-cf-ink-muted">
            {t('about_version', 'Version')}
          </dt>
          <dd className="cf-label-sm text-cf-ink">{version || '—'}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-[8px]">
          <dt className="cf-body-sm text-cf-ink-muted">
            {t('about_licence', 'Licence')}
          </dt>
          <dd className="cf-label-sm text-cf-ink">AGPL-3.0</dd>
        </div>
      </dl>

      <p className="max-w-[70ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t(
          'about_source_body',
          'The complete source of this exact version is available to download, as AGPL-3.0 requires of software you use over a network.'
        )}
      </p>

      <SourceLink className="cf-body-sm text-cf-accent hover:text-cf-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus" />
    </div>
  );
};

export default AboutProjectComponent;
