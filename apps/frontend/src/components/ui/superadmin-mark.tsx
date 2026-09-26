'use client';

import { createContext, FC, ReactNode, useContext } from 'react';
import clsx from 'clsx';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

/**
 * Метка «это видно только суперадмину».
 *
 * Решение владельца 26.09.2026: суперадмин видит в меню и в настройках всё,
 * что остальным закрыто ролью, тарифом или состоянием пространства, — но так,
 * чтобы не принять это за то, что увидит обычный участник. Щит охрой
 * `signature`: это маркер узнавания, а не действие и не статус, поэтому не
 * зелёный `accent`. Смысл несёт не только цвет — у щита есть имя для
 * скринридера и подсказка при наведении.
 */
export const superadminOnlyLabel = (language: string) =>
  language.startsWith('ru') ? 'Видно только суперадмину' : 'Visible to superadmin only';

export const SuperadminMark: FC<{ className?: string }> = ({ className }) => {
  const { language } = useVariables();
  const label = superadminOnlyLabel(language);
  return (
    <span
      title={label}
      data-superadmin-only=""
      className={clsx('inline-flex shrink-0 items-center text-cf-signature', className)}
    >
      <svg
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
      >
        <path
          d="M10 1.667 3.333 4.167v5c0 4.208 2.845 7.35 6.667 8.5 3.822-1.15 6.667-4.292 6.667-8.5v-5L10 1.667Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.2"
        />
        <path
          d="m7.5 9.583 1.667 1.667 3.333-3.333"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
};

/**
 * Всё внутри показано только потому, что смотрит суперадмин. Блок настроек
 * (`SettingsSection`) читает это и ставит метку рядом со своим именем, так
 * что компоненту блока не нужно знать, кто и почему его открыл.
 */
const SuperadminOnlyContext = createContext(false);

export const SuperadminOnly: FC<{ children: ReactNode }> = ({ children }) => (
  <SuperadminOnlyContext.Provider value={true}>
    {children}
  </SuperadminOnlyContext.Provider>
);

export const useSuperadminOnly = () => useContext(SuperadminOnlyContext);
