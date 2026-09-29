'use client';

import { FC, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@contentfactory/react/form/button';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import {
  useLaunchStore,
  type Internal,
  type Values,
} from '@contentfactory/frontend/components/new-launch/store';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import {
  AGENT_FROM_EDITOR_HREF,
  editorHandoffFrom,
  writeEditorHandoff,
} from '@contentfactory/frontend/components/agents/agent.handoff';

/**
 * Текст, который окно показывает сейчас (review W6-28 F1). Существующий пост
 * и правка под отдельный канал живут в `internal` этого канала, а `global`
 * у них — пустая заглушка; общий текст — в `global`. Если выбранное пусто, а
 * свой текст есть ровно у одного канала, берётся он.
 */
export const shownTexts = ({
  current,
  internal,
  global,
}: {
  current: string;
  internal: Internal[];
  global: Values[];
}): string[] => {
  const plain = (values: Values[] | undefined) =>
    (values ?? [])
      .map((value) => stripHtmlValidation('normal', value.content || '').trim())
      .filter(Boolean);
  const shown =
    current !== 'global'
      ? plain(internal.find((one) => one.integration?.id === current)?.integrationValue)
      : plain(global);
  if (shown.length) return shown;
  const own = internal.filter((one) => plain(one.integrationValue).length);
  return own.length === 1 ? plain(own[0].integrationValue) : [];
};

/**
 * «Спросить агента» в окне поста (`content-factory-next-kcxz.28`).
 *
 * Одна кнопка вместо помощника на CopilotKit: окно говорит, что это за пост —
 * заготовка, из которой он сделан, канал, а у поста без заготовки его текст, —
 * и уходит в новый разговор агента. Просьба ложится в поле ввода и не
 * отправляется: отправляет человек (`agent.handoff.ts`). Уход закрывает окно,
 * поэтому спрашивается то же подтверждение, что у «К заготовке».
 */
export const AskAgentButton: FC<{ label: string; close: () => void }> = ({
  label,
  close,
}) => {
  const t = useT();
  const router = useRouter();
  const existingData = useExistingData();
  const { current, internal, global, selectedIntegrations } = useLaunchStore(
    useShallow((state) => ({
      current: state.current,
      internal: state.internal,
      global: state.global,
      selectedIntegrations: state.selectedIntegrations,
    }))
  );

  const ask = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!')
      ))
    ) {
      return;
    }
    const post = existingData.posts?.[0] as
      | { piece?: { title?: string | null; code?: string | null } | null }
      | undefined;
    writeEditorHandoff(
      window.sessionStorage,
      editorHandoffFrom({
        piece: post?.piece?.title,
        code: post?.piece?.code,
        channels: selectedIntegrations
          .map((selected) => selected.integration?.name)
          .filter((name): name is string => !!name),
        texts: shownTexts({ current, internal, global }),
      })
    );
    close();
    router.push(AGENT_FROM_EDITOR_HREF);
  }, [close, current, existingData, global, internal, router, selectedIntegrations, t]);

  return (
    <Button type="button" variant="quiet" onClick={ask}>
      {label}
    </Button>
  );
};
