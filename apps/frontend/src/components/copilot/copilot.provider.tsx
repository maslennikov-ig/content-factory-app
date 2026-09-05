'use client';

import { ReactNode, useCallback, useContext } from 'react';
import useSWR from 'swr';
import { CopilotContext, CopilotKit } from '@copilotkit/react-core';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  ALLOWANCE_API,
  readAllowance,
} from '@contentfactory/frontend/components/ui/allowance-hint';

/**
 * Помощник заговаривает с рантаймом сразу, как его смонтировали.
 *
 * `@copilotkit/react-core@1.10.6` на монтировании провайдера безусловно шлёт
 * `availableAgents` на `runtimeUrl` — эффектом с пустым списком зависимостей,
 * без пропа, который это отложил бы. Пока провайдер стоял вокруг всего
 * приложения, это был запрос (а у области с настроенным поставщиком моделей —
 * платный вызов) на каждой загрузке каждой страницы, хотя окно помощника никто
 * не открывал: `content-factory-next-fn33.48`, `content-factory-next-fn33.93`.
 *
 * Поэтому провайдер живёт здесь и монтируется поимённо — только на экранах,
 * которые помощником пользуются.
 */

/**
 * Провайдеры вкладываются друг в друга: например, окно автопостинга рисует и
 * `CopilotTextarea`, и выбор каналов, который тоже приносит своего провайдера.
 * Второй провайдер стоил бы второго запроса, поэтому вложенный уходит в
 * сторону. Пустой контекст библиотеки отличается тем, что `runtimeClient` в нём
 * — пустой объект без методов; `useCopilotContext` на нём бросает исключение,
 * поэтому проверяем контекст напрямую.
 */
const alreadyProvided = (context: unknown): boolean =>
  typeof (context as { runtimeClient?: { availableAgents?: unknown } } | null)
    ?.runtimeClient?.availableAgents === 'function';

/**
 * «Есть ли над этим местом помощник?»
 *
 * Нужен там, где компонент рассказывает помощнику о себе (`useCopilotReadable`,
 * `useCopilotAction`), но сам помощника не открывает: выбор каналов рисуется и
 * на экранах вебхуков и каналов, где окна помощника нет вовсе. Такие подсказки
 * регистрируются только под провайдером, иначе они стоили бы лишнего запроса
 * ради помощника, которого на экране нельзя позвать.
 */
export const useHasCopilotProvider = (): boolean =>
  alreadyProvided(useContext(CopilotContext));

/**
 * Есть ли вообще чем ответить помощнику (`content-factory-next-fn33.28.11`).
 *
 * У пространства без ключа AI каждое открытие окна поста давало
 * `POST /copilot/chat -> 503` и строку в консоли: провайдер шлёт
 * `availableAgents` на монтировании безусловно, а сервер на этой двери
 * отвечает `AI_SELECTED_CREDENTIAL_UNAVAILABLE`. Человеку ошибка не видна, но
 * запрос уходит и падает каждый раз.
 *
 * Спрашиваем уже существующую дверь остатка квоты вместо того, чтобы заводить
 * свою: она отвечает `unavailable` ровно при том условии, при котором
 * `/copilot/chat` отвечает 503 — у выбранного режима нет ключа. Ключ SWR тот
 * же, что у строки остатка (`ALLOWANCE_API`), поэтому на экране с обеими это
 * один запрос, а не два, и он не повторяется при каждом открытии.
 *
 * Пока ответа нет, помощник не монтируется: провайдер, поднятый «на всякий
 * случай», — это и есть тот самый запрос. Нечитаемый ответ считается «нельзя»
 * по той же причине; дверь при этом никого не блокирует — она только решает,
 * поднимать ли помощника.
 */
const useAssistantAvailable = (enabled: boolean): boolean => {
  const request = useFetch();

  const load = useCallback(
    async () => (await request(ALLOWANCE_API)).json(),
    [request]
  );

  // Ключ `null` — договор SWR о том, что запрос не нужен вовсе: поверхность,
  // которая проверки не просила, не платит и за неё.
  const { data, error, isLoading } = useSWR(enabled ? ALLOWANCE_API : null, load, {
    revalidateOnFocus: false,
  });

  if (!enabled) return true;
  if (isLoading || error) return false;
  return readAllowance(data).status !== 'unavailable';
};

export const CopilotProvider = ({
  children,
  /**
   * Проверять доступность помощника перед тем, как его поднимать.
   *
   * Признак, а не поведение по умолчанию, и причина в договоре с детьми. Без
   * провайдера `useCopilotContext` библиотеки бросает исключение, поэтому
   * поверхность, которая рисует `CopilotTextarea` или зовёт хуки помощника
   * безусловно, обязана сначала научиться жить без него — как это сделано в
   * окне поста, где хуки уехали в отдельный узел под `useHasCopilotProvider()`.
   *
   * Признак стоит у окна поста (`content-factory-next-fn33.28.11`), а с
   * `content-factory-next-fn33.28.16` — и у подписей, автопостинга и
   * дополнений: `CopilotTextarea` уехал у них за `AssistedTextarea`, который
   * без провайдера рисует обычное поле.
   */
  requireAvailable = false,
}: {
  children: ReactNode;
  requireAvailable?: boolean;
}) => {
  const { backendUrl } = useVariables();
  const parentContext = useContext(CopilotContext);
  const available = useAssistantAvailable(requireAvailable);

  if (alreadyProvided(parentContext)) {
    return <>{children}</>;
  }

  /**
   * Без доступного помощника дети рисуются без провайдера, а не под пустым.
   * Те из них, кто помощнику о себе рассказывает, спрашивают
   * `useHasCopilotProvider()` и молчат — это тот же договор, по которому живёт
   * выбор каналов на экранах без помощника.
   */
  if (requireAvailable && !available) {
    return <>{children}</>;
  }

  return (
    <CopilotKit
      credentials="include"
      runtimeUrl={backendUrl + '/copilot/chat'}
      showDevConsole={false}
    >
      {children}
    </CopilotKit>
  );
};
