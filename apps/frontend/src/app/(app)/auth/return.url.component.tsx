'use client';

import { useSearchParams } from 'next/navigation';
import { FC, useCallback, useEffect } from 'react';
/**
 * Only an address on this very site is worth coming back to. Anything else
 * turned the sign-in form into an open redirect: a person typed their password
 * on the real domain and was sent wherever `returnUrl` pointed.
 */
export const isSameSiteReturnUrl = (
  value: string | null | undefined,
  origin: string
) => {
  if (!value) return false;
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
};

const ReturnUrlComponent: FC = () => {
  const params = useSearchParams();
  const url = params.get('returnUrl');
  useEffect(() => {
    if (isSameSiteReturnUrl(url, window.location.origin)) {
      localStorage.setItem('returnUrl', url!);
    }
  }, [url]);
  return null;
};
export const useReturnUrl = () => {
  return {
    getAndClear: useCallback(() => {
      const data = localStorage.getItem('returnUrl');
      localStorage.removeItem('returnUrl');
      // Checked again on the way out: the stored value may predate the check.
      return isSameSiteReturnUrl(data, window.location.origin) ? data : null;
    }, []),
  };
};
export default ReturnUrlComponent;
