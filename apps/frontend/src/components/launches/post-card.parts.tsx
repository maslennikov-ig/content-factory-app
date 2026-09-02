'use client';

import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { ChannelMark } from '@contentfactory/frontend/components/ui/brand/channel-mark';
import { Popover, MenuItem } from '@contentfactory/frontend/components/ui/layers';
import {
  STATUS_TONES,
  StatusTone,
} from '@contentfactory/frontend/components/ui/surface';

/**
 * The calendar post card, taken apart.
 *
 * Direction A of the 02.09.2026 canvas, chosen by the owner. Three decisions
 * carry it, and each one answers a defect he found by looking at the running
 * product:
 *
 *   • The coloured band across the card's head *is* the stage. The word is
 *     written once, there, and nowhere else on the card. Before, the band
 *     carried the tag names and a pill under it carried the stage — «Plan»
 *     above «План», the same word twice in two languages.
 *   • The band's colour comes from the stage, which has five known tones, not
 *     from the tag, whose colour a person types in by hand. A computed colour
 *     cannot be checked for contrast in either theme, and the product was
 *     covering for that with `mix-blend-mode: difference` — which is what made
 *     the text and icons wash out on light and dark alike.
 *   • The actions arrive on their own surface with their own border, so no
 *     button background bleeds through the band any more. That was the piece
 *     that appeared to fall out of the strip under the cursor.
 *
 * The two shapes are one component with one vocabulary: a narrow card for the
 * week and month grids, a single 36px row for the day and list views where the
 * column is full width.
 */

/** 16px on a 1.5px outline — one hand for every icon the card draws. */
const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...iconProps}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const ChartIcon = () => (
  <svg {...iconProps}>
    <path d="M3 20h18" />
    <path d="M6 20v-6" />
    <path d="M12 20V6" />
    <path d="M18 20v-9" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
);

export const BracketsIcon = () => (
  <svg {...iconProps}>
    <path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2" />
  </svg>
);

export const DotsIcon = () => (
  <svg {...iconProps}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);

export type PostCardChannel = {
  id: string;
  name: string;
  picture?: string | null;
};

/**
 * Every channel the post goes to, not the first one the calendar happened to
 * read. A post to three channels is three rows in the database sharing one
 * `group`; the calendar drew three cards and each showed one channel, so the
 * screen never said that the three were one post.
 *
 * Three marks fit the narrowest card: a week-view card is 94px, its body has
 * 8px of padding a side, and 3×20px with 2×4px between them is 68px of the 78
 * left. A fourth would not fit, so past three the last slot is spent on the
 * count instead — 2×20px, one gap and «+2» is 61px, which does.
 *
 * The marks are a reading, not a control. A 20px hit area is half the
 * product's own smallest control, so the per-channel actions live in the card's
 * action menu, where they are the same size as every other action.
 */
export const ChannelMarks: FC<{
  channels: PostCardChannel[];
  max?: number;
  className?: string;
}> = ({ channels, max = 3, className }) => {
  // Exactly `max` channels are all drawn; more than that and the last slot
  // goes to the count, because a row that ends in «+1» beside a hidden mark
  // is a row that lied about how much it could hold.
  const shown =
    channels.length <= max ? channels : channels.slice(0, Math.max(1, max - 1));
  const hidden = channels.length - shown.length;
  return (
    <span
      className={clsx('flex items-center min-w-0', className)}
      title={channels.map((channel) => channel.name).join(', ')}
    >
      {shown.map((channel, index) => (
        <span
          key={channel.id}
          className={clsx('shrink-0 flex', index > 0 && 'ms-[4px]')}
        >
          {channel.picture ? (
            <img
              src={channel.picture}
              alt={channel.name}
              className="w-[20px] h-[20px] rounded-[4px] object-cover"
            />
          ) : (
            <ChannelMark
              name={channel.name}
              size={20}
              decorative={false}
              className="bg-cf-surface"
            />
          )}
        </span>
      ))}
      {hidden > 0 && (
        <span className="ms-[4px] cf-caption text-cf-ink-muted shrink-0">
          +{hidden}
        </span>
      )}
    </span>
  );
};

/**
 * The head band. Its colour is the stage's tone and nothing else; a card with
 * no stage recorded — every post that predates the field — gets the neutral
 * band, which still carries the tag names so nothing is lost by the tag colour
 * going away.
 */
export const StageBand: FC<{
  tone: StatusTone;
  label: string;
  title?: string;
  className?: string;
}> = ({ tone, label, title, className }) => (
  <div
    className={clsx(
      'h-[20px] min-h-[20px] flex items-center px-[8px] rounded-t-[8px] border-b',
      STATUS_TONES[tone],
      /*
        The one place the band cannot take the pill's tone as it stands. The
        pill's `neutral` is `surface-subtle`, which is also the card's body —
        on the card the band would then be the body with a hairline through it.
        A step up the surface scale is what makes it read as a head, and it is
        the same step the design canvas drew.
      */
      tone === 'neutral' && 'bg-cf-surface-raised',
      className
    )}
  >
    {/*
      `cf-caption`, not the `cf-label-sm` the status pill uses. Measured in a
      browser on 02.09.2026 with the product's own JetBrains Mono: «РАСПИСАНИЕ»
      is 77px at label-sm and a week-view band offers 78px — it fits by one
      pixel, which is not fitting. At caption it is 68px, with 10px to spare.
      The pill keeps label-sm, because a pill has the width and every other
      status in the product is set that way.
    */}
    <span className="cf-caption uppercase truncate" title={title || label}>
      {label}
    </span>
  </div>
);

/** Same pill as everywhere else, for the wide row where the band would be a stripe of nothing. */
export const StagePill: FC<{
  tone: StatusTone;
  label: string;
  title?: string;
}> = ({ tone, label, title }) => (
  <span
    className={clsx(
      'inline-flex shrink-0 items-center h-[20px] px-[8px] rounded-[8px] border cf-label-sm uppercase whitespace-nowrap',
      STATUS_TONES[tone]
    )}
    title={title || label}
  >
    {label}
  </span>
);

export type PostCardAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Delete is the only red one, and it is always last. */
  danger?: boolean;
};

/*
  The shared control, not a bare `<button>` and not a `<div onClick>` — and it
  carries its own focus ring, because `Button` prints one only through the
  anchor helper. The panel around it fades on `focus-within`, so a keyboard
  user tabbing into it sees a control that is both visible and outlined.
*/
const ActionButton: FC<{ action: PostCardAction }> = ({ action }) => (
  <Button
    iconOnly
    type="button"
    variant="quiet"
    aria-label={action.label}
    title={action.label}
    className={clsx(
      'rounded-[4px]',
      'focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
      action.danger && 'text-cf-danger hover:text-cf-danger'
    )}
    onClick={(event) => {
      event.stopPropagation();
      action.onClick();
    }}
  >
    {action.icon}
  </Button>
);

/**
 * The actions never sit inside the band any more. They come on the raised
 * surface with their own border, which is the whole fix for the piece that
 * looked like it was falling out of the strip: there is no blend mode left to
 * let a hovered button's background show through the colour under it.
 *
 * Wide rows have room for every action inline. A 94px card does not, so it
 * gets the two that matter — open the preview, or open the rest — and the rest
 * live in a menu.
 *
 * `extra` is for actions that belong in the menu whatever the width: one
 * preview per channel, when the card carries several. Merging a post's rows
 * into one card would otherwise have taken those previews away, since each row
 * used to be a card with an eye of its own.
 */
export const PostCardActions: FC<{
  actions: PostCardAction[];
  extra?: PostCardAction[];
  inline: boolean;
  moreLabel: string;
  className?: string;
}> = ({ actions, extra = [], inline, moreLabel, className }) => {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const toggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setOpen((was) => !was);
  }, []);

  if (!actions.length) return null;

  const [first, ...rest] = actions;
  const shown = inline ? actions : [first];
  const menu = inline ? extra : [...rest, ...extra];

  return (
    <div
      ref={holder}
      className={clsx(
        'flex items-center gap-[4px] p-[4px] rounded-[8px]',
        'bg-cf-surface-raised border border-cf-border-strong',
        className
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {shown.map((action) => (
        <ActionButton key={action.key} action={action} />
      ))}
      {menu.length > 0 && (
        <div className="relative">
          <Button
            iconOnly
            variant="quiet"
            aria-label={moreLabel}
            title={moreLabel}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            className="rounded-[4px] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            onClick={toggle}
          >
            <DotsIcon />
          </Button>
          {open && (
            <Popover className="absolute top-[36px] end-0 z-[60]">
              {menu.map((action) => (
                <MenuItem
                  key={action.key}
                  className={clsx(action.danger && 'text-cf-danger')}
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                >
                  {action.icon}
                  {action.label}
                </MenuItem>
              ))}
            </Popover>
          )}
        </div>
      )}
    </div>
  );
};
