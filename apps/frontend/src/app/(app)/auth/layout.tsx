import { getT } from '@contentfactory/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { Wordmark } from '@contentfactory/frontend/components/ui/brand/wordmark';
import { WorkflowOverview } from '@contentfactory/frontend/components/auth/workflow.overview';
import { AuthLanguageSwitch } from '@contentfactory/frontend/components/auth/language.switch';

const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <div className="min-h-screen w-full bg-cf-canvas text-cf-ink flex flex-col lg:flex-row">
      <ReturnUrlComponent />

      <main className="flex-1 lg:max-w-[560px] bg-cf-surface border-cf-border lg:border-e flex flex-col">
        <div className="w-full max-w-[420px] mx-auto flex flex-col gap-[24px] px-[24px] py-[40px] lg:py-[64px]">
          {/* `content-factory-next-fn33.39`: the way in had no way to change
              the language. The proxy still decides the first one from
              `Accept-Language`; this is the correction, on the sign-in, the
              registration and the invited registration alike. */}
          <div className="flex items-start justify-between gap-[16px]">
            <Wordmark size="lg" />
            <AuthLanguageSwitch />
          </div>
          {children}
        </div>

        {/* The source offer used to have a place of its own at the foot of this
            column. Someone who never signs in is still owed it under AGPL-3.0
            section 13 — and they are now offered it on every public page, in
            the footer beside the licence, which is both easier to find and not
            a second errand on the one screen whose job is signing in. */}
      </main>

      <aside className="flex flex-1 items-center justify-center border-t border-cf-border px-[24px] py-[40px] lg:border-t-0 lg:px-[48px] lg:py-[64px]">
        <WorkflowOverview
          heading={t(
            'auth_pitch_heading',
            'Posts for your Telegram channel, in your own voice'
          )}
          steps={[
            {
              title: t('auth_pitch_avatar_title', 'Avatar'),
              body: t(
                'auth_pitch_avatar_body',
                'Writes posts the way you write.'
              ),
            },
            {
              title: t('auth_pitch_adapt_title', 'Adaptation'),
              body: t(
                'auth_pitch_adapt_body',
                'Rewrites one thought for each of your channels.'
              ),
            },
            {
              title: t('auth_pitch_plan_title', 'Plan'),
              body: t(
                'auth_pitch_plan_body',
                "Puts the posts into the channel's calendar."
              ),
            },
          ]}
        />
      </aside>
    </div>
  );
}
