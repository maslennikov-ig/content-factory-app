'use client';

import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';

/**
 * Режим плана канала и поста (`content-factory-next-97dq.57`, `97dq.70`).
 *
 * Три режима, как адаптация встаёт в календарь: «Без плана», «Бронь»
 * (умолчание) и «Автопилот». Режим канала живёт в своей колонке
 * `Integration.planMode`; свой режим поста — в его настройках. Поле рисует
 * общая панель настроек (`pieces/post-options.panel.tsx`) в обеих областях;
 * здесь — слова, адрес и чтение.
 */

export type ChannelPlanMode = 'draft' | 'reserve' | 'autopilot';

export const CHANNEL_PLAN_MODES: readonly ChannelPlanMode[] = [
  'draft',
  'reserve',
  'autopilot',
];

export const channelPlanModeUrl = (integrationId: string) =>
  `/integrations/${encodeURIComponent(integrationId)}/plan-mode`;

/** NULL, мусор и старый сервер читаются как «Бронь». */
export function readChannelPlanMode(value: unknown): ChannelPlanMode {
  const mode = (value as { planMode?: unknown } | null)?.planMode;
  return CHANNEL_PLAN_MODES.includes(mode as ChannelPlanMode)
    ? (mode as ChannelPlanMode)
    : 'reserve';
}

export const channelPlanModeCopy = {
  ru: {
    label: 'План',
    hint: 'Как адаптации этого канала встают в календарь. Сохраняется вместе с карточкой, кнопкой «Сохранить».',
    postHint:
      'Как этот пост встаёт в календарь. Применяется сразу, и к уже написанному посту тоже.',
    failed: 'Не удалось сохранить режим. Попробуйте ещё раз.',
    applyQuestion: (count: number) =>
      `Применить к ${count} ${plural(count, [
        'уже написанному посту',
        'уже написанным постам',
        'уже написанным постам',
      ])} или только к новым?`,
    applyNote: 'Посты, у которых свой режим, не меняются.',
    /**
     * Что станет с написанными постами при «Ко всем N» (`97dq.87`): по
     * направлению смены, чтобы вопрос не приходилось угадывать. Обещание не
     * шире сервера (ревью волны, F6): пост, который площадка не примет,
     * в очередь не встаёт, а очередь, подтверждённая человеком, не трогается.
     */
    applyEffect: (to: ChannelPlanMode, from: ChannelPlanMode | null) =>
      to === 'autopilot'
        ? '«Ко всем»: посты встанут в очередь и выйдут сами, каждый в своё время, если площадка их примет.'
        : to === 'reserve'
          ? from === 'autopilot'
            ? '«Ко всем»: посты уйдут из очереди и будут ждать вашего «Подтвердить» — кроме подтверждённых вами.'
            : '«Ко всем»: посты встанут в ближайшее время канала с пометкой «в плане» и выйдут после вашего «Подтвердить».'
          : '«Ко всем»: бронь снимется, посты останутся черновиками.',
    applyKeep:
      '«Только к новым»: написанные посты останутся как есть — в очереди, в брони или черновиками.',
    applyNew: 'Только к новым',
    applyAll: (count: number) => `Ко всем ${count}`,
    applying: 'Применяем',
    appliedNew: 'Режим канала — для новых постов. Написанные остались как были.',
    appliedAll: (count: number) =>
      `Режим применён к ${count} ${plural(count, ['посту', 'постам', 'постам'])}.`,
    applyFailed: 'Не удалось применить режим к написанным постам. Попробуйте ещё раз.',
    applyChanged: 'Режим канала уже сменился. Написанные посты не тронуты — выберите режим ещё раз.',
    options: {
      draft: {
        title: 'Без плана',
        hint: 'Адаптация лежит черновиком. Время выбираете сами.',
      },
      reserve: {
        title: 'Бронь',
        hint: 'Встаёт в ближайшее время канала с пометкой «в плане». Выйдет после вашего «Подтвердить».',
      },
      autopilot: {
        title: 'Автопилот',
        hint: 'Встаёт в очередь и выходит сама. Новый вариант заменяет старый до выхода.',
      },
    },
  },
  en: {
    label: 'Plan',
    hint: 'How this channel’s adaptations get into the calendar. Saved with the rest of the card, by “Save”.',
    postHint:
      'How this post gets into the calendar. Applies at once, to the post already written too.',
    failed: 'The mode could not be saved. Try again.',
    applyQuestion: (count: number) =>
      `Apply to the ${count} ${count === 1 ? 'post' : 'posts'} already written, or to new ones only?`,
    applyNote: 'Posts with a mode of their own stay as they are.',
    applyEffect: (to: ChannelPlanMode, from: ChannelPlanMode | null) =>
      to === 'autopilot'
        ? '“All”: the posts join the queue and go out by themselves, each at its time, if the platform accepts them.'
        : to === 'reserve'
          ? from === 'autopilot'
            ? '“All”: the posts leave the queue and wait for your “Confirm” — except the ones you already confirmed.'
            : '“All”: the posts take the channel’s next times, marked “planned”, and go out after your “Confirm”.'
          : '“All”: the reservation drops, the posts stay drafts.',
    applyKeep:
      '“New ones only”: written posts stay as they are — queued, reserved or drafts.',
    applyNew: 'New ones only',
    applyAll: (count: number) => `All ${count}`,
    applying: 'Applying',
    appliedNew: 'The channel mode is for new posts. Written ones stay as they were.',
    appliedAll: (count: number) =>
      `The mode was applied to ${count} ${count === 1 ? 'post' : 'posts'}.`,
    applyFailed: 'The mode could not be applied to the written posts. Try again.',
    applyChanged: 'The channel mode has changed since. Written posts are untouched — choose the mode again.',
    options: {
      draft: {
        title: 'No plan',
        hint: 'The adaptation stays a draft. You pick the time.',
      },
      reserve: {
        title: 'Reserve',
        hint: 'Takes the channel’s next time, marked “planned”. Goes out after you confirm.',
      },
      autopilot: {
        title: 'Autopilot',
        hint: 'Joins the queue and goes out by itself. A new version replaces the old one before it goes out.',
      },
    },
  },
} as const;
