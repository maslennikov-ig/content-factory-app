'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { Hint } from '@contentfactory/react/layout/hint';
import { SectionLabel } from '../../ui/section-label';
import { intakeCopy, type IntakeLocale } from './intake.copy';

/**
 * «План» на карточке канала «Как пишем в «X»» (`content-factory-next-97dq.57`,
 * решение владельца 23.09.2026).
 *
 * Три режима, как адаптации этого канала встают в календарь: «Без плана»,
 * «Бронь» (умолчание) и «Автопилот». Режим живёт в своей колонке канала, а не
 * в карточке письма, поэтому сохраняется сразу при выборе и не зависит от
 * кнопок «Сохранить» и «Вернуть умолчания» карточки.
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
    hint: 'Как адаптации этого канала встают в календарь. Сохраняется сразу, без кнопки.',
    saved: 'Сохранено',
    failed: 'Не удалось сохранить режим. Попробуйте ещё раз.',
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
    hint: 'How this channel’s adaptations get into the calendar. Saves at once, no button.',
    saved: 'Saved',
    failed: 'The mode could not be saved. Try again.',
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

export function ChannelPlanModeField({
  locale,
  integrationId,
  canWrite,
  open,
}: {
  locale: IntakeLocale;
  integrationId: string;
  canWrite: boolean;
  /** Пока карточка закрыта, режим не читается. */
  open: boolean;
}) {
  const t = channelPlanModeCopy[locale];
  const request = useFetch();
  const url = channelPlanModeUrl(integrationId);
  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('plan mode unavailable');
    return readChannelPlanMode(await response.json());
  }, [request, url]);
  const { data, mutate } = useSWR(open ? url : null, load, {
    revalidateOnFocus: false,
  });
  const [chosen, setChosen] = useState<ChannelPlanMode | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle'
  );
  const value = chosen ?? data ?? 'reserve';
  const labelId = `channel-plan-mode-${integrationId}`;

  const change = useCallback(
    async (next: string) => {
      if (!canWrite) return;
      const mode = next as ChannelPlanMode;
      const before = value;
      setChosen(mode);
      setState('saving');
      try {
        const response = await request(url, {
          method: 'PUT',
          body: JSON.stringify({ planMode: mode }),
        });
        if (!response.ok) throw new Error('plan mode not saved');
        setState('saved');
        await mutate(mode, { revalidate: false });
      } catch {
        setChosen(before);
        setState('failed');
      }
    },
    [canWrite, mutate, request, url, value]
  );

  return (
    <div
      data-channel-plan-mode={value}
      className="grid min-w-0 grid-cols-1 gap-x-[16px] gap-y-[12px] border-t border-cf-border pt-[12px] sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start"
    >
      {/* «?» рядом, а не внутри: подпись раздела набрана заглавными. */}
      <span className="flex min-w-0 items-center gap-[4px]">
        <SectionLabel as="span" id={labelId}>
          {t.label}
        </SectionLabel>
        <Hint label={intakeCopy[locale].profileHintFor(t.label)}>{t.hint}</Hint>
      </span>
      <div className="flex min-w-0 flex-col gap-[8px]">
        <RadioGroup
          aria-labelledby={labelId}
          value={value}
          onChange={(next) => void change(next)}
          orientation="vertical"
          className="flex min-w-0 flex-col gap-[4px]"
        >
          {CHANNEL_PLAN_MODES.map((mode) => {
            const picked = value === mode;
            return (
              <RadioOption
                key={mode}
                value={mode}
                layout="content"
                disabled={!canWrite}
                data-channel-plan-option={mode}
                className={`flex w-full min-w-0 flex-col items-start gap-[4px] rounded-[8px] border px-[12px] py-[8px] text-start text-cf-ink transition-colors duration-state ${
                  picked
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-cf-border hover:bg-cf-surface-subtle'
                }`}
              >
                <span className="cf-label-md">{t.options[mode].title}</span>
                <span className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                  {t.options[mode].hint}
                </span>
              </RadioOption>
            );
          })}
        </RadioGroup>
        {state === 'saved' ? (
          <p role="status" className="cf-caption text-cf-accent">
            {t.saved}
          </p>
        ) : state === 'failed' ? (
          <p role="alert" className="cf-caption text-cf-danger">
            {t.failed}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default ChannelPlanModeField;
