export type ProviderDiagnostic = {
  type: 'refresh-token' | 'bad-body' | 'retry';
  value: string;
};

type DiagnosticProvider = 'telegram' | 'vk' | 'meta' | 'youtube';
export type PublicProviderDiagnosticV110 = {
  provider: DiagnosticProvider;
  code: 'reconnect' | 'permissions' | 'rate_limit' | 'content';
};

const providerNames = {
  telegram: 'Telegram',
  vk: 'VK',
  meta: 'Meta',
  youtube: 'YouTube',
};
const diagnosticMessages = {
  reconnect:
    'подключение истекло или отозвано. Подключите канал заново и проверьте выданные разрешения.',
  permissions:
    'недостаточно прав. Проверьте роль администратора, доступ к каналу и разрешение на публикацию; затем подключите канал заново при необходимости.',
  rate_limit:
    'запрос отклонён из-за лимита. Дождитесь восстановления лимита и повторите попытку.',
  content:
    'проверьте текст, формат и размер медиа, обложку и настройки публикации. Исправьте содержимое перед повторной попыткой.',
};

/** Only these static categories may cross into the durable publication journal. */
export function publicProviderDiagnosticTextV110(
  value: unknown
): string | undefined {
  const diagnostic = value as PublicProviderDiagnosticV110 | undefined;
  if (
    !diagnostic ||
    typeof diagnostic.provider !== 'string' ||
    typeof diagnostic.code !== 'string' ||
    !Object.prototype.hasOwnProperty.call(providerNames, diagnostic.provider) ||
    !Object.prototype.hasOwnProperty.call(diagnosticMessages, diagnostic.code)
  )
    return undefined;
  return `${providerNames[diagnostic.provider]}: ${
    diagnosticMessages[diagnostic.code]
  }`;
}

/** A provider rejection can follow an earlier partial send; pending claims never invite a resend. */
export function publicPendingProviderDiagnosticTextV110(
  value: unknown
): string | undefined {
  const text = publicProviderDiagnosticTextV110(value);
  if (!text) return undefined;
  const diagnostic = value as PublicProviderDiagnosticV110;
  if (diagnostic.code === 'rate_limit')
    return `${
      providerNames[diagnostic.provider]
    }: площадка сообщила об ограничении запросов. Проверьте фактическое состояние публикации на площадке.`;
  if (diagnostic.code === 'content')
    return `${
      providerNames[diagnostic.provider]
    }: площадка сообщила об ошибке текста, формата, размера медиа, обложки или настроек. Проверьте фактическое состояние публикации на площадке.`;
  return text;
}

function diagnosticProvider(
  identifier: string
): DiagnosticProvider | undefined {
  return identifier === 'facebook' ||
    identifier === 'instagram' ||
    identifier === 'instagram-standalone'
    ? 'meta'
    : ['telegram', 'vk', 'youtube'].includes(identifier)
    ? (identifier as DiagnosticProvider)
    : undefined;
}

/** Read-side allowlist for old rows: unknown stored SDK text never enters an agent result. */
export function publicPendingProviderReasonFromTextV110(
  identifier: string,
  value: unknown
): string | undefined {
  const provider = diagnosticProvider(identifier);
  if (!provider || typeof value !== 'string') return undefined;
  for (const code of Object.keys(
    diagnosticMessages
  ) as PublicProviderDiagnosticV110['code'][]) {
    const text = publicPendingProviderDiagnosticTextV110({ provider, code });
    if (value === text) return text;
  }
  return undefined;
}

/** Never classify arbitrary exception text again: accept only an exact static message. */
export function publicProviderDiagnosticV110(
  identifier: string,
  error: unknown
): PublicProviderDiagnosticV110 | undefined {
  const provider = diagnosticProvider(identifier);
  if (!provider || !(error instanceof Error)) return undefined;
  for (const code of Object.keys(
    diagnosticMessages
  ) as PublicProviderDiagnosticV110['code'][]) {
    const diagnostic = { provider, code };
    if (error.message === publicProviderDiagnosticTextV110(diagnostic))
      return diagnostic;
  }
  return undefined;
}

/** Public failure messages are deliberately static: SDK errors can contain tokens,
 * request bodies and private captions. A missing receipt never permits a resend. */
export function providerErrorDiagnostic(
  provider: DiagnosticProvider,
  body: unknown,
  status = 0,
  legacy?: ProviderDiagnostic
): ProviderDiagnostic {
  let parsed: any = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
  }
  const error = parsed?.response?.body ?? parsed?.error ?? parsed ?? {};
  const code = Number(error?.error_code ?? error?.code ?? status);
  // Inspect text for classification only; none of it is returned or persisted.
  let text = '';
  try {
    text = (
      typeof body === 'string' ? body : JSON.stringify(body)
    ).toLowerCase();
  } catch {}
  const name = providerNames[provider];
  const diagnostic = (type: ProviderDiagnostic['type'], value: string) => ({
    type,
    value,
  });
  if (
    (provider === 'vk' && [5, 27, 28].includes(code)) ||
    (provider === 'meta' && code === 190) ||
    status === 401 ||
    code === 401 ||
    /invalid_grant|revoked_access_token|session has been invalidated|access token.*expired/.test(
      text
    ) ||
    legacy?.type === 'refresh-token'
  )
    return diagnostic(
      'refresh-token',
      publicProviderDiagnosticTextV110({ provider, code: 'reconnect' })!
    );

  if (
    (provider === 'vk' && [7, 15, 20, 21, 200, 203, 210, 214].includes(code)) ||
    (provider === 'meta' && [10, 200, 294].includes(code)) ||
    status === 403 ||
    code === 403 ||
    /forbidden|not enough rights|chat_admin_required|insufficientpermissions|insufficient.*permission|permission denied|access denied/.test(
      text
    )
  )
    return diagnostic(
      'bad-body',
      publicProviderDiagnosticTextV110({ provider, code: 'permissions' })!
    );

  if (
    (provider === 'vk' && [6, 9, 29].includes(code)) ||
    (provider === 'meta' && [4, 17, 32, 613, 80004].includes(code)) ||
    status === 429 ||
    code === 429 ||
    /quotaexceeded|dailylimitexceeded|rate_limit_exceeded|too many requests/.test(
      text
    )
  )
    return diagnostic(
      'retry',
      publicProviderDiagnosticTextV110({ provider, code: 'rate_limit' })!
    );

  if (
    (provider === 'vk' && [22, 100, 121, 129].includes(code)) ||
    (provider === 'telegram' && code === 400) ||
    /invalid(title|description|tags|categoryid)|invalid.*(media|video|image)|can't parse|caption.*long|message.*long|media.*(invalid|unsupported)|22070|unsupported.*(format|video|image)|thumbnail/.test(
      text
    ) ||
    legacy?.type === 'bad-body'
  )
    return diagnostic(
      'bad-body',
      publicProviderDiagnosticTextV110({ provider, code: 'content' })!
    );

  return diagnostic(
    'bad-body',
    `${name}: результат запроса не подтверждён. Проверьте публикацию на платформе перед повторной отправкой, чтобы избежать дубликата.`
  );
}
