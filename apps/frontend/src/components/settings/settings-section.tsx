'use client';

import React, { ReactNode } from 'react';
import { Panel } from '@contentfactory/frontend/components/ui/surface';
import {
  SuperadminMark,
  useSuperadminOnly,
} from '@contentfactory/frontend/components/ui/superadmin-mark';

/** The block's name, marked when only the instance superadmin sees it. */
const SectionTitle = ({
  as: Heading,
  children,
}: {
  as: 'h3' | 'h4';
  children: ReactNode;
}) => {
  const superadminOnly = useSuperadminOnly();
  return (
    <Heading className="flex items-center gap-[8px] cf-label-md text-cf-ink">
      {children}
      {superadminOnly && <SuperadminMark />}
    </Heading>
  );
};

/**
 * One block of the settings tab, drawn one way.
 *
 * Owner on the walk of 13.09.2026: «некоторые области выделены отдельными
 * блоками, а некоторые нет». Both halves of that were true. Three sections —
 * date format, email notifications, shortlinks — each wrote out
 * `my-[16px] flex flex-col gap-[24px] rounded-[8px] border border-cf-border
 * bg-cf-surface p-[24px]` by hand, the same six decisions typed three times;
 * the AI section wrote none of them and rendered as a bare `div` with a top
 * border, so on the same tab it read as leftovers rather than as a block. The
 * two loading placeholders were a fourth and fifth copy of most of the string.
 *
 * `Panel` already owned the surface, the border and the radius and was used
 * eighteen times elsewhere in the product and never once here. This is that
 * panel with the settings tab's own rhythm attached, so the geometry is
 * written in two places that both belong to it — the padding step in
 * `Panel`'s own table, the tab's outer spacing here — and in none of the
 * components that use it. `tests/component-geometry.guard.test.cjs` keeps a
 * sixth hand-written copy from appearing.
 *
 * `layout="row"` (`content-factory-next-97dq.51`, 23.09.2026). Owner: «в
 * глобальных настройках тоже всё очень растянуто». On «Глобальные настройки»
 * each section is a row: its name and one line of what it is for on the left
 * in 260px, its controls on the right no wider than 560px, a rule between
 * rows. Below `md` the two columns stack. The card stays the default for the
 * superadmin screen, which borrows this component for a different page.
 */
export const SettingsSection = ({
  title,
  caption,
  layout = 'card',
  children,
}: {
  /**
   * The block's name. Optional because a section that is still loading has
   * nothing to name yet, and a placeholder that changed shape when the data
   * arrived would move the rest of the tab under the pointer.
   */
  title?: ReactNode;
  /** One line under the name, in the row layout only. */
  caption?: ReactNode;
  layout?: 'card' | 'row';
  children: ReactNode;
}) =>
  layout === 'row' ? (
    <section
      data-settings-row="true"
      className="grid gap-[12px] border-b border-cf-border py-[24px] last:border-b-0 md:grid-cols-[260px_minmax(0,1fr)] md:gap-[32px]"
    >
      <div className="flex min-w-0 flex-col gap-[4px]">
        {title ? <SectionTitle as="h3">{title}</SectionTitle> : null}
        {caption ? (
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {caption}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 max-w-[560px] flex-col gap-[16px]">
        {children}
      </div>
    </section>
  ) : (
    <Panel
      as="section"
      className="my-[16px]"
      contentPadding="roomy"
      contentClassName="flex flex-col gap-[24px]"
    >
      {title ? <SectionTitle as="h4">{title}</SectionTitle> : null}
      {children}
    </Panel>
  );

export default SettingsSection;
