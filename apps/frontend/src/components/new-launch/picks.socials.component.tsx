'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import type { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { PlatformSymbol } from '@contentfactory/react/platform/platform.symbol';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

export type ChannelPickerIntegration = Pick<
  Integrations,
  'id' | 'name' | 'identifier' | 'picture' | 'disabled' | 'inBetweenSteps'
>;

export const PicksSocialsView: FC<{
  integrations: readonly ChannelPickerIntegration[];
  selectedIds: readonly string[];
  /**
   * What a screen reader calls this section. It arrives as a prop, like the
   * restriction message beside it: this view is also rendered by the
   * interface-review stand, which has no translation context, so the default
   * has to stay a real English word rather than a key
   * (`content-factory-next-fn33.127`).
   */
  label?: string;
  locked?: boolean;
  fixedIntegrationId?: string;
  restrictionMessage?: string;
  toolTip?: boolean;
  liveProviderConnection?: boolean;
  onToggle: (integration: ChannelPickerIntegration) => void;
}> = ({
  integrations,
  selectedIds,
  label = 'Channels',
  locked = false,
  fixedIntegrationId,
  restrictionMessage = 'Channel selection is locked while this post is being edited.',
  toolTip,
  liveProviderConnection = false,
  onToggle,
}) => {
  const available = integrations.filter((integration) =>
    fixedIntegrationId
      ? integration.id === fixedIntegrationId
      : !integration.inBetweenSteps && !integration.disabled
  );
  const restrictionId = locked ? 'channel-picker-restriction' : undefined;

  return (
    <section
      data-production-surface="settings-admin/channel-picker"
      data-live-provider-connection={String(liveProviderConnection)}
      aria-label={label}
      className="flex flex-col gap-[12px] text-cf-ink"
    >
      {locked && (
        <p
          id={restrictionId}
          role="status"
          className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px] cf-body-sm text-cf-warning [text-wrap:pretty]"
        >
          {restrictionMessage}
        </p>
      )}
      {available.length === 0 ? (
        <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px] cf-body-sm text-cf-ink-muted">
          No channels are available for this post.
        </div>
      ) : (
        <div className="flex flex-wrap gap-[12px]">
          {available.map((integration) => {
            const selected = selectedIds.includes(integration.id);
            const disabled = locked || Boolean(fixedIntegrationId);
            return (
              <ControlButton
                key={integration.id}
                layout="content"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={integration.name}
                aria-describedby={restrictionId}
                onClick={() => onToggle(integration)}
                {...(toolTip
                  ? {
                      'data-tooltip-id': 'tooltip',
                      'data-tooltip-content': integration.name,
                    }
                  : {})}
                className={clsx(
                  'relative flex min-w-[56px] items-center justify-center rounded-[8px] border-[2px] bg-cf-surface-subtle p-[4px] transition-colors duration-state',
                  selected
                    ? 'border-cf-accent bg-cf-accent-soft ring-1 ring-inset ring-cf-ink cf-pressed'
                    : 'border-cf-border-control hover:bg-cf-surface'
                )}
              >
                {integration.picture ? (
                  <img
                    src={integration.picture}
                    className={clsx(
                      'h-[48px] w-[48px] min-w-[48px] rounded-full object-cover transition-colors duration-state',
                      !selected && 'grayscale'
                    )}
                    alt=""
                    onError={({ currentTarget }) => {
                      currentTarget.onerror = null;
                      currentTarget.src = '/no-picture.jpg';
                    }}
                  />
                ) : (
                  <PlatformSymbol
                    identifier={integration.identifier}
                    size={48}
                    decorative={true}
                  />
                )}
                <PlatformBadge
                  identifier={integration.identifier}
                  size={24}
                  className="absolute -bottom-[4px] -end-[4px] z-10"
                />
              </ControlButton>
            );
          })}
        </div>
      )}
    </section>
  );
};

export const PicksSocialsComponent: FC<{ toolTip?: boolean }> = ({
  toolTip,
}) => {
  const t = useT();
  const existing = useExistingData();
  const {
    locked,
    addOrRemoveSelectedIntegration,
    integrations,
    selectedIntegrations,
  } = useLaunchStore(
    useShallow((state) => ({
      integrations: state.integrations,
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      locked: state.locked,
    }))
  );

  return (
    <PicksSocialsView
      label={t('channels', 'Channels')}
      integrations={integrations}
      selectedIds={selectedIntegrations.map(
        ({ integration }) => integration.id
      )}
      locked={locked}
      fixedIntegrationId={existing.integration || undefined}
      toolTip={toolTip}
      onToggle={(integration) =>
        addOrRemoveSelectedIntegration(integration as Integrations, {})
      }
    />
  );
};
