import type { ReactNode } from 'react';
import { VariableContextComponent } from '@contentfactory/react/helpers/variable.context';
import type { InterfaceReviewLocale } from './fixture-contract';

/**
 * The review language for a scene whose component reads i18next.
 *
 * The scenes that came first carry their own two-language `copy` map, which
 * works because those components are review-only surfaces. A component shared
 * with the generator or the editor cannot do that: its strings ship in sixteen
 * locales through i18next, and a second copy map would leave fourteen of them
 * untested and free to drift.
 *
 * Switching the language from the browser is not available here. This route
 * renders server-side and never hydrates — `connect-src 'none'` is deliberate
 * and there is no client React to run an effect — so `i18next.changeLanguage`
 * would never fire. What `useT` does read on the server is the language on the
 * variable context, and the server has every locale preloaded, so supplying
 * that one field is enough and needs no network.
 *
 * Everything else on the context is deliberately blank. A review scene has no
 * backend, no storage and no billing; a value here that looked real would be a
 * second source of truth for what the product is configured to do.
 */
const BLANK_ENVIRONMENT = Object.freeze({
  stripeClient: '',
  billingEnabled: false,
  isGeneral: true,
  genericOauth: false,
  oauthLogoUrl: '',
  oauthDisplayName: '',
  mcpUrl: '',
  cloudflareUrl: '',
  mainUrl: '',
  frontEndUrl: '',
  storageProvider: 'local' as const,
  backendUrl: '',
  environment: 'review',
  supportUrl: '',
  uploadDirectory: '',
  telegramBotName: '',
  telegramLoginEnabled: false,
  neynarClientId: '',
  isSecured: false,
  disableImageCompression: false,
  disableXAnalytics: false,
  transloadit: [] as string[],
  extensionId: '',
  googleAuthEnabled: false,
  termsUrl: '',
  privacyUrl: '',
  docsUrl: '',
});

export function ReviewLocaleProvider({
  locale,
  children,
}: {
  locale: InterfaceReviewLocale;
  children: ReactNode;
}) {
  return (
    <VariableContextComponent {...BLANK_ENVIRONMENT} language={locale}>
      {children}
    </VariableContextComponent>
  );
}
