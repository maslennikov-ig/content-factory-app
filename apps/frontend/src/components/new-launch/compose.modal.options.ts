/**
 * Флаги окна поста — без `'use client'` и без React, чтобы их мог читать и
 * адаптер вкладки материалов, и набор в Node. Хук `useOpenPostEditor` рядом
 * их применяет.
 *
 * Одно окно поста — один набор флагов.
 *
 * До `content-factory-next-tu3k.9.11` эти девять строк стояли литералом в
 * шести местах: календарь, «Чистый лист», меню канала, генератор, наборы,
 * помощник. Каждое место могло разойтись с остальными на один флаг, и
 * расходилось: у одной двери окно закрывалось щелчком мимо, у другой нет.
 * Флаги описывают одно и то же окно, поэтому лежат в одном месте, а не
 * повторяются столько раз, сколько у окна дверей.
 *
 * Про `closeOnEscape: false`: поле читает не тот, кто думает. Escape закрывает
 * верхнее окно всегда — `Component` в `layout/new-modal.tsx` вешает
 * `useHotkeys('Escape')` безусловно, — а `askClose: true` заставляет клавишу
 * сначала спросить, не потеряется ли написанное. Окно и так уходит по Escape,
 * поэтому крестику незачем заводить собственный обработчик этой клавиши.
 */
export const COMPOSE_MODAL_OPTIONS = {
  /**
   * Один идентификатор у всех дверей — это и есть запрет открыть второе окно
   * поста поверх первого: `openModal` пропускает только первое с таким `id`.
   * На него же смотрит `layout/click.outside.tsx`.
   */
  id: 'add-edit-modal',
  closeOnClickOutside: false,
  removeLayout: true,
  closeOnEscape: false,
  /**
   * Крестик рисует само окно в шапке редактора: крестик оболочки встал бы
   * поверх одной из его полос. См. `manage.modal.tsx`.
   */
  withCloseButton: false,
  askClose: true,
  fullScreen: true,
  classNames: {
    modal: 'w-[100%] max-w-[1400px] text-cf-ink',
  },
  // `removeLayout` renders its own wrapper and skips Dialog's viewport width
  // cap. The editor owns its responsive width: full-screen on phones and 80%
  // on desktop, matching the previous desktop layout.
  size: '100%',
  /** Заголовок окно печатает само — «Создать пост», «Изменить», «Пост». */
  title: '',
} as const;
