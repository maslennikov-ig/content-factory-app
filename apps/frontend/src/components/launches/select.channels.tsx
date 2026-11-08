'use client';

import { useId, useRef, useState } from 'react';
import type { Integrations } from './calendar.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Popover } from '../ui/layers';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { integrationDisplayName } from '@contentfactory/helpers/utils/integration-name';

/** One server-side selection for day, week, month and paginated list views. */
export function SelectChannels({
  integrations,
  value,
  onChange,
}: {
  integrations: Integrations[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const ru = useInterfaceLanguage().startsWith('ru');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchor = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const all = ru ? 'Все каналы' : 'All channels';
  const label = !value.length
    ? all
    : `${ru ? 'Каналы' : 'Channels'}: ${value.length}`;
  const shown = integrations.filter((item) =>
    `${integrationDisplayName(item)} ${item.originalName || ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <>
      <Button
        ref={anchor}
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </Button>
      {open && (
        <Popover
          role="dialog"
          ariaLabel={ru ? 'Выбор каналов' : 'Choose channels'}
          anchorRef={anchor}
          onClose={() => setOpen(false)}
          placement="bottom-start"
          className="w-[320px] max-w-full p-[12px]"
        >
          <Input
            standalone
            autoFocus
            type="search"
            aria-label={ru ? 'Найти канал' : 'Find a channel'}
            placeholder={ru ? 'Найти канал' : 'Find a channel'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <fieldset className="mt-[8px] min-w-0" aria-labelledby={labelId}>
            <legend id={labelId} className="sr-only">
              {ru ? 'Каналы календаря' : 'Calendar channels'}
            </legend>
            <CheckboxField
              label={all}
              checked={!value.length}
              onChange={() => onChange([])}
            />
            <div className="max-h-[280px] overflow-y-auto">
              {shown.map((item) => (
                <CheckboxField
                  key={item.id}
                  label={integrationDisplayName(item)}
                  checked={value.includes(item.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, item.id]
                        : value.filter((id) => id !== item.id)
                    )
                  }
                />
              ))}
              {!shown.length && (
                <p className="cf-body-sm py-[12px] text-cf-ink-muted">
                  {ru ? 'Каналы не найдены' : 'No channels found'}
                </p>
              )}
            </div>
          </fieldset>
          <Button
            variant="quiet"
            onClick={() => {
              setOpen(false);
              anchor.current?.focus();
            }}
          >
            {ru ? 'Готово' : 'Done'}
          </Button>
        </Popover>
      )}
    </>
  );
}
