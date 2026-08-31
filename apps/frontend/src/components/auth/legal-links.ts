/**
 * Where the terms and privacy links point.
 *
 * These used to come only from `NEXT_PUBLIC_TERMS_URL` and
 * `NEXT_PUBLIC_PRIVACY_URL`, and the notice hid itself when they were unset —
 * sensible when an operator had nothing to link to. The product has since grown
 * its own `/terms` and `/privacy`, served from markdown that ships inside the
 * image and is held there by `tests/legal-documents.build-context.test.cjs`. So
 * the empty variable stopped meaning "no document" and started meaning "nobody
 * filled this in", and on factory.aidevteam.ru it meant exactly that: three
 * published documents, and a registration form that collected an email, a
 * password hash and an IP address without a link to any of them.
 *
 * The built-in pages are therefore the default. The variables remain, because
 * an operator who publishes their own documents elsewhere must still be able to
 * point at them.
 */
export const BUILT_IN_TERMS_PATH = '/terms';
export const BUILT_IN_PRIVACY_PATH = '/privacy';

export const resolveLegalLinks = (variables: {
  termsUrl?: string;
  privacyUrl?: string;
}) => ({
  termsUrl: variables.termsUrl || BUILT_IN_TERMS_PATH,
  privacyUrl: variables.privacyUrl || BUILT_IN_PRIVACY_PATH,
});
