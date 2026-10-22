import { NextResponse, type NextRequest } from 'next/server';

export const LOCAL_LOGIN_PAUSED_COOKIE = 'cf-local-login-paused';

const loopback = (value: string | undefined, protocols: string[], credentials = false) => {
  try {
    const url = new URL(value!);
    return protocols.includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      (credentials || (!url.username && !url.password));
  } catch {
    return false;
  }
};

export function localLoginConfigured(request: NextRequest) {
  return process.env.NODE_ENV === 'development' &&
    process.env.CF_LOCAL_AUTO_LOGIN !== 'false' &&
    Boolean(process.env.CF_LOCAL_AUTH_TOKEN) &&
    loopback(request.nextUrl.href, ['http:', 'https:']) &&
    loopback(process.env.FRONTEND_URL, ['http:', 'https:']) &&
    loopback(process.env.BACKEND_INTERNAL_URL, ['http:', 'https:']) &&
    loopback(process.env.DATABASE_URL, ['postgres:', 'postgresql:'], true);
}

/** Reuse the selected local profile's normal session; backend ACLs still apply. */
export async function localAutoLogin(request: NextRequest) {
  const url = request.nextUrl;
  const existingAuth = request.cookies.get('auth')?.value;
  const localSessionEntry = existingAuth === process.env.CF_LOCAL_AUTH_TOKEN &&
    ['/auth', '/auth/login', '/auth/register'].includes(url.pathname);
  if (!localLoginConfigured(request) || request.method !== 'GET' ||
      (existingAuth && !localSessionEntry) || request.headers.get('auth') ||
      request.cookies.get(LOCAL_LOGIN_PAUSED_COOKIE) ||
      request.cookies.get('cf-awaiting-approval') ||
      request.cookies.get('pending-team-invitation') ||
      url.pathname.startsWith('/oauth/') ||
      (url.pathname.startsWith('/auth/') &&
        !['/auth/login', '/auth/register'].includes(url.pathname)) ||
      url.searchParams.has('provider') || url.searchParams.has('org')) {
    return null;
  }

  try {
    const token = process.env.CF_LOCAL_AUTH_TOKEN!;
    const self = await fetch(
      `${process.env.BACKEND_INTERNAL_URL!.replace(/\/+$/, '')}/user/self`,
      { headers: { auth: token }, cache: 'no-store', redirect: 'manual',
        signal: AbortSignal.timeout(2000) }
    );
    if (!self.ok) return null;
    const target = new URL(url.href);
    if (target.pathname === '/' || target.pathname.startsWith('/auth')) {
      target.pathname = '/agents';
      target.search = '';
    }
    const response = NextResponse.redirect(target);
    response.cookies.set('auth', token, {
      // Local HTTP requests use customFetch's auth header, read from this cookie.
      // Match the ordinary NOT_SECURED login rather than the production cookie.
      path: '/', httpOnly: false, sameSite: 'lax', secure: false,
    });
    // A previous signed-out profile must not select another user's workspace.
    for (const name of ['showorg', 'impersonate']) {
      if (request.cookies.get(name)) {
        response.cookies.set(name, '', { path: '/', maxAge: 0 });
      }
    }
    return response;
  } catch {
    // A missing/stale local profile falls back to ordinary sign-in.
    return null;
  }
}
