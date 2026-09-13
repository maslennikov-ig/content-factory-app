'use client';

import React, { ReactNode } from 'react';
import { Panel } from '@contentfactory/frontend/components/ui/surface';

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
 */
export const SettingsSection = ({
  title,
  children,
}: {
  /**
   * The block's name. Optional because a section that is still loading has
   * nothing to name yet, and a placeholder that changed shape when the data
   * arrived would move the rest of the tab under the pointer.
   */
  title?: ReactNode;
  children: ReactNode;
}) => (
  <Panel
    as="section"
    className="my-[16px]"
    contentPadding="roomy"
    contentClassName="flex flex-col gap-[24px]"
  >
    {title ? <h4 className="cf-label-md text-cf-ink">{title}</h4> : null}
    {children}
  </Panel>
);

export default SettingsSection;
