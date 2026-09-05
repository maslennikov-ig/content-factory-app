'use client';

import { FC } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * Пустая ячейка календаря в пространстве, где ещё нет ни одного канала
 * (`content-factory-next-fn33.148`).
 *
 * На боевом прогоне 05.09.2026 та же ячейка отвечала двум ролям по-разному и
 * ни одной — понятно. Редактор получал предупреждение-всплывашку «Канал
 * подключает администратор», администратор — сразу каталог «Добавить канал».
 * Окно поста не открывалось никому, а календарь при этом рисует этапы «План /
 * Пишется / Проверка», то есть обещает работу с черновиками до всякой
 * публикации. Человек оставался с вопросом, что он вообще сделал не так.
 *
 * Почему нельзя просто открыть окно и дать написать черновик: `Post` в
 * `schema.prisma` несёт обязательный `integrationId` с обязательной связью с
 * `Integration`, а `Post` в `create.post.dto.ts` — `@IsDefined()` на
 * `integration`. Пост без канала сегодня нельзя ни сохранить, ни даже
 * отправить на дверь. Открыть окно означало бы дать человеку написать текст и
 * потерять его на «Добавить в календарь» — ровно та форма дефекта, которую
 * `content-factory-next-fn33.63` уже описал на соседнем экране. Вопрос «нужен
 * ли черновик без канала вовсе» отдан владельцу отдельной задачей
 * (`content-factory-next-fn33.159`).
 *
 * Поэтому ячейка отвечает одинаково всем: карточка, а не всплывашка (у
 * всплывашки нет второго прочтения — она уходит сама и не держит единственный
 * экземпляр объяснения). Заголовок держит шапка окна, здесь — что произошло,
 * кто это чинит и какое одно продолжение безопасно.
 */
export const NoChannelNotice: FC<{
  /** Может ли этот человек подключить канал сам. */
  canAddChannel: boolean;
  /** Может ли этот человек вообще писать посты — иначе канал ему не поможет. */
  canWritePosts: boolean;
  /** Открыть каталог каналов. Закрытие этого окна — забота вызывающего. */
  onAddChannel: () => void;
}> = ({ canAddChannel, canWritePosts, onAddChannel }) => {
  const t = useT();

  return (
    <div className="flex max-w-[520px] flex-col items-start gap-[16px]">
      <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
        {t(
          'compose_needs_channel_reason',
          'A post is always written for a channel, and this workspace has none yet.'
        )}
      </p>
      {!canAddChannel && (
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t(
            'add_channel_admin_only',
            'Adding a channel is an administrator action. Ask an administrator of this workspace to connect one.'
          )}
        </p>
      )}
      {!canWritePosts && (
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t(
            'compose_needs_channel_not_editor',
            'Writing posts is an editor action, so ask for the editor role at the same time.'
          )}
        </p>
      )}
      {canAddChannel && (
        <Button type="button" onClick={onAddChannel}>
          {t('add_channel', 'Add Channel')}
        </Button>
      )}
    </div>
  );
};
