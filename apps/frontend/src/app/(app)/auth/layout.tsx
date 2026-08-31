import { getT } from '@contentfactory/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { Wordmark } from '@contentfactory/frontend/components/ui/brand/wordmark';
import { WorkflowOverview } from '@contentfactory/frontend/components/auth/workflow.overview';

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
          <Wordmark size="lg" />
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
          initialStep={1}
          heading={t(
            'auth_overview_heading',
            'Create content. Publish everywhere. Track what works.'
          )}
          intro={t(
            'auth_overview_intro',
            'Turn one idea into ready-to-publish content, adapt it for every channel, and launch it everywhere at once—without switching tools.'
          )}
          platformProof={t(
            'auth_overview_platform_proof',
            '30+ platforms in one launch—with reach, clicks, and engagement tracked in one place.'
          )}
          steps={[
            {
              title: t('auth_overview_plan_title', 'Plan'),
              body: t(
                'auth_overview_plan_body',
                'See the calendar for every channel and decide what to work on next.'
              ),
            },
            {
              title: t('auth_overview_draft_title', 'Content creation'),
              tabTitle: t('auth_overview_create_tab', 'Create'),
              body: t(
                'auth_overview_draft_body',
                'Build from project knowledge, refine text and media, then adapt the result for every channel.'
              ),
              momentum: {
                availableLabel: t(
                  'auth_overview_available_now_label',
                  'Available now'
                ),
                availableBody: t(
                  'auth_overview_available_now_body',
                  'Web research with cited sources and RSS or Telegram feeds turned into drafts.'
                ),
                nextLabel: t(
                  'auth_overview_coming_next_label',
                  'Next on the roadmap'
                ),
                nextBody: t(
                  'auth_overview_coming_next_body',
                  'A brand voice profile that carries audience, vocabulary, tone, and rules into every draft.'
                ),
              },
            },
            {
              title: t('auth_overview_review_title', 'Review'),
              body: t(
                'auth_overview_review_body',
                'Check each platform preview and resolve validation before anything is queued.'
              ),
            },
            {
              title: t('auth_overview_publish_title', 'Publish and measure'),
              tabTitle: t('schedule', 'Schedule'),
              body: t(
                'auth_overview_publish_body',
                'Launch scheduled posts together and track reach, clicks, and engagement in analytics.'
              ),
            },
          ]}
        />
      </aside>
    </div>
  );
}
