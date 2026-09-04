'use client';

import { FC, ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';
import {
  Button,
  navigationRowVariant,
} from '@contentfactory/react/form/button';

/**
 * A signed navigation row: the icon supports the label, it never replaces it.
 * When the rail is collapsed the label stays in the accessible name and in the
 * native tooltip, so the item keeps its meaning.
 *
 * The row is painted by the shared button's `navigation` variant, in both
 * branches. What the row still owns is its geometry — a 40px line with a left
 * edge and a 10px gap — because that is the rail's rhythm rather than the
 * action scale's.
 */
/**
 * Разделы, у которых есть собственная строка навигации, хотя живут они внутри
 * чужого пути. Пока такой один: «Профиль» — это `/settings?tab=profile`, и на
 * нём не должны гореть «Настройки», иначе две строки объявляют себя текущей
 * страницей одновременно.
 *
 * Список нужен потому, что строка ничего не знает о соседях: «Настройки» умеют
 * сравнить свой путь с адресом, но не могут догадаться, что этот `tab` кто-то
 * забрал себе. Появится вторая такая строка — её `tab` дописывается сюда, и
 * `tests/menu-item.current.test.cjs` держит список рядом с поведением.
 */
export const TABS_WITH_THEIR_OWN_ROW = ['profile'] as const;

/** Путь строки, разобранный на адрес и параметр `tab`, если он в нём есть. */
const splitPath = (path: string) => {
  const [route, query = ''] = path.split('?');
  return { route, tab: new URLSearchParams(query).get('tab') };
};

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  collapsed?: boolean;
  onNavigate?: () => void;
}> = ({ label, icon, path, onClick, collapsed = false, onNavigate }) => {
  const currentPath = usePathname();
  const searchParams = useSearchParams();
  const isExternal = path.indexOf('http') === 0;
  const { route, tab } = splitPath(path);
  const currentTab = searchParams?.get('tab') ?? null;
  const isActive =
    !isExternal &&
    path !== '#' &&
    currentPath.indexOf(route) === 0 &&
    // Строка, назвавшая `tab`, горит ровно на нём. Строка без `tab` горит на
    // своём пути, но уступает разделу, у которого есть отдельная строка.
    (tab
      ? currentTab === tab
      : !currentTab ||
        !(TABS_WITH_THEIR_OWN_ROW as readonly string[]).includes(currentTab));

  const rowClassName = clsx(
    'cf-nav-row group relative w-full h-[40px] flex items-center rounded-[8px] cf-body-md transition-colors duration-state',
    collapsed ? 'px-0' : 'px-[10px]',
    isActive ? 'font-[650]' : 'font-[600]'
  );

  // One declaration for both branches: the anchor puts it on itself, the button
  // hands it to the shared content wrapper. Retyping it per branch is how the
  // two halves of one row drift apart. `cf-nav-row-content` is what the
  // always-compact band between 768px and 1024px collapses, wherever the gap
  // ended up living.
  const contentClassName = clsx(
    'cf-nav-row-content',
    collapsed ? 'justify-center' : 'justify-start gap-[10px]'
  );

  const inner = (
    <>
      {/* Current item is marked by plate, bar and weight — never colour alone. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-[8px] bottom-[8px] w-[3px] rounded-full bg-cf-accent"
        />
      )}
      <span aria-hidden className="shrink-0 flex items-center justify-center w-[20px]">
        {icon}
      </span>
      <span className={clsx('cf-nav-label truncate', collapsed && 'sr-only')}>
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <Button
        variant={isActive ? 'navigation-current' : 'navigation'}
        onClick={() => {
          onClick();
          onNavigate?.();
        }}
        title={label}
        aria-current={isActive ? 'page' : undefined}
        className={rowClassName}
        innerClassName={contentClassName}
      >
        {inner}
      </Button>
    );
  }

  return (
    <Link
      prefetch={!isExternal}
      href={path}
      title={label}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      {...(isExternal && { target: '_blank', rel: 'noreferrer' })}
      className={clsx(
        rowClassName,
        navigationRowVariant(isActive),
        contentClassName
      )}
    >
      {inner}
    </Link>
  );
};
