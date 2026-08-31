import { cookies, headers } from 'next/headers';
import i18next from './i18next';
import {
  cookieName,
  fallbackLng,
  headerName,
  languages,
} from './i18n.config';

const supported = (language?: string | null) =>
  language && languages.includes(language) ? language : undefined;

/**
 * The language of the current request.
 *
 * `i18next-browser-languagedetector` can only read `document.cookie` and
 * `navigator`, so on the server it resolves nothing and every render silently
 * fell back to English while the browser rendered the cookie language. Reading
 * the same cookie the browser detector reads keeps both sides on one value.
 *
 * The cookie carries an explicit choice, so it wins. A first-time visitor has
 * no cookie yet, and for them the proxy negotiates `Accept-Language` into the
 * request header read here — without it a Russian browser was served English
 * HTML no matter what it asked for.
 *
 * The request language is never written back into the i18next instance: that
 * instance is a module-level singleton shared by every concurrent request, so
 * `changeLanguage` there would leak one visitor's language into another
 * visitor's HTML. `tests/language.negotiation.test.cjs` runs two overlapping
 * requests to keep that honest.
 */
export async function resolveRequestLanguage(): Promise<string> {
  const store = await cookies();
  const chosen = supported(store.get(cookieName)?.value);
  if (chosen) {
    return chosen;
  }

  const requestHeaders = await headers();
  return supported(requestHeaders.get(headerName)) || fallbackLng;
}

export async function getT(ns?: string, options?: any) {
  if (ns && !i18next.hasLoadedNamespace(ns)) {
    await i18next.loadNamespaces(ns);
  }
  return i18next.getFixedT(
    await resolveRequestLanguage(),
    Array.isArray(ns) ? ns[0] : ns,
    options?.keyPrefix
  );
}
