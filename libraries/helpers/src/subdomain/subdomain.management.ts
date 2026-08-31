import { parse } from 'tldts';

/**
 * Scope of every cookie this product sets, including the session token.
 *
 * The upstream behaviour was to widen it to the registrable domain, so an
 * instance on `factory.example.com` handed its session to `example.com` and to
 * every unrelated site sharing that domain. On a host that already serves other
 * products from neighbouring subdomains, that is a session hand-off, not a
 * feature. The exact host is the honest default.
 *
 * A deployment that genuinely spreads one session across several subdomains
 * says so explicitly with `AUTH_COOKIE_DOMAIN`.
 */
export function getCookieUrlFromDomain(domain: string) {
  const explicit = process.env.AUTH_COOKIE_DOMAIN;
  if (explicit) {
    return explicit;
  }

  const url = parse(domain);
  return url.hostname || domain;
}
