import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCookieUrlFromDomain } from '@contentfactory/helpers/subdomain/subdomain.management';
import acceptLanguage from 'accept-language';
import {
  cookieName,
  headerName,
  languageFromBcp47,
  languageTags,
  languages,
} from '@contentfactory/react/translation/i18n.config';
acceptLanguage.languages(languageTags);

const PENDING_TEAM_INVITATION_COOKIE = 'pending-team-invitation';
// Kept equal to `TEAM_INVITATION_TTL_SECONDS` in
// `libraries/nestjs-libraries/src/auth/team-invitation.ts`. The proxy cannot
// import it — that module pulls in Redis and the JWT service, which do not
// belong in a middleware bundle — so the two numbers are held equal by
// `tests/proxy-invite-origin.test.cjs` instead. They have to match because a
// registration that waits for an administrator's approval outlives any short
// cookie: fifteen minutes lost the invitation for everyone approved later.
const PENDING_TEAM_INVITATION_TTL_SECONDS = 2 * 24 * 60 * 60;
const isInviteToken = (value?: string | null) =>
  !!value && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

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
  const pendingInvitation = request.cookies.get(
    PENDING_TEAM_INVITATION_COOKIE
  )?.value;
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

  // Behind the production reverse proxy the container sees its own address:
  // `nextUrl.href` is `http://localhost:4200/...` while the visitor is on the
  // public domain. Next normalizes a `Location` back to a relative path, so a
  // redirect survives that, but a URL that travels as a *value* — a
  // `returnUrl` parameter, anything stored in a cookie — keeps the internal
  // origin and sends the person to localhost after they sign in. `FRONTEND_URL`
  // is the address the browser actually used, and this file already trusts it
  // for the cookie domain. Falls back to the request when it is unset, which is
  // the local case where the two are the same anyway.
  const publicUrl = (pathname: string, search = '') =>
    new URL(`${pathname}${search}`, process.env.FRONTEND_URL || nextUrl.href);

  const org = nextUrl.searchParams.get('org');
  // An invite carries the signed token itself, so it always has the three
  // base64url segments of a JWT. Treating every `?org=` value as an invite
  // handed the marketing home to the auth flow whenever a campaign or partner
  // link used the same parameter name for a plain tag: the visitor never saw
  // the landing page, and the backend rejected the tag anyway.
  const looksLikeInviteToken = isInviteToken(org);
  if (
    authCookie &&
    looksLikeInviteToken &&
    pendingInvitation === org &&
    nextUrl.pathname === '/join-org'
  ) {
    topResponse.cookies.set(PENDING_TEAM_INVITATION_COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !process.env.NOT_SECURED,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      maxAge: -1,
      expires: new Date(0),
    });
    return topResponse;
  }

  // Signing out must still sign out: with a pending invitation this branch
  // used to catch `/auth/logout` too and send the person to the confirmation
  // page with their session intact.
  if (
    authCookie &&
    isInviteToken(pendingInvitation) &&
    (nextUrl.pathname === '/' ||
      (nextUrl.pathname.startsWith('/auth') &&
        !nextUrl.pathname.startsWith('/auth/logout')))
  ) {
    const confirmationUrl = publicUrl('/join-org');
    confirmationUrl.searchParams.set('org', pendingInvitation!);
    const redirect = NextResponse.redirect(confirmationUrl);
    redirect.cookies.set(PENDING_TEAM_INVITATION_COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !process.env.NOT_SECURED,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      maxAge: -1,
      expires: new Date(0),
    });
    return redirect;
  }

  // Every authentication page, not just `/auth`: a hand-built
  // `/auth/login?org=<token>` used to drop the invitation on the floor, and the
  // person then signed in to their own empty workspace with nothing left to
  // accept. Signing out is the one exception — `?org=` must not turn a logout
  // into a redirect that keeps the session.
  const isInviteEntryPath =
    nextUrl.pathname === '/' ||
    (nextUrl.pathname.startsWith('/auth') &&
      !nextUrl.pathname.startsWith('/auth/logout'));
  if (looksLikeInviteToken && isInviteEntryPath) {
    const confirmationUrl = publicUrl('/join-org');
    confirmationUrl.searchParams.set('org', org);
    if (authCookie) {
      return NextResponse.redirect(confirmationUrl);
    }

    // Keep the page the visitor asked for: someone who opened the sign-in form
    // should not be answered with the registration form.
    const loginUrl = publicUrl(
      nextUrl.pathname === '/' ? '/auth' : nextUrl.pathname
    );
    loginUrl.searchParams.set('returnUrl', confirmationUrl.toString());
    const redirect = NextResponse.redirect(loginUrl);
    redirect.cookies.set(PENDING_TEAM_INVITATION_COOKIE, org, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !process.env.NOT_SECURED,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      maxAge: PENDING_TEAM_INVITATION_TTL_SECONDS,
    });
    return redirect;
  }

  if (
    nextUrl.pathname === '/join-org' &&
    looksLikeInviteToken &&
    !authCookie
  ) {
    const loginUrl = publicUrl('/auth');
    loginUrl.searchParams.set(
      'returnUrl',
      publicUrl(nextUrl.pathname, nextUrl.search).toString()
    );
    const redirect = NextResponse.redirect(loginUrl);
    redirect.cookies.set(PENDING_TEAM_INVITATION_COOKIE, org, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !process.env.NOT_SECURED,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      maxAge: PENDING_TEAM_INVITATION_TTL_SECONDS,
    });
    return redirect;
  }

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

  // A provider's return carries a one-time code that the `/auth` page has to
  // exchange. Since `content-factory-next-fn33.14` a signed-in person comes
  // back here from Telegram as well — connecting the account in Settings shares
  // the sign-in address — and bouncing them to `/` would drop the code before
  // the page ever saw it.
  const isProviderReturn =
    nextUrl.pathname === '/auth' &&
    !!nextUrl.searchParams.get('provider') &&
    !!nextUrl.searchParams.get('code');

  // If the url is /auth and the cookie exists, redirect to /
  if (nextUrl.pathname.startsWith('/auth') && authCookie && !isProviderReturn) {
    return NextResponse.redirect(new URL(`/${url}`, nextUrl.href));
  }
  if (isProviderReturn) {
    return topResponse;
  }
  if (nextUrl.pathname.startsWith('/auth') && !authCookie) {
    return topResponse;
  }
  try {
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
