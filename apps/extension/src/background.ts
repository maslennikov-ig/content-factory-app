import {
  ExtensionRequest,
  GetCookiesResponse,
  ProviderInfo,
  RefreshStatus,
  StoredRefreshEntry,
} from './types/messages';
import { getAllProviders, getProvider } from './providers/provider.registry';
import { CookieProvider } from './providers/cookie-provider.interface';

const REFRESH_ALARM_NAME = 'cookie-refresh';
const STORAGE_KEY = 'refreshEntries';
const STATUS_KEY = 'refreshStatuses';
const RECONNECT_ERROR = 'Переподключите канал Skool в Content Factory.';
const RETRY_ERROR =
  'Не удалось обновить подключение. Повторим автоматически; если ошибка сохраняется, переподключите канал.';

// Only storage mutations are serialized. Network calls never hold this chain.
let storageMutation: Promise<unknown> = Promise.resolve();
function mutateStorage<T>(operation: () => Promise<T>): Promise<T> {
  const next = storageMutation.then(operation);
  storageMutation = next.catch(() => undefined);
  return next;
}

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

function validatedBackendUrl(value: string, senderOrigin?: string): URL {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !isOriginAllowed(url.origin)
  ) {
    throw new Error(
      'Недопустимый адрес сервера. Переподключите канал в Content Factory.'
    );
  }
  if (senderOrigin) {
    const sender = new URL(senderOrigin);
    if (url.hostname !== sender.hostname || url.protocol !== sender.protocol) {
      throw new Error('Адрес сервера не соответствует странице подключения.');
    }
  }
  return url;
}

async function hasBackendPermission(url: URL): Promise<boolean> {
  // Chrome host match patterns do not include a port.
  return chrome.permissions.contains({
    origins: [`${url.protocol}//${url.hostname}/*`],
  });
}

async function extractCookies(
  provider: CookieProvider
): Promise<GetCookiesResponse> {
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
      error: `Missing required cookies: ${missingRequired.join(
        ', '
      )}. User may need to log in to ${provider.name}.`,
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

async function getStoredStatuses(): Promise<Record<string, RefreshStatus>> {
  const result = await chrome.storage.local.get(STATUS_KEY);
  return result[STATUS_KEY] || {};
}

async function updateIndicator(): Promise<void> {
  const statuses = await getStoredStatuses();
  const failure = Object.values(statuses).find((status) => !status.success);
  await chrome.action.setBadgeText({ text: failure ? '!' : '' });
  await chrome.action.setTitle({
    title: failure
      ? `Content Factory: ${failure.error || RETRY_ERROR}`
      : 'Content Factory',
  });
}

async function recordStatus(
  integrationId: string,
  entry: StoredRefreshEntry,
  status: RefreshStatus
): Promise<void> {
  await mutateStorage(async () => {
    const current = (await getStoredEntries())[integrationId];
    // A delayed reply belongs to the connection which made the request.
    if (
      !current ||
      current.jwt !== entry.jwt ||
      current.backendUrl !== entry.backendUrl ||
      current.provider !== entry.provider
    )
      return;
    const statuses = await getStoredStatuses();
    await chrome.storage.local.set({
      [STATUS_KEY]: { ...statuses, [integrationId]: status },
    });
    await updateIndicator();
  });
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(REFRESH_ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 1440 });
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
      let url: URL;
      try {
        url = validatedBackendUrl(entry.backendUrl);
      } catch {
        await recordStatus(integrationId, entry, {
          success: false,
          error:
            'Недопустимый адрес сервера. Переподключите канал в Content Factory.',
        });
        continue;
      }
      if (!(await hasBackendPermission(url))) {
        await recordStatus(integrationId, entry, {
          success: false,
          error:
            'Разрешите расширению доступ к серверу Content Factory и переподключите канал.',
        });
        continue;
      }
      const provider = getProvider(entry.provider);
      if (!provider || typeof entry.jwt !== 'string' || !entry.jwt) {
        await recordStatus(integrationId, entry, {
          success: false,
          error: RECONNECT_ERROR,
        });
        continue;
      }

      const cookieResult = await extractCookies(provider);
      if (!cookieResult.success) {
        await recordStatus(integrationId, entry, {
          success: false,
          error: `Войдите в ${provider.name} в этом браузере, чтобы обновить подключение.`,
        });
        continue;
      }

      const base64Cookies = btoa(JSON.stringify(cookieResult.cookies));

      const response = await fetch(
        `${url.href.replace(/\/$/, '')}/integrations/extension-refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jwt: entry.jwt, cookies: base64Cookies }),
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        }
      );
      if ([401, 403, 404].includes(response.status)) {
        await recordStatus(integrationId, entry, {
          success: false,
          error: RECONNECT_ERROR,
        });
      } else if (!response.ok) {
        await recordStatus(integrationId, entry, {
          success: false,
          error: RETRY_ERROR,
        });
      } else {
        const result = await response.json();
        const status: RefreshStatus =
          result?.success === true
            ? { success: true }
            : {
                success: false,
                error:
                  result?.reason === 'account_mismatch'
                    ? RECONNECT_ERROR
                    : RETRY_ERROR,
              };
        await recordStatus(integrationId, entry, status);
      }
    } catch {
      await recordStatus(integrationId, entry, {
        success: false,
        error: RETRY_ERROR,
      });
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
  await updateIndicator();
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
        sendResponse({
          status: 'ok',
          version: chrome.runtime.getManifest().version,
        });
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
          if (
            !getProvider(message.provider) ||
            typeof message.jwt !== 'string' ||
            !message.jwt ||
            typeof message.integrationId !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,128}$/.test(message.integrationId) ||
            ['__proto__', 'constructor', 'prototype'].includes(
              message.integrationId
            ) ||
            typeof message.backendUrl !== 'string'
          ) {
            sendResponse({
              success: false,
              error: 'Некорректное подключение. Переподключите канал.',
            });
            return;
          }
          const url = validatedBackendUrl(message.backendUrl, origin);
          if (!(await hasBackendPermission(url))) {
            sendResponse({
              success: false,
              error: 'Разрешите расширению доступ к серверу Content Factory.',
            });
            return;
          }
          await mutateStorage(async () => {
            const entries = await getStoredEntries();
            const statuses = await getStoredStatuses();
            delete statuses[message.integrationId];
            await chrome.storage.local.set({
              [STORAGE_KEY]: {
                ...entries,
                [message.integrationId]: {
                  jwt: message.jwt,
                  backendUrl: message.backendUrl,
                  provider: message.provider,
                },
              },
              [STATUS_KEY]: statuses,
            });
            await ensureAlarm();
            await updateIndicator();
          });
          sendResponse({ success: true });
        })().catch(() =>
          sendResponse({
            success: false,
            error:
              'Недопустимый адрес сервера или подключение. Переподключите канал.',
          })
        );

        return true;
      }

      case 'REMOVE_REFRESH_TOKEN': {
        (async () => {
          await mutateStorage(async () => {
            const entries = await getStoredEntries();
            const statuses = await getStoredStatuses();
            delete entries[message.integrationId];
            delete statuses[message.integrationId];
            await chrome.storage.local.set({
              [STORAGE_KEY]: entries,
              [STATUS_KEY]: statuses,
            });
            await clearAlarmIfEmpty();
            await updateIndicator();
          });
          sendResponse({ success: true });
        })().catch(() => sendResponse({ success: false }));

        return true;
      }

      default: {
        sendResponse({
          error: `Unknown message type: ${(message as any).type}`,
        });
        break;
      }
    }

    return true;
  }
);
