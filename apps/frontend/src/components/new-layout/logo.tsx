'use client';

import { CfMark } from '@contentfactory/frontend/components/ui/brand/cf-mark';

/**
 * Kept as a named export so the existing call sites do not have to change.
 * The full wordmark lives in `components/ui/brand/wordmark`.
 */
export const Logo = ({ size = 40 }: { size?: number }) => (
  <CfMark size={size} />
);
