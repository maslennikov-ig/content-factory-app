'use client';

import { useCallback } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import {
  CalendarWeekProvider,
  useCalendar,
} from '@contentfactory/frontend/components/launches/calendar.context';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import { IntakeContainer } from '@contentfactory/frontend/components/content-intelligence/intake/intake.container';

/**
 * Первая из двух дверей во вход одной мыслью — рядом с «Создать пост».
 *
 * `content-factory-next-tu3k.4`, решение владельца 06.09.2026 (пункт 1). На
 * этом месте стояла кнопка «Generate Posts» (`generator/generator.tsx`), и её
 * не было видно ни на боевом, ни у большинства пространств: она требовала
 * `billingEnabled` и оплаченного тарифа с ИИ. Дверь при этом вела в лучший
 * инструмент продукта. Новая дверь условия оплаты не несёт — право писать
 * читается ролью, а есть ли чем позвать модель, решает уже сам экран и
 * говорит об этом словами вместо того, чтобы исчезнуть.
 *
 * Модалка над модалкой — то же наложение, что у прежней кнопки: календарь
 * прокидывается провайдером внутрь, потому что окно поста, которое экран
 * откроет следующим, читает неделю из этого же контекста.
 *
 * Свёрнутая рейка: у кнопки остаётся только знак, а имя уходит в
 * `aria-label` — ровно так же ведут себя её соседи в свёрнутом состоянии.
 */

const IntakeMark = () => (
  <svg
    aria-hidden
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M3 15.5V17h1.5l8.8-8.8-1.5-1.5L3 15.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M14.4 5.6 16 4l-1.5-1.5L13 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function IntakeDoor({ collapsed = false }: { collapsed?: boolean }) {
  const modal = useModals();
  const user = useUser();
  const all = useCalendar();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const label = locale === 'ru' ? 'Из мысли' : 'From a thought';

  const open = useCallback(() => {
    modal.openModal({
      title: '',
      withCloseButton: false,
      askClose: true,
      classNames: { modal: 'bg-transparent text-textColor' },
      size: 'xl',
      children: (
        <CalendarWeekProvider {...all}>
          <div className="rounded-[12px] border border-cf-border bg-cf-surface p-[20px]">
            <IntakeContainer surface="calendar" />
          </div>
        </CalendarWeekProvider>
      ),
    });
  }, [all, modal]);

  // Дверь принадлежит тому, кто пишет. Участник, который не может написать
  // текст, не видит кнопку, которая приведёт его к отказу.
  if (!isOrganizationEditor(user?.role)) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      data-intake-door="calendar"
      iconOnly={collapsed}
      aria-label={label}
      onClick={open}
    >
      {collapsed ? <IntakeMark /> : label}
    </Button>
  );
}

export default IntakeDoor;
