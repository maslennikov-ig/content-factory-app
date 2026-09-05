'use client';

import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { LanguageMenu } from '@contentfactory/frontend/components/ui/language-menu';

/**
 * Changing the language on the way in — `content-factory-next-fn33.39`.
 *
 * The proxy already negotiates `Accept-Language` for a visitor with no cookie,
 * so a Russian browser is served Russian without being asked. What was missing
 * is the correction: a browser that asks for English, or a shared machine, or a
 * person reading a language their browser does not name, had no way to change
 * anything before signing in.
 *
 * The control itself is `LanguageMenu`, shared with the marketing shell since
 * `content-factory-next-fn33.97`. All that is left here is where it sits — a
 * page surface — and the word for it, which on this side of the door comes from
 * the locale files rather than from the public copy deck.
 */
export const AuthLanguageSwitch = () => {
  const t = useT();
  return (
    <LanguageMenu tone="surface" label={t('change_language', 'Change Language')} />
  );
};
