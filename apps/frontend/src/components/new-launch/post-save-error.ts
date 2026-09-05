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
/**
 * Отказы раздела «Контент» по-русски, а не по-английски
 * (`content-factory-next-fn33.28.8`).
 *
 * Сервер отвечает `{code, message}`, и `message` у него всегда английский: это
 * строка из `posts.repository.ts` и `content-context.finalize.ts`, написанная
 * для журнала и для тех, кто читает код. Раньше она уезжала на русский экран
 * дословно, и человек на русском интерфейсе получал «A post built from checked
 * context is saved as a draft first…».
 *
 * Язык знает только клиент, поэтому текст выбирает он — по `code`, а не по
 * тексту. Код в переводе не упоминается: человеку он ничего не объясняет, а
 * тому, кто разбирает поломку, его и так видно в теле ответа.
 *
 * Клиентские двойники той же границы уже говорят по-русски
 * (`compose-block-reason.tsx`), и два ключа отсюда — это ровно они: одна
 * граница не должна звучать двумя разными фразами в зависимости от того, кто
 * первым её заметил.
 *
 * Неизвестный код — не поломка: остаётся английский `message` сервера, что
 * по-прежнему лучше молчания. Так же поступает и пустое тело.
 */
export const POST_SAVE_REFUSAL_COPY: Record<
  string,
  { key: string; fallback: string }
> = {
  CONTENT_CONTEXT_DRAFT_ONLY: {
    key: 'content_context_draft_only',
    fallback:
      'A post built from evidence stays a draft until someone confirms the evidence.',
  },
  CONTENT_CONTEXT_NOT_FOUND: {
    key: 'content_context_not_found',
    fallback: 'The evidence this post was built from is no longer available.',
  },
  CONTENT_CONTEXT_INVALIDATED: {
    key: 'content_context_invalidated',
    fallback:
      'The evidence this post was built from has expired. Check the context again.',
  },
  CONTENT_CONTEXT_PROFILE_MISMATCH: {
    key: 'content_context_profile_mismatch',
    fallback:
      'The brand profile no longer matches the evidence this post was built from.',
  },
  CONTENT_CONTEXT_CITATIONS_INVALID: {
    key: 'content_context_citations_invalid',
    fallback: 'The chosen citations do not belong to this post’s evidence.',
  },
  CONTENT_CONTEXT_INPUT_INVALID: {
    key: 'content_context_input_invalid',
    fallback: 'This post cannot be saved with the evidence it carries.',
  },
  CONTENT_EVIDENCE_REQUIRED: {
    key: 'compose_blocked_evidence_required',
    fallback:
      'Current evidence is required. Verify the context before this draft can be saved.',
  },
  POST_NOT_FOUND: {
    key: 'post_not_found_refusal',
    fallback: 'This post was not found. It may have already been deleted.',
  },
  AUTOPOST_V2_CONFLICT: {
    key: 'autopost_rule_changed',
    fallback:
      'The auto-posting rule changed while this draft was being created. Try saving again.',
  },
};

export const postSaveErrorMessage = async (
  response: { json: () => Promise<any>; status?: number },
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
  // Предел тарифа (402 без кода) уже показан общей модалкой из
  // layout.context.tsx — второй голос поверх неё ничего не добавляет
  // (content-factory-next-nkei, вторая половина fn33.105). Пустая строка —
  // знак вызывающему промолчать. Отказ 402 С кодом модалка не берёт, поэтому
  // его показывает это окно, как любой другой именованный отказ.
  if (response.status === 402 && typeof body?.code !== 'string') {
    return '';
  }
  const raw = Array.isArray(body?.message) ? body?.message[0] : body?.message;
  const serverMessage = typeof raw === 'string' ? raw.trim() : '';
  const known =
    typeof body?.code === 'string' ? POST_SAVE_REFUSAL_COPY[body.code] : null;
  const message = known
    ? String(t(known.key, known.fallback))
    : serverMessage;
  if (!message || message === 'Internal server error') {
    return fallback;
  }
  return String(
    t('post_save_failed_reason', 'The post was not saved: {{message}}', {
      message,
    })
  );
};
