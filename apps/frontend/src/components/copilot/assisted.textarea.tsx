'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { CopilotTextarea } from '@copilotkit/react-textarea';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useHasCopilotProvider } from '@contentfactory/frontend/components/copilot/copilot.provider';

/**
 * Поле, которое пишется и без помощника (`content-factory-next-fn33.28.16`).
 *
 * `CopilotTextarea` без поднятого `<CopilotKit>` бросает исключение библиотеки
 * «Remember to wrap your app in a <CopilotKit>», поэтому экран, который рисует
 * его напрямую, обязан поднимать провайдера всегда — даже у пространства без
 * ключа AI, где каждое открытие давало `POST /copilot/chat -> 503`. Ровно из-за
 * этого признак `requireAvailable` стоял только у окна поста: там связь с
 * помощником уже уехала в отдельный узел (`EditorCopilotBridge`), а подписи,
 * автопостинг и дополнения просили провайдера безусловно.
 *
 * Здесь тот же приём и для них: условие переехало с хука на узел. Под поднятым
 * провайдером это прежнее поле помощника; без него — обычное поле ввода с теми
 * же подписью, значением и оформлением, потому что класс приходит снаружи и
 * обеим веткам достаётся один и тот же.
 *
 * Один узел на три экрана, а не три копии одного решения: разъехавшись, они
 * разъехались бы молча — сломанной выглядела бы не разметка, а помощник.
 */
export const AssistedTextarea: FC<{
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  placeholder: string;
  className?: string;
  /** Что подсказывать: текст для помощника, обычному полю не нужный. */
  purpose: string;
}> = ({ value, onChange, placeholder, className, purpose }) => {
  const hasCopilot = useHasCopilotProvider();

  if (!hasCopilot) {
    return (
      <Textarea
        standalone
        disableForm
        // `w-full` — не украшение, а равенство: `CopilotTextarea` рисует блок
        // и занимает всю ширину сам, а у родного поля ширина считается в
        // символах, и без этого поле без помощника вышло бы вдвое уже того же
        // поля с помощником. Всё остальное оформление приходит снаружи.
        className={clsx('w-full', className)}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <CopilotTextarea
      disableBranding={true}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      autosuggestionsConfig={{
        textareaPurpose: purpose,
        chatApiConfigs: {},
      }}
    />
  );
};
