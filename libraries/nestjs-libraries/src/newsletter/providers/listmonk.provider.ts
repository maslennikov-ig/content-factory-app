import {
  NewsletterConsent,
  NewsletterInterface,
} from '@contentfactory/nestjs-libraries/newsletter/newsletter.interface';

/**
 * How long the whole subscription handover may hold a registration open.
 *
 * This is a budget for the call, not for one request: the conflict path makes a
 * second request, and two independent ten-second timeouts meant a slow Listmonk
 * could delay an answer to a person who had already been given an account by
 * about twenty seconds — long enough for the browser to give up and retry into
 * `Email already exists`. The subscription is a side effect and is treated as
 * one; the consent is already recorded, so losing this call loses nothing that
 * cannot be re-sent.
 */
const SUBSCRIPTION_BUDGET_MS = 2_500;

/**
 * An internal Listmonk base URL, judged by shape.
 *
 * The check used to be equality with `http://cf-listmonk:9000`, which put one
 * deployment's Docker service name inside a shared library and turned the
 * setting into decoration — no other host, name or port could ever be used, and
 * anyone copying the shipped example got a thrown error on every registration
 * with the box ticked. What actually matters is that the credentials go to an
 * internal service and nowhere else: plain HTTP, no user information in the URL,
 * and no path, query or fragment that could redirect the API calls appended to
 * it.
 */
function internalBaseUrl(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== '/') return null;
  if (!url.hostname) return null;

  return url.origin;
}

export class ListmonkProvider implements NewsletterInterface {
  name = 'listmonk';
  async register(email: string, consent?: NewsletterConsent) {
    const domain = internalBaseUrl(process.env.LISTMONK_DOMAIN);
    const user = process.env.LISTMONK_USER?.trim();
    const apiKey = process.env.LISTMONK_API_KEY?.trim();
    const listId = Number(process.env.LISTMONK_LIST_ID);
    const listUuid = process.env.LISTMONK_LIST_UUID?.trim();
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      !domain ||
      !user ||
      !apiKey ||
      !Number.isSafeInteger(listId) ||
      listId <= 0 ||
      !listUuid ||
      !uuidPattern.test(listUuid)
    ) {
      throw new Error('Listmonk newsletter configuration is invalid');
    }

    // One deadline for both requests below, so the conflict path cannot spend
    // the budget twice.
    const deadline = AbortSignal.timeout(SUBSCRIPTION_BUDGET_MS);

    const body = {
      email,
      // Listmonk v6.2.0 requires `name`. A fixed label satisfies its API
      // without collecting or deriving another piece of personal data.
      name: 'Content Factory subscriber',
      status: 'enabled',
      lists: [listId],
      preconfirm_subscriptions: false,
      // The same two facts the account row carries, on the subscriber record
      // that will still exist if the account is ever deleted. Neither is
      // personal data the product did not already hold.
      ...(consent
        ? {
            attribs: {
              source: consent.source,
              consented_at: consent.consentedAt.toISOString(),
            },
          }
        : {}),
    };

    const authString = `${user}:${apiKey}`;
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set(
      'Authorization',
      'Basic ' + Buffer.from(authString).toString('base64')
    );

    const response = await fetch(
      `${domain}/api/subscribers`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: deadline,
        redirect: 'error',
      }
    );

    if (response.status === 409) {
      // The public double opt-in endpoint takes no attributes, so the consent
      // record for an address Listmonk already knows stays where it is
      // authoritative anyway: the account row.
      const publicHeaders = new Headers();
      publicHeaders.set('Content-Type', 'application/json');
      publicHeaders.set('Accept', 'application/json');
      const resubscribeResponse = await fetch(
        `${domain}/api/public/subscription`,
        {
          method: 'POST',
          headers: publicHeaders,
          body: JSON.stringify({
            email,
            name: 'Content Factory subscriber',
            list_uuids: [listUuid],
          }),
          signal: deadline,
          redirect: 'error',
        }
      );

      if (!resubscribeResponse.ok) {
        throw new Error(
          `Listmonk subscription recovery failed with status ${resubscribeResponse.status}`
        );
      }

      return;
    }

    if (!response.ok) {
      throw new Error(
        `Listmonk subscriber request failed with status ${response.status}`
      );
    }
  }
}
