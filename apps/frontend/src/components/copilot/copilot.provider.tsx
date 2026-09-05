'use client';

import { ReactNode, useContext } from 'react';
import { CopilotContext, CopilotKit } from '@copilotkit/react-core';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useAssistantAvailable } from '@contentfactory/frontend/components/copilot/assistant-availability';

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
 * Сам вопрос переехал в `assistant-availability.ts`: с
 * `content-factory-next-fn33.153` тот же ответ читает экран «Агент», которому
 * рантайм помощника ради этого решения не нужен. Здесь остаётся только его
 * применение — и повторный вывоз наружу ради кнопки, которая помощника зовёт
 * (`content-factory-next-fn33.99`): окно поста рисует её до всякого
 * провайдера, и показывать кнопку там, где помощника нельзя позвать, значило
 * бы поставить в окно ещё один мёртвый контрол. Ключ SWR тот же, поэтому
 * кнопка и провайдер спрашивают один раз на двоих.
 */
export { useAssistantAvailable };

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
