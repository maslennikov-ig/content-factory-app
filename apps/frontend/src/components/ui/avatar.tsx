import { FC } from 'react';
import clsx from 'clsx';
import {
  displayName,
  initialOf,
  type DisplayNameSource,
} from '@contentfactory/react/helpers/display-name';

/**
 * Лицо человека там, где на него не хватает строки.
 *
 * До 04.09.2026 эту работу делал текстовый символ «●», набранный в двух местах
 * независимо: в свёрнутой рейке вместо значка «Профиля» и в форме профиля
 * вместо ненастроенной картинки. Точка не говорит ничего; первая буква
 * подписи — говорит, и берётся она из той же функции, что и сама подпись.
 *
 * Аватар скрыт от скринридера намеренно. Он сопровождает имя, а не заменяет
 * его: правило «пиктограмма дополняет подпись» здесь означает, что рядом с
 * аватаром всегда есть текст с именем человека — в рейке это подпись строки
 * меню, в форме профиля поле «Имя».
 *
 * Размер — из шкалы, а не из места вызова: 20 в строке меню, 24 в списке, 32 в
 * плотной строке, 48 в форме профиля. Всё на ритме 4px.
 */

/**
 * Размер круга и кегль буквы в нём идут одной картой. Порознь они разъезжаются:
 * `cf-label-sm` на всех размерах — это буква, тонущая в круге 48px, что и нашла
 * рецензия 04.09.2026.
 *
 * До 24px буква — метка, и токен моноширинный (`label-sm`). С 32px она уже
 * читается как содержимое круга, и берутся `body-md` и `body-lg` — обычные
 * токены шкалы, без кегля руками.
 */
const SIZE_CLASS = {
  20: 'size-[20px] cf-label-sm',
  24: 'size-[24px] cf-label-sm',
  32: 'size-[32px] cf-body-md',
  48: 'size-[48px] cf-body-lg',
} as const;

export type AvatarSize = keyof typeof SIZE_CLASS;

export const Avatar: FC<
  DisplayNameSource & {
    /** Адрес картинки профиля. Пусто — рисуется буква. */
    src?: string | null;
    size?: AvatarSize;
    className?: string;
  }
> = ({ name, email, src, size = 20, className }) => {
  const letter = initialOf({ name, email });

  return (
    <span
      aria-hidden="true"
      title={displayName({ name, email }) || undefined}
      className={clsx(
        'cf-avatar shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full',
        'border border-cf-border bg-cf-surface-subtle text-cf-ink-muted',
        SIZE_CLASS[size],
        className
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        letter
      )}
    </span>
  );
};
