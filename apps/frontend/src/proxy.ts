import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCookieUrlFromDomain } from '@contentfactory/helpers/subdomain/subdomain.management';
import { internalFetch } from '@contentfactory/helpers/utils/internal.fetch';
import acceptLanguage from 'accept-language';
import {
  cookieName,
  headerName,
  languageFromBcp47,
  languageTags,
  languages,
} from '@contentfactory/react/translation/i18n.config';
acceptLanguage.languages(languageTags);

// The legal documents are published without a session on purpose: a visitor
// has to be able to read what they would be agreeing to before there is an
// account to sign them out of. `LEGAL_ROUTES` in `legal-content.ts` holds the
// same three paths for the footer; this file cannot import it, because the
// proxy runs ahead of the application bundle, so the pair is held together by
// `tests/public-saas-routing.test.cjs` instead.
export const PUBLIC_PATHS = [
  '/',
  '/product',
  '/security',
  '/docs',
  '/demo',
  '/privacy',
  '/terms',
  '/subprocessors',
];

// This function can be marked `async` if using `await` inside
export async function proxy(request: NextRequest) {
  const nextUrl = request.nextUrl;
  const loggedAuth = nextUrl.pathname.startsWith('/provider/')
    ? nextUrl.searchParams.get('loggedAuth')
    : undefined;
  const authCookie =
    request.cookies.get('auth') || request.headers.get('auth') || loggedAuth;
  const cookieLanguage = request.cookies.get(cookieName)?.value;
  // `acceptLanguage.get` answers with the first configured language when it
  // matches nothing, so ask separately whether the browser named a language
  // this product actually ships. Only a real match is worth remembering.
  //
  // Compare primary subtags, not whole tags: a browser asking for plain `ka`
  // or for `pt-BR` names a language this product ships, even though neither
  // string is in the list verbatim. Matching the full tag sent a Georgian
  // browser English.
  const primary = (tag: string) => tag.split(/[-_]/)[0].toLowerCase();
  const shipped = new Set(languages.map(primary));
  const accepts = (request.headers.get('accept-language') || '')
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean);
  const negotiated = accepts.some((tag) => shipped.has(primary(tag)))
    ? acceptLanguage.get(request.headers.get('accept-language'))
    : undefined;
  // `Accept-Language` is the browser's guess and the cookie is the visitor's
  // own choice, so the cookie wins whenever there is one.
  const lng = languageFromBcp47(cookieLanguage || negotiated);

  const requestHeaders = new Headers(request.headers);
  // Read back by `resolveRequestLanguage` during the server render. Every
  // route that renders HTML passes through this proxy, so the header is the
  // one place both the first request and the cookie case agree on.
  requestHeaders.set(headerName, lng);

  const topResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // A negotiated language also has to reach the browser, because the client
  // detector reads the cookie and nothing else: without this the first paint
  // would be Russian on the server and English after hydration. Writing it
  // only when the visitor has no cookie keeps an explicit choice untouched.
  if (!cookieLanguage && negotiated) {
    topResponse.cookies.set(cookieName, lng, {
      path: '/',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  // Review scenes are deliberately session-free so a local browser matrix can
  // inspect every synthetic state. Keep this separate from PUBLIC_PATHS: a
  // production build must still pass through authentication and the route
  // layout independently returns not-found outside development and test.
  const isLocalInterfaceReview =
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
    (nextUrl.pathname === '/interface-review' ||
      nextUrl.pathname.startsWith('/interface-review/'));
  if (isLocalInterfaceReview) {
    return topResponse;
  }

  if (nextUrl.pathname.startsWith('/modal/') && !authCookie) {
    return NextResponse.redirect(new URL(`/auth/login-required`, nextUrl.href));
  }

  if (
    nextUrl.pathname.startsWith('/uploads/') ||
    nextUrl.pathname.startsWith('/p/') ||
    nextUrl.pathname.startsWith('/provider/') ||
    nextUrl.pathname.startsWith('/icons/')
  ) {
    return topResponse;
  }

  if (
    nextUrl.pathname.startsWith('/integrations/social/') &&
    nextUrl.href.indexOf('state=login') === -1
  ) {
    return topResponse;
  }

  const org = nextUrl.searchParams.get('org');
  // An invite carries the signed token itself, so it always has the three
  // base64url segments of a JWT. Treating every `?org=` value as an invite
  // handed the marketing home to the auth flow whenever a campaign or partner
  // link used the same parameter name for a plain tag: the visitor never saw
  // the landing page, and the backend rejected the tag anyway.
  const looksLikeInviteToken =
    !!org && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(org);
  const homeNeedsSessionRouting =
    nextUrl.pathname === '/' && (looksLikeInviteToken || Boolean(authCookie));
  if (PUBLIC_PATHS.includes(nextUrl.pathname) && !homeNeedsSessionRouting) {
    return topResponse;
  }

  // If the URL is logout, delete the cookie and redirect to login
  if (nextUrl.href.indexOf('/auth/logout') > -1) {
    const response = NextResponse.redirect(
      new URL('/auth/login', nextUrl.href)
    );
    response.cookies.set('auth', '', {
      path: '/',
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: false,
          }
        : {}),
      maxAge: -1,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    });
    return response;
  }

  if (
    nextUrl.pathname.startsWith('/auth/register') &&
    process.env.DISABLE_REGISTRATION === 'true'
  ) {
    return NextResponse.redirect(new URL('/auth/login', nextUrl.href));
  }

  const url = new URL(nextUrl).search;
  if (!nextUrl.pathname.startsWith('/auth') && !authCookie) {
    const providers = ['google', 'settings'];
    const findIndex = providers.find((p) => nextUrl.href.indexOf(p) > -1);
    const additional = !findIndex
      ? ''
      : (url.indexOf('?') > -1 ? '&' : '?') +
        `provider=${(findIndex === 'settings'
          ? process.env.CONTENT_FACTORY_GENERIC_OAUTH === 'true'
            ? 'generic'
            : 'github'
          : findIndex
        ).toUpperCase()}`;
    return NextResponse.redirect(
      new URL(`/auth${url}${additional}`, nextUrl.href)
    );
  }

  // If the url is /auth and the cookie exists, redirect to /
  if (nextUrl.pathname.startsWith('/auth') && authCookie) {
    return NextResponse.redirect(new URL(`/${url}`, nextUrl.href));
  }
  if (nextUrl.pathname.startsWith('/auth') && !authCookie) {
    if (org) {
      const redirect = NextResponse.redirect(new URL(`/auth`, nextUrl.href));
      redirect.cookies.set('org', org, {
        ...(!process.env.NOT_SECURED
          ? {
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: false,
              domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
            }
          : {}),
        expires: new Date(Date.now() + 15 * 60 * 1000),
      });
      return redirect;
    }
    return topResponse;
  }
  try {
    if (org) {
      const { id } = await (
        await internalFetch('/user/join-org', {
          body: JSON.stringify({
            org,
          }),
          method: 'POST',
        })
      ).json();
      const redirect = NextResponse.redirect(
        new URL(`/?added=true`, nextUrl.href)
      );
      if (id) {
        redirect.cookies.set('showorg', id, {
          ...(!process.env.NOT_SECURED
            ? {
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: false,
                domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
              }
            : {}),
          expires: new Date(Date.now() + 15 * 60 * 1000),
        });
      }
      return redirect;
    }
    if (nextUrl.pathname === '/') {
      return NextResponse.redirect(
        new URL(
          !!process.env.IS_GENERAL ? '/launches' : `/analytics`,
          nextUrl.href
        )
      );
    }

    return topResponse;
  } catch (err) {
    console.log('err', err);
    return NextResponse.redirect(new URL('/auth/logout', nextUrl.href));
  }
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
};
