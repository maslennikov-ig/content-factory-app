'use client';

import {
  SyntheticDemo,
  DEMO_STARTER_TEMPLATE,
} from '@contentfactory/frontend/components/public-saas/synthetic-demo';
import { EmailFirstSignup } from '@contentfactory/frontend/components/public-saas/email-first-signup';
import { usePublicCopy } from '@contentfactory/frontend/components/public-saas/public-copy';

export default function DemoPage() {
  const copy = usePublicCopy();
  return (
    <div className="mx-auto max-w-[1040px] px-[24px] py-[56px]">
      {/* The eyebrow said `SYNTHETIC · NO ACCOUNT` in English on a page that
          ships in sixteen languages, and it said it above a demo that now
          states the same thing in its own footer, in the visitor's language and
          in a full sentence. One of the two had to go. */}
      <header className="max-w-[72ch]">
        <h1 className="cf-heading-xl [text-wrap:balance]">
          {copy('demoTitle')}
        </h1>
        <p className="mt-[16px] cf-body-lg text-cf-ink-muted text-pretty">
          {copy('demoBody')}
        </p>
      </header>
      <div className="mt-[32px]">
        <SyntheticDemo />
      </div>
      <div className="mt-[24px]">
        <EmailFirstSignup starterTemplate={DEMO_STARTER_TEMPLATE} />
      </div>
    </div>
  );
}
