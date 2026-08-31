'use client';

import Link from 'next/link';
import { PublicCopyKey, usePublicCopy } from './public-copy';

export function PublicInfoPage({
  titleKey,
  bodyKey,
  items,
}: {
  titleKey: PublicCopyKey;
  bodyKey: PublicCopyKey;
  items: ReadonlyArray<{
    titleKey: PublicCopyKey;
    bodyKey: PublicCopyKey;
  }>;
}) {
  const copy = usePublicCopy();
  return (
    <section
      className="mx-auto max-w-[920px] px-[24px] py-[64px]"
      aria-labelledby="public-page-title"
    >
      <p className="cf-label-sm text-cf-signature">CONTENT FACTORY</p>
      <h1
        id="public-page-title"
        className="mt-[12px] cf-heading-xl [text-wrap:balance]"
      >
        {copy(titleKey)}
      </h1>
      <p className="mt-[20px] max-w-[70ch] cf-body-lg text-cf-ink-muted text-pretty">
        {copy(bodyKey)}
      </p>
      <div className="mt-[32px] grid gap-[12px] md:grid-cols-2">
        {items.map((item) => (
          <section
            key={item.titleKey}
            className="rounded-[12px] border border-cf-border bg-cf-surface p-[20px]"
          >
            <h2 className="cf-heading-md">{copy(item.titleKey)}</h2>
            <p className="mt-[8px] cf-body-md text-cf-ink-muted text-pretty">
              {copy(item.bodyKey)}
            </p>
          </section>
        ))}
      </div>
      <div className="mt-[32px] border-t border-cf-border pt-[24px]">
        <Link
          className="cf-label-md text-cf-accent underline"
          href="/demo"
        >
          {copy('tryDemo')}
        </Link>
      </div>
    </section>
  );
}
