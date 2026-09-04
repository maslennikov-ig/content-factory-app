export interface Params {
  baseUrl: string;
  beforeRequest?: (url: string, options: RequestInit) => Promise<RequestInit>;
  afterRequest?: (
    url: string,
    options: RequestInit,
    response: Response
  ) => Promise<boolean>;
}
export const customFetch = (
  params: Params,
  auth?: string,
  showorg?: string,
  secured: boolean = true
) => {
  return async function newFetch(url: string, options: RequestInit = {}) {
    const currentLocation =
      typeof window === 'undefined' ? undefined : new URL(window.location.href);
    const loggedAuth =
      currentLocation?.pathname.startsWith('/provider/')
        ? currentLocation.searchParams.get('loggedAuth')
        : undefined;
    const newRequestObject = await params?.beforeRequest?.(url, options);
    const authNonSecuredCookie =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('auth='))
            ?.split('=')[1];

    const authNonSecuredOrg =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('showorg='))
            ?.split('=')[1];

    const authNonSecuredImpersonate =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('impersonate='))
            ?.split('=')[1];

    const fetchRequest = await fetch(params.baseUrl + url, {
      ...(secured ? { credentials: 'include' } : {}),
      ...(newRequestObject || options),
      headers: {
        ...(showorg
          ? { showorg }
          : authNonSecuredOrg
          ? { showorg: authNonSecuredOrg }
          : {}),
        ...(options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        Accept: 'application/json',
        ...(loggedAuth ? { auth: loggedAuth } : {}),
        ...options?.headers,
        ...(auth
          ? { auth }
          : authNonSecuredCookie
          ? { auth: authNonSecuredCookie }
          : {}),
        ...(authNonSecuredImpersonate
          ? { impersonate: authNonSecuredImpersonate }
          : {}),
      },
      // @ts-ignore
      ...(!options.next && options.cache !== 'force-cache'
        ? { cache: options.cache || 'no-store' }
        : {}),
    });

    /*
     * Общий обработчик читает тело отказа (403, 406, 402), поэтому отказу
     * уходит копия: иначе вызывающий код получил бы ответ с уже вычерпанным
     * телом и упал бы на `.json()` вместо того, чтобы показать отказ.
     *
     * `content-factory-next-fn33.105`: копия снималась с каждого ответа, а
     * читалась только у отказа. Непрочитанная копия удерживает поток целиком:
     * генерация постов читается через `getReader()`, и браузер вынужден
     * держать всё написанное в памяти, чтобы обе половины копии шли вровень.
     * У удачного ответа обработчик смотрит только заголовки, поэтому ему
     * достаётся сам ответ.
     */
    await params?.afterRequest?.(
      url,
      options,
      fetchRequest.ok ? fetchRequest : fetchRequest.clone()
    );

    /*
     * Ответ возвращается всегда, даже когда отказ уже показан общей модалкой.
     *
     * `content-factory-next-fn33.65`: здесь стоял `new Promise((res) => {})` —
     * промис без `resolve` и без `reject`. Экран, ожидавший ответа, не получал
     * его никогда: `finally` не срабатывал, и кнопка навсегда оставалась в
     * состоянии «Сохраняем…». Теперь вызывающий код получает свой ответ с
     * `ok === false` и сам решает, показывать ли что-то поверх модалки.
     */
    return fetchRequest;
  };
};

export const fetchBackend = customFetch({
  get baseUrl() {
    return process.env.BACKEND_URL!;
  },
});
