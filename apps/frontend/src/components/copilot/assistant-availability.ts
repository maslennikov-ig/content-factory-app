'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  ALLOWANCE_API,
  readAllowance,
} from '@contentfactory/frontend/components/ui/allowance-hint';

/**
 * Есть ли вообще чем ответить помощнику — вопрос, отделённый от библиотеки.
 *
 * Живёт отдельным модулем, потому что ответ нужен и там, где `@copilotkit/*`
 * не нужен вовсе: экран «Агент» решает по нему, показывать ли честную строку
 * вместо приветствия (`content-factory-next-fn33.153`), и тянуть ради этого
 * решения весь рантайм помощника не за чем — ни в сборку, ни в тест.
 *
 * Спрашивается уже существующая дверь остатка квоты, а не своя: она отвечает
 * `unavailable` ровно при том условии, при котором `/copilot/chat` и
 * `/copilot/agent` отвечают 503 `AI_SELECTED_CREDENTIAL_UNAVAILABLE` — у
 * выбранного режима нет ключа (`ai.usage.service.ts`, `AiAllowanceView`).
 * Дверь открыта любому участнику, не только администратору.
 */
export type AssistantAvailability =
  /** Ответа двери ещё нет. Ни поднимать помощника, ни отказывать пока не за что. */
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
 * Тот же ответ одним «да/нет», для мест, которые только решают, поднимать ли
 * провайдера. Пока ответа нет — «нет»: провайдер, поднятый «на всякий случай»,
 * — это и есть тот самый запрос, ради которого всё и затевалось. Нечитаемый
 * ответ считается «нельзя» по той же причине; дверь при этом никого не
 * блокирует — она только решает, поднимать ли помощника.
 */
export const useAssistantAvailable = (enabled: boolean): boolean =>
  useAssistantAvailability(enabled) === 'available';
