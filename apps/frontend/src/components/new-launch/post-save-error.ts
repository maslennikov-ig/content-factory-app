/**
 * Текст отказа сохранения поста — в своём файле без единого импорта.
 *
 * Он нужен и окну поста, и окну импорта отладочного поста; когда окно импорта
 * брало его из `manage.modal.tsx`, общий макет (`impersonate.tsx`) тянул за
 * собой весь редактор с DTO настроек провайдеров, и на сервере каждая
 * страница падала на `Reflect.getMetadata` (`content-factory-next-fn33.110`).
 */
/**
 * Что показать человеку, когда сервер отказался сохранять пост.
 *
 * Сервер отвечает своим `{code, message}` (см. `safeHttpError` в
 * `posts.controller.ts`), и это единственный текст, который знает причину.
 * Если тела нет или оно не читается, остаётся общая фраза: молчаливое
 * закрытие окна с потерянным черновиком — то, из-за чего это вообще написано
 * (`content-factory-next-fn33.49`).
 */
export const postSaveErrorMessage = async (
  response: { json: () => Promise<any> },
  t: (key: string, fallback: string, values?: any) => unknown
): Promise<string> => {
  const fallback = String(
    t('post_save_failed', 'The post was not saved, please try again')
  );
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }
  const raw = Array.isArray(body?.message) ? body?.message[0] : body?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message || message === 'Internal server error') {
    return fallback;
  }
  return String(
    t('post_save_failed_reason', 'The post was not saved: {{message}}', {
      message,
    })
  );
};
