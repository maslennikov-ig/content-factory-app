'use client';

import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import {
  channelPlanModeCopy,
  channelPlanModeUrl,
  readChannelPlanMode,
  type ChannelPlanMode,
} from './channel-plan-mode';
import type { IntakeLocale } from './intake.copy';
import type { PlanFieldProps } from '../pieces/post-options.panel';
import { PIECES_API, readPlanImpact } from '../pieces/pieces.adapter';

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'ask'; count: number }
  | { kind: 'applying'; count: number }
  | { kind: 'new' }
  | { kind: 'all'; applied: number }
  | { kind: 'failed'; count: number }
  | { kind: 'changed' };

/**
 * «План» карточки канала (`97dq.57`, `97dq.70`).
 *
 * Режим канала сохраняется сразу при выборе, отдельно от кнопки карточки. Если
 * у канала уже есть написанные невышедшие посты без своего режима, под полем
 * встаёт вопрос словами, без системных окон: «Применить к N уже написанным
 * постам или только к новым?» — «Только к новым» (главная, по умолчанию) или
 * «Ко всем N». Посты со своим режимом не меняются ни при каком ответе.
 */
export function useChannelPlanField({
  integrationId,
  locale,
  canWrite,
  enabled = true,
}: {
  integrationId: string;
  locale: IntakeLocale;
  canWrite: boolean;
  enabled?: boolean;
}): PlanFieldProps {
  const t = channelPlanModeCopy[locale];
  const request = useFetch();
  const url = channelPlanModeUrl(integrationId);
  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('plan mode unavailable');
    return readChannelPlanMode(await response.json());
  }, [request, url]);
  const { data, mutate } = useSWR(enabled ? url : null, load, {
    revalidateOnFocus: false,
  });
  const [chosen, setChosen] = useState<ChannelPlanMode | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle'
  );
  const [apply, setApply] = useState<ApplyState>({ kind: 'idle' });
  const value = chosen ?? data ?? 'reserve';
  const query = `?language=${locale}`;
  /*
    Каждый выбор режима получает номер (ревью `97dq.70`, P2): ответ счёта
    на прежний выбор приходит позже и не показывает вопрос о нём.
  */
  const turn = useRef(0);
  const asked = useRef<ChannelPlanMode | null>(null);
  // Направление последнего вопроса — для строк «что станет с постами» (`97dq.87`).
  const [direction, setDirection] = useState<{
    to: ChannelPlanMode;
    from: ChannelPlanMode;
  } | null>(null);

  const change = useCallback(
    async (mode: ChannelPlanMode) => {
      if (!canWrite || mode === value) return;
      const mine = ++turn.current;
      const before = value;
      setChosen(mode);
      setSave('saving');
      setApply({ kind: 'idle' });
      try {
        const response = await request(url, {
          method: 'PUT',
          body: JSON.stringify({ planMode: mode }),
        });
        if (!response.ok) throw new Error('plan mode not saved');
        if (mine !== turn.current) return;
        setSave('saved');
        await mutate(mode, { revalidate: false });
      } catch {
        if (mine !== turn.current) return;
        setChosen(before);
        setSave('failed');
        return;
      }
      // Вопрос — только когда есть к чему применять.
      try {
        const response = await request(
          `${PIECES_API.channelPlanImpact(integrationId)}${query}`
        );
        if (!response.ok) return;
        const { count } = readPlanImpact(await response.json());
        if (mine !== turn.current) return;
        asked.current = mode;
        if (count > 0) {
          setDirection({ to: mode, from: before });
          setApply({ kind: 'ask', count });
        }
      } catch {
        // Без ответа вопроса нет: режим канала уже сохранён для новых постов.
      }
    },
    [canWrite, integrationId, mutate, query, request, url, value]
  );

  const applyAll = useCallback(
    async (count: number) => {
      setApply({ kind: 'applying', count });
      try {
        const response = await request(
          `${PIECES_API.channelPlanApply(integrationId)}${query}`,
          // Режим, на который ответили: сменился — сервер отвечает 409.
          { method: 'POST', body: JSON.stringify({ planMode: asked.current }) }
        );
        if (response.status === 409) {
          // The mode changed elsewhere: drop the local choice so the field
          // shows what the server holds now, not the refused one.
          turn.current += 1;
          setChosen(null);
          setSave('idle');
          setApply({ kind: 'changed' });
          void mutate();
          return;
        }
        if (!response.ok) throw new Error('not applied');
        const body = (await response.json().catch(() => null)) as {
          applied?: unknown;
        } | null;
        setApply({
          kind: 'all',
          applied: typeof body?.applied === 'number' ? body.applied : count,
        });
      } catch {
        setApply({ kind: 'failed', count });
      }
    },
    [integrationId, mutate, query, request]
  );

  const asking =
    apply.kind === 'ask' || apply.kind === 'applying' || apply.kind === 'failed';

  const slot =
    save === 'idle' && apply.kind === 'idle' ? null : (
      <div
        data-channel-plan-state={save}
        className="flex min-w-0 flex-col gap-[8px]"
      >
        {save === 'saved' && !asking && apply.kind === 'idle' ? (
          <p role="status" className="cf-caption text-cf-accent">
            {t.saved}
          </p>
        ) : save === 'failed' ? (
          <p role="alert" className="cf-caption text-cf-danger">
            {t.failed}
          </p>
        ) : null}
        {asking ? (
          <div
            role="group"
            aria-label={t.applyQuestion(apply.count)}
            data-channel-plan-apply={apply.count}
            className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle px-[12px] py-[8px]"
          >
            <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
              {t.applyQuestion(apply.count)}
            </p>
            <div
              data-channel-plan-apply-effect={direction?.to ?? value}
              className="flex min-w-0 flex-col gap-[4px]"
            >
              <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.applyEffect(direction?.to ?? value, direction?.from ?? null)}
              </p>
              <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.applyKeep}
              </p>
            </div>
            <p className="cf-caption text-cf-ink-muted">{t.applyNote}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
              <Button
                type="button"
                variant="primary"
                density="dense"
                disabled={apply.kind === 'applying'}
                data-channel-plan-apply-choice="new"
                onClick={() => setApply({ kind: 'new' })}
              >
                {t.applyNew}
              </Button>
              <Button
                type="button"
                variant="secondary"
                density="dense"
                loading={apply.kind === 'applying'}
                loadingLabel={t.applying}
                data-channel-plan-apply-choice="all"
                onClick={() => void applyAll(apply.count)}
              >
                {t.applyAll(apply.count)}
              </Button>
            </div>
            {apply.kind === 'failed' ? (
              <p role="alert" className="cf-caption text-cf-danger">
                {t.applyFailed}
              </p>
            ) : null}
          </div>
        ) : apply.kind === 'new' ? (
          <p role="status" className="cf-caption text-cf-ink-muted">
            {t.appliedNew}
          </p>
        ) : apply.kind === 'changed' ? (
          <p role="alert" className="cf-caption text-cf-danger">
            {t.applyChanged}
          </p>
        ) : apply.kind === 'all' ? (
          <p role="status" className="cf-caption text-cf-accent">
            {t.appliedAll(apply.applied)}
          </p>
        ) : null}
      </div>
    );

  return {
    value,
    channel: value,
    disabled: !canWrite || save === 'saving' || apply.kind === 'applying',
    onChange: (next) => {
      if (next) void change(next);
    },
    slot,
  };
}
