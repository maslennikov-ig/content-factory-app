'use client';

import i18next from './i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UseTranslationOptions } from 'react-i18next/index';
import { fallbackLng } from './i18n.config';
import { useVariables } from '../helpers/variable.context';

export function useT(ns?: string, options?: UseTranslationOptions<any>) {
  const { language } = useVariables();
  const { t, i18n } = useTranslation(ns, options);

  // Server render: the browser language detector cannot run, so i18next has no
  // resolved language and would produce English HTML while the browser produces
  // the cookie language. The request language travels through the variable
  // context, which the layout fills from the same cookie, so both sides agree.
  if (typeof window === 'undefined') {
    return i18n.getFixedT(
      language || fallbackLng,
      Array.isArray(ns) ? ns[0] : ns,
      options?.keyPrefix
    );
  }

  // Browser: i18next resolved the language itself from that same cookie, so the
  // first render matches the server HTML. It stays authoritative from here on,
  // which is what keeps switching the language without a reload working.
  return t;
}

export function useTranslationSettings() {
  const [savedI18next, setSavedI18next] = useState(i18next);

  return savedI18next;
}
