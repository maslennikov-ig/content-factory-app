import { ExtensionRequest, GetCookiesResponse, ProviderInfo, StoredRefreshEntry } from './types/messages';
import { getAllProviders, getProvider } from './providers/provider.registry';
import { CookieProvider } from './providers/cookie-provider.interface';

const EXTENSION_VERSION = '2.0.0';
const REFRESH_ALARM_NAME = 'cookie-refresh';
const STORAGE_KEY = 'refreshEntries';

/**
 * Which page origins may talk to this extension.
 *
 * The manifest's `externally_connectable.matches` is the single source of
 * truth, so a deployment adds its own host in one place. Chrome already refuses
 * connections from anywhere else; this check keeps the message handler honest.
 */
function allowedOriginPatterns(): RegExp[] {
  const matches =
    chrome.runtime.getManifest().externally_connectable?.matches ?? [];

  return matches.map((match) => {
    const [scheme, rest] = match.split('://');
    const host = (rest ?? '').replace(/\/\*$/, '');
    const hostPattern = host
      .replace(/[.]/g, '\\.')
      .replace(/^\\\*\\\./, '([a-z0-9-]+\\.)*')
      .replace(/^\*\\\./, '([a-z0-9-]+\\.)*');
    const schemePattern = scheme === '*' ? 'https?' : scheme;
    return new RegExp(`^${schemePattern}://${hostPattern}(:\\d+)?$`);
  });
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedOriginPatterns().some((pattern) => pattern.test(origin));
}

async function extractCookies(provider: CookieProvider): Promise<GetCookiesResponse> {
  const allCookies = await chrome.cookies.getAll({ url: provider.url });

  const extracted: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const def of provider.cookies) {
    const found = allCookies.find((c) => c.name === def.name);
    if (found) {
      extracted[def.name] = found.value;
    } else if (def.required) {
      missingRequired.push(def.name);
    }
  }

  if (missingRequired.length > 0) {
    return {
      success: false,
      provider: provider.identifier,
      error: `Missing required cookies: ${missingRequired.join(', ')}. User may need to log in to ${provider.name}.`,
      missingCookies: missingRequired,
    };
  }

  return {
    success: true,
    provider: provider.identifier,
    cookies: extracted,
  };
}

// --- Refresh Token Storage Helpers ---

async function getStoredEntries(): Promise<Record<string, StoredRefreshEntry>> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function setStoredEntries(entries: Record<string, StoredRefreshEntry>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(REFRESH_ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 1440 });
  }
}

async function clearAlarmIfEmpty(): Promise<void> {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length === 0) {
    await chrome.alarms.clear(REFRESH_ALARM_NAME);
  }
}

// --- Background Cookie Refresh ---

async function refreshAllCookies(): Promise<void> {
  const entries = await getStoredEntries();
  for (const [integrationId, entry] of Object.entries(entries)) {
    try {
      const provider = getProvider(entry.provider);
      if (!provider) continue;

      const cookieResult = await extractCookies(provider);
      if (!cookieResult.success) continue;

      const base64Cookies = btoa(JSON.stringify(cookieResult.cookies));

      await fetch(`${entry.backendUrl}/integrations/extension-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt: entry.jwt, cookies: base64Cookies }),
      });
    } catch {
      // Silently skip — will retry next cycle
    }
  }
}

// --- Alarm Listener ---

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    refreshAllCookies();
  }
});

// --- Ensure alarm on startup ---

(async () => {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length > 0) {
    await ensureAlarm();
  }
})();

// --- Message Listener ---

chrome.runtime.onMessageExternal.addListener(
  (
    message: ExtensionRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    const origin = sender.origin ?? sender.url;
    if (!isOriginAllowed(origin)) {
      sendResponse({ error: 'Unauthorized origin' });
      return true;
    }

    switch (message.type) {
      case 'PING': {
        sendResponse({ status: 'ok', version: EXTENSION_VERSION });
        break;
      }

      case 'GET_PROVIDERS': {
        const providers = getAllProviders();
        const providerInfos: ProviderInfo[] = providers.map((p) => ({
          identifier: p.identifier,
          name: p.name,
          url: p.url,
          cookieNames: p.cookies.map((c) => c.name),
        }));
        sendResponse({ providers: providerInfos });
        break;
      }

      case 'GET_COOKIES': {
        const provider = getProvider(message.provider);
        if (!provider) {
          sendResponse({
            success: false,
            provider: message.provider,
            error: `Unknown provider: ${message.provider}`,
          });
          break;
        }

        extractCookies(provider)
          .then((result) => sendResponse(result))
          .catch((err) =>
            sendResponse({
              success: false,
              provider: message.provider,
              error: `Failed to extract cookies: ${err.message}`,
            })
          );

        return true;
      }

      case 'STORE_REFRESH_TOKEN': {
        (async () => {
          const entries = await getStoredEntries();
          entries[message.integrationId] = {
            jwt: message.jwt,
            backendUrl: message.backendUrl,
            provider: message.provider,
          };
          await setStoredEntries(entries);
          await ensureAlarm();
          sendResponse({ success: true });
        })().catch(() => sendResponse({ success: false }));

        return true;
      }

      case 'REMOVE_REFRESH_TOKEN': {
        (async () => {
          const entries = await getStoredEntries();
          delete entries[message.integrationId];
          await setStoredEntries(entries);
          await clearAlarmIfEmpty();
          sendResponse({ success: true });
        })().catch(() => sendResponse({ success: false }));

        return true;
      }

      default: {
        sendResponse({ error: `Unknown message type: ${(message as any).type}` });
        break;
      }
    }

    return true;
  }
);
