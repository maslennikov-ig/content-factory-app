'use client';

import { formatStoredMarkup } from './adaptation-markup';
import type { AdaptationImageV1 } from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * «Как увидят в <площадке>» (`97dq.48`, вариант A двенадцатой волны).
 *
 * На одиннадцатом заходе владелец назвал прежнее окошко справа «слишком
 * маленьким, и оно съедает изображение… не помещается часть текста». Теперь
 * предпросмотр встаёт на место текста, во всю ширину колонки: пузырь около
 * 440 px по центру на `surface-subtle`, текст целиком, без обрезки строк,
 * картинка целиком — в своих пропорциях, без `object-cover`.
 *
 * Правки здесь нет: «Редактировать» живёт в режиме «Текст».
 */
export function PostPreview({
  locale,
  channelName,
  text,
  image,
  time,
  draftId,
}: {
  locale: PiecesLocale;
  channelName: string;
  text: string;
  image: AdaptationImageV1 | null;
  /** Время поста, если оно уже решено; иначе подписи нет. */
  time: string | null;
  draftId: string;
}) {
  const t = piecesCopy[locale];
  return (
    <div
      data-piece-preview={draftId}
      className="flex min-w-0 justify-center rounded-[8px] bg-cf-surface-subtle p-[16px] sm:p-[24px]"
    >
      <div className="flex w-full min-w-0 max-w-[440px] flex-col gap-[8px] rounded-[12px] rounded-es-[4px] border border-cf-border bg-cf-surface-raised px-[12px] pb-[8px] pt-[12px]">
        <span className="cf-label-md text-cf-ink">{channelName}</span>
        {image?.path ? (
          <img
            src={image.path}
            alt={t.imageAlt}
            data-piece-preview-image="true"
            className="block h-auto w-full rounded-[8px]"
          />
        ) : image ? (
          <span className="cf-caption text-cf-ink-muted">{t.imageAttached}</span>
        ) : null}
        <p className="whitespace-pre-wrap cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
          {formatStoredMarkup(text)}
        </p>
        {time ? (
          <span className="self-end cf-caption tabular-nums text-cf-ink-muted">
            {time}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default PostPreview;
