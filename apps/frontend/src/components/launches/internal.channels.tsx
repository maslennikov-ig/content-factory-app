import { FC, useEffect, useState } from 'react';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import { PickPlatforms } from '@contentfactory/frontend/components/launches/helpers/pick.platform.component';
import { useIntegration } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Toggle } from '@contentfactory/react/form/toggle';
import {
  EmptyState,
  Panel,
  Skeleton,
} from '@contentfactory/frontend/components/ui/surface';
const delayOptions = [
  {
    name: 'Immediately',
    value: 0,
  },
  {
    name: '1 hour',
    value: 3600000,
  },
  {
    name: '2 hours',
    value: 7200000,
  },
  {
    name: '3 hours',
    value: 10800000,
  },
  {
    name: '8 hours',
    value: 28800000,
  },
  {
    name: '12 hours',
    value: 43200000,
  },
  {
    name: '15 hours',
    value: 54000000,
  },
  {
    name: '24 hours',
    value: 86400000,
  },
];
export const InternalChannels: FC<{
  plugs: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  }[];
}> = (props) => {
  const { plugs } = props;
  return (
    <div>
      {plugs.map((plug, index) => (
        <Plug plug={plug} key={index} />
      ))}
    </div>
  );
};
const PlugField: FC<{
  plugIdentifier: string;
  field: {
    name: string;
    description: string;
    type: string;
    placeholder: string;
    validation?: RegExp;
  };
}> = ({ plugIdentifier, field }) => {
  // The shared controls register themselves with the surrounding form and read
  // their own error out of it, so the field name is the only thing this level
  // still owns.
  const fieldName = `plug--${plugIdentifier}--${field.name}`;

  return field.type === 'textarea' ? (
    <Textarea
      label={field.description}
      name={fieldName}
      placeholder={field.placeholder}
    />
  ) : (
    <Input
      label={field.description}
      name={fieldName}
      placeholder={field.placeholder}
    />
  );
};

const Plug: FC<{
  plug: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  };
}> = ({ plug }) => {
  const { allIntegrations, integration } = useIntegration();
  const t = useT();

  const { watch, setValue } = useSettings();
  const [load, setLoad] = useState(false);
  const val = watch(`plug--${plug.identifier}--integrations`);
  const active = watch(`plug--${plug.identifier}--active`);
  useEffect(() => {
    setTimeout(() => {
      setLoad(true);
    }, 20);
  }, []);
  const [localValue, setLocalValue] = useState<Integrations[]>(
    (val || []).map((p: any) => ({
      ...p,
    }))
  );
  useEffect(() => {
    setValue(`plug--${plug.identifier}--integrations`, [...localValue]);
  }, [localValue, plug, setValue]);
  const [allowedIntegrations] = useState(
    allIntegrations.filter(
      (i) =>
        plug.pickIntegration.includes(i.identifier) && integration?.id !== i.id
    )
  );
  if (!load) {
    return <Skeleton className="h-[180px] w-full" />;
  }
  return (
    <Panel
      title={plug.title}
      description={plug.description}
      actions={
        <Toggle
          checked={Boolean(active)}
          onChange={(checked) =>
            setValue(`plug--${plug.identifier}--active`, checked)
          }
          label={t('enabled', 'Enabled')}
        />
      }
    >
      <div className="w-full max-w-[600px] overflow-y-auto flex flex-col gap-[12px]">
        {!allowedIntegrations.length ? (
          <EmptyState
            title={t('no_available_accounts', 'No available accounts')}
          />
        ) : (
          <div
            className={clsx(
              'flex flex-col gap-[10px]',
              !active && 'opacity-25 pointer-events-none'
            )}
          >
            <Select
              hideErrors
              label={t('delay', 'Delay')}
              name={`plug--${plug.identifier}--delay`}
            >
              {delayOptions.map((p) => (
                <option key={p.name} value={p.value}>
                  {p.name}
                </option>
              ))}
            </Select>
            {plug.fields.length > 0 && (
              <div className="flex flex-col gap-[10px]">
                {plug.fields.map((field) => (
                  <PlugField
                    key={field.name}
                    plugIdentifier={plug.identifier}
                    field={field}
                  />
                ))}
              </div>
            )}
            <div>
              {t('accounts_that_will_engage', 'Accounts that will engage:')}
            </div>
            <PickPlatforms
              hide={false}
              integrations={allowedIntegrations}
              selectedIntegrations={localValue}
              singleSelect={false}
              isMain={true}
              onChange={setLocalValue}
            />
          </div>
        )}
      </div>
    </Panel>
  );
};
