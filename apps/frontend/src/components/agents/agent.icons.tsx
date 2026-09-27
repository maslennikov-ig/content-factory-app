import type { ReactNode } from 'react';

/**
 * The agent screen's glyphs, one component (`content-factory-next-kcxz.10`).
 *
 * Drawn from the canvas (`docs/design/desert-lab/agent/build.py`): 16-unit
 * box, 1.5 stroke in `currentColor`, so a glyph takes the colour of the words
 * beside it and never carries meaning alone. Decorative by default.
 */
const PATHS = {
  chevron: <path d="M4.5 6.5 8 10l3.5-3.5" />,
  right: <path d="M6 4l4 4-4 4" />,
  plus: <path d="M8 4v8M4 8h8" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  pen: (
    <path d="M3 13l.6-2.6L10.8 3.2a1.2 1.2 0 011.7 0l.3.3a1.2 1.2 0 010 1.7L5.6 12.4 3 13z" />
  ),
  check: <path d="M3.5 8.5l3 3 6-6.5" />,
  external: <path d="M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5 7 9" />,
  gauge: (
    <>
      <path d="M3 11.5a5 5 0 1110 0" />
      <path d="M8 11.5 10.5 7" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5a4.5 4.5 0 019 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </>
  ),
  doc: (
    <>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M9 2.5v3h3M6 8.5h4M6 11h4" />
    </>
  ),
  ask: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.4 6.3a1.7 1.7 0 013.2.6c0 1.1-1.6 1.4-1.6 2.3M8 11.2h.01" />
    </>
  ),
  bolt: <path d="M8.8 2 4 9h3.5L7 14l5-7H8.5z" />,
  list: <path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01" />,
  spark: (
    <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.3 4.3l1.6 1.6M10.1 10.1l1.6 1.6M4.3 11.7l1.6-1.6M10.1 5.9l1.6-1.6" />
  ),
  stop: <rect x="4.5" y="4.5" width="7" height="7" rx="1" />,
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3M8 11.2h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.2v3.3M8 5.2h.01" />
    </>
  ),
  clip: (
    <path d="M12.5 7.5 7.8 12.2a3 3 0 01-4.2-4.2L8.5 3.1a2 2 0 012.8 2.8L6.7 10.5a1 1 0 01-1.4-1.4L9.5 5" />
  ),
  send: <path d="M8 13V3.5M4 7l4-4 4 4" />,
  link: (
    <path d="M7 9a2.5 2.5 0 003.5 0l2-2A2.5 2.5 0 009 3.5l-.8.8M9 7a2.5 2.5 0 00-3.5 0l-2 2A2.5 2.5 0 007 12.5l.8-.8" />
  ),
  channels: (
    <>
      <circle cx="4.5" cy="8" r="2" />
      <circle cx="11.5" cy="4.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
      <path d="M6.3 7.1 9.7 5.4M6.3 8.9l3.4 1.7" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type AgentGlyphName = keyof typeof PATHS;

export function AgentGlyph({
  name,
  size = 16,
  label,
}: {
  name: AgentGlyphName;
  size?: 12 | 14 | 16;
  /** Only when the glyph is the whole name of a control's state. */
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}
