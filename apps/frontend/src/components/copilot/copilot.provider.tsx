'use client';

import { ReactNode, useContext } from 'react';
import { CopilotContext, CopilotKit } from '@copilotkit/react-core';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

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

export const CopilotProvider = ({ children }: { children: ReactNode }) => {
  const { backendUrl } = useVariables();
  const parentContext = useContext(CopilotContext);

  if (alreadyProvided(parentContext)) {
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
