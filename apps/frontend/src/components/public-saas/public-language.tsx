'use client';

import { LanguageMenu } from '@contentfactory/frontend/components/ui/language-menu';
import { usePublicCopy } from './public-copy';

/**
 * Changing the language without an account, on the marketing shell.
 *
 * The control is `LanguageMenu`, shared with `/auth` since
 * `content-factory-next-fn33.97`. What is local is the band it sits on — the
 * navigation bar, whose hover plate is a different colour from a page
 * surface's — and the word for it, which on the public pages comes from the
 * copy deck rather than from the locale files.
 */
export function PublicLanguage() {
  const copy = usePublicCopy();
  return <LanguageMenu tone="navigation" label={copy('navLanguage')} />;
}
