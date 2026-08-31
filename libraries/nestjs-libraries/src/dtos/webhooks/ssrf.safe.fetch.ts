import { ssrfSafeDispatcher } from './ssrf.safe.dispatcher';
import { isSafePublicHttpsUrl } from './webhook.url.validator';

const MAX_REDIRECTS = 5;

export async function fetchSafePublicHttpsUrl(
  url: string
): Promise<globalThis.Response> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafePublicHttpsUrl(currentUrl))) {
      throw new Error('Unsafe URL');
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      // @ts-ignore — undici option, not in lib.dom fetch types
      dispatcher: ssrfSafeDispatcher,
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    if (hop === MAX_REDIRECTS) {
      throw new Error('Too many redirects');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Redirect without Location');
    }

    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new Error('Invalid redirect URL');
    }
  }

  throw new Error('Too many redirects');
}
