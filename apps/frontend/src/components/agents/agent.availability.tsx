'use client';

import { FC, ReactNode, useEffect, useRef } from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useAssistantAvailability } from '@contentfactory/frontend/components/copilot/assistant-availability';
import { RestrictedState } from '@contentfactory/frontend/components/ui/surface';

/**
 * Экран «Агент», когда звать модель нечем (`content-factory-next-fn33.153`).
 *
 * На боевом прогоне 05.09.2026 в области без ключа и без включённого лимита
 * экран здоровался и обещал работу: «Я могу запланировать публикацию … а также
 * сгенерировать изображения и видео». Одновременно с этим на открытии уходил
 * `POST /copilot/agent` и возвращал 503
 * `AI_SELECTED_CREDENTIAL_UNAVAILABLE`; ответ шёл через рантайм CopilotKit,
 * мимо общего обработчика отказов, и на экране про него не было ни слова.
 * Человек написал бы агенту и не понял, почему тот молчит.
 *
 * Поэтому решение принимается до разговора, а не после его ошибки: пока
 * помощнику нечем ответить, разговор (`useChat` в `agent.conversation.tsx`,
 * `content-factory-next-kcxz.10`) в дерево не попадает вовсе — значит, и
 * запроса, который заведомо упадёт, не уходит.
 *
 * Слова берутся те же, что говорит раздел «Контент» строкой остатка
 * (`ai_allowance_unavailable`): один отказ — одно предложение, а не два разных
 * объяснения одного и того же состояния в двух местах продукта.
 */
export const AgentAvailabilityGate: FC<{
  children: ReactNode;
  /**
   * Told whether the gate is showing «ИИ не подключён» instead of the
   * conversation, so the screen does not keep a starter for a conversation
   * that is not there (review W3-21 P3-4).
   */
  onUnavailable?: (unavailable: boolean) => void;
}> = ({ children, onUnavailable }) => {
  const t = useT();
  const availability = useAssistantAvailability(true);

  /**
   * Once the conversation is open it stays mounted (`content-factory-next-
   * kcxz.29`, D2). The answer of this door is read again whenever the
   * allowance line or another screen revalidates it; swapping the
   * conversation for «Проверяем…» on the way would unmount `useChat` and cut
   * the turn that is streaming. If AI is switched off meanwhile, the server
   * says so on the next message.
   */
  const opened = useRef(false);
  const unavailable = !opened.current && availability === 'unavailable';
  useEffect(() => {
    onUnavailable?.(unavailable);
  }, [onUnavailable, unavailable]);
  if (opened.current) return <>{children}</>;

  if (availability === 'checking') {
    return (
      <div className="flex flex-1 items-start justify-center bg-cf-surface p-[40px]">
        <p className="cf-body-sm text-cf-ink-muted" aria-live="polite">
          {t('agent_checking_ai', 'Checking whether AI is connected…')}
        </p>
      </div>
    );
  }

  /**
   * `unknown` — дверь квоты не ответила. Про подключение мы при этом ничего не
   * узнали, поэтому утверждать «ИИ не подключён» нельзя: разговор открывается,
   * и если модель звать всё-таки нечем, откажет сервер.
   */
  if (availability === 'unavailable') {
    return (
      <div className="flex flex-1 items-start justify-center bg-cf-surface p-[40px]">
        <RestrictedState
          className="max-w-[560px]"
          title={t('agent_ai_unavailable_title', 'The agent cannot answer yet')}
          reason={t(
            'ai_allowance_unavailable',
            'AI is not connected yet: no included allowance and no workspace key. An administrator can set this up in Settings → Global Settings.'
          )}
        />
      </div>
    );
  }

  opened.current = true;
  return <>{children}</>;
};
