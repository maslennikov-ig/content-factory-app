import { CSSProperties } from 'react';

/** Removes consumer-owned visual-height utilities, including Tailwind variants. */
export const withoutConsumerHeight = (className?: string) =>
  className
    ?.split(/\s+/)
    .filter(
      (token) =>
        !/(?:^|:)!?(?:min-|max-)?(?:h-|size-)|\[(?:height|min-height|max-height|block-size|min-block-size|max-block-size):/.test(
          token
        )
    )
    .join(' ') ?? '';

const HEIGHT_STYLE_KEYS = new Set([
  'height', 'minHeight', 'maxHeight', 'blockSize', 'minBlockSize', 'maxBlockSize',
]);

/** Keeps presentation styles but removes consumer control geometry. */
export const withoutConsumerHeightStyle = (style?: CSSProperties) => {
  if (!style) return undefined;
  return Object.fromEntries(Object.entries(style).filter(([key]) => !HEIGHT_STYLE_KEYS.has(key)));
};
