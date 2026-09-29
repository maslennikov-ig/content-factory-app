'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  ALLOWANCE_API,
  readAllowance,
} from '@contentfactory/frontend/components/ui/allowance-hint';

/**
 * Есть ли вообще чем ответить модели — вопрос, отделённый от экранов.
 *
 * Экран «Агент» решает по нему, показывать ли честную строку вместо
 * приветствия (`content-factory-next-fn33.153`), раздел «Контент» — можно ли
 * звать модель, окно поста — показывать ли «Спросить агента»
 * (`content-factory-next-kcxz.28`). Жил в `components/copilot/` рядом с
 * помощником на CopilotKit; помощник ушёл, вопрос остался.
 *
 * Спрашивается уже существующая дверь остатка квоты, а не своя: она отвечает
 * `unavailable` ровно при том условии, при котором `/agent/chat` отвечает 503
 * `AI_SELECTED_CREDENTIAL_UNAVAILABLE` — у выбранного режима нет ключа
 * (`ai.usage.service.ts`, `AiAllowanceView`). Дверь открыта любому участнику,
 * не только администратору.
 */
export type AssistantAvailability =
  /** Ответа двери ещё нет. Ни обещать модель, ни отказывать пока не за что. */
  | 'checking'
  /** Позвать модель есть чем. */
  | 'available'
  /** Ни включённого лимита, ни ключа пространства: 503 гарантирован. */
  | 'unavailable'
  /**
   * Дверь не ответила. Это не «ИИ не подключён» — про подключение мы ничего не
   * узнали, — поэтому такой ответ никогда не превращается в утверждение на
   * экране.
   */
  | 'unknown';

/**
 * Ключ SWR тот же, что у строки остатка (`ALLOWANCE_API`), поэтому на экране с
 * обеими это один запрос, а не два, и он не повторяется на каждом фокусе окна.
 * Ключ `null` — договор SWR о том, что запрос не нужен вовсе: поверхность,
 * которая проверки не просила, не платит и за неё.
 */
export const useAssistantAvailability = (
  enabled: boolean
): AssistantAvailability => {
  const request = useFetch();

  const load = useCallback(
    async () => (await request(ALLOWANCE_API)).json(),
    [request]
  );

  const { data, error, isLoading } = useSWR(
    enabled ? ALLOWANCE_API : null,
    load,
    { revalidateOnFocus: false }
  );

  if (!enabled) return 'available';
  if (isLoading) return 'checking';
  if (error) return 'unknown';
  return readAllowance(data).status === 'unavailable'
    ? 'unavailable'
    : 'available';
};

/**
 * Тот же ответ одним «да/нет», для мест, которые только решают, показывать ли
 * вход к модели. Пока ответа нет — «нет»: кнопка, за которой ничего не
 * ответит, — мёртвый контрол. Нечитаемый ответ считается «нельзя» по той же
 * причине; дверь при этом никого не блокирует — она только решает, показывать
 * ли вход.
 */
export const useAssistantAvailable = (enabled: boolean): boolean =>
  useAssistantAvailability(enabled) === 'available';
