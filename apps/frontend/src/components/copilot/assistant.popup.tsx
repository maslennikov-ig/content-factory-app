'use client';

import { FC } from 'react';
import {
  CopilotDevConsole,
  CopilotPopup,
  useChatContext,
} from '@copilotkit/react-ui';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * Окно помощника, которое звучит по-русски и для того, кто его не видит.
 *
 * `content-factory-next-fn33.118`. Видимый текст панели переводился и раньше —
 * заголовок и приветствие приходили через `labels`. Всё остальное оставалось
 * английским: `aria-label` кнопок («Open Chat», «Close», «Regenerate
 * response», «Copy to clipboard», «Thumbs up», «Thumbs down») — то, чем панель
 * представляется программе чтения с экрана, — и подпись поля ввода. Для
 * незрячего человека панель говорила на другом языке, чем страница вокруг.
 *
 * `@copilotkit/react-ui@1.10.6` переводится двумя разными способами, и оба
 * нужны. Ярлыки сообщений и поля ввода живут в пропе `labels`
 * (`placeholder`, `stopGenerating`, `regenerateResponse`, `copyToClipboard`,
 * `copied`, `thumbsUp`, `thumbsDown`, `error`) — это штатная дверь. А вот
 * кнопка вызова и крестик в шапке несут строки, вшитые в разметку библиотеки:
 * `Button.tsx` пишет `aria-label={open ? "Close Chat" : "Open Chat"}`,
 * `Header.tsx` — `aria-label="Close"`, и ни одного пропа для них нет. Штатная
 * дверь здесь другая: `Button` и `Header` — это пропы `CopilotModalProps`,
 * которыми свои узлы ставят вместо библиотечных. Разметка и классы у них те
 * же, что у оригинала, потому что на этих классах держатся стили библиотеки.
 *
 * Строка «Powered by CopilotKit» пропом не убирается: `Input.tsx` считает её
 * видимость как `!copilotApiConfig.publicApiKey`, то есть показывает всем, у
 * кого нет ключа облака CopilotKit. Её прячет правило в `global.scss` рядом с
 * остальными правилами помощника.
 */

const AssistantButton = () => {
  const { open, setOpen, icons } = useChatContext();
  const t = useT();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`copilotKitButton ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-label={
          open
            ? t('assistant_close', 'Close the assistant')
            : t('assistant_open', 'Open the assistant')
        }
      >
        <div className="copilotKitButtonIcon copilotKitButtonIconOpen">
          {icons.openIcon}
        </div>
        <div className="copilotKitButtonIcon copilotKitButtonIconClose">
          {icons.closeIcon}
        </div>
      </button>
    </div>
  );
};

const AssistantHeader = () => {
  const { setOpen, icons, labels } = useChatContext();
  const t = useT();

  return (
    <div className="copilotKitHeader">
      <div>{labels.title}</div>
      <div className="copilotKitHeaderControls">
        <CopilotDevConsole />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('close', 'Close')}
          className="copilotKitHeaderCloseButton"
        >
          {icons.headerCloseIcon}
        </button>
      </div>
    </div>
  );
};

export const AssistantPopup: FC<{
  instructions: string;
  clickOutsideToClose?: boolean;
  hitEscapeToClose?: boolean;
  /**
   * Провайдер поднимается по нажатию, и окно помощника открывается тем же
   * нажатием: иначе человек нажал бы кнопку и увидел вторую кнопку
   * (`content-factory-next-fn33.99`).
   */
  defaultOpen?: boolean;
}> = ({
  instructions,
  clickOutsideToClose = true,
  hitEscapeToClose = false,
  defaultOpen = false,
}) => {
  const t = useT();

  return (
    <CopilotPopup
      instructions={instructions}
      defaultOpen={defaultOpen}
      clickOutsideToClose={clickOutsideToClose}
      hitEscapeToClose={hitEscapeToClose}
      Button={AssistantButton}
      Header={AssistantHeader}
      labels={{
        title: t('your_assistant', 'Your Assistant'),
        initial: t(
          'assistant_initial_message',
          'Hi! I can help you to refine your social media posts.'
        ),
        placeholder: t('assistant_placeholder', 'Type a message...'),
        stopGenerating: t('assistant_stop', 'Stop generating'),
        regenerateResponse: t('assistant_regenerate', 'Regenerate response'),
        copyToClipboard: t('assistant_copy', 'Copy to clipboard'),
        copied: t('assistant_copied', 'Copied!'),
        thumbsUp: t('assistant_thumbs_up', 'Thumbs up'),
        thumbsDown: t('assistant_thumbs_down', 'Thumbs down'),
        error: t('error_occurred', 'An error occurred. Please try again.'),
      }}
    />
  );
};
