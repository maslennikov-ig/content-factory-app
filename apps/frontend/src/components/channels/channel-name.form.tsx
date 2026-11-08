'use client';

import { useId, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Input } from '@contentfactory/react/form/input';
import { Button } from '@contentfactory/react/form/button';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

export function ChannelNameForm({
  id,
  name,
  originalName,
  group = false,
  onSaved,
}: {
  id: string;
  name: string;
  originalName?: string;
  group?: boolean;
  onSaved: () => void;
}) {
  const ru = useInterfaceLanguage().startsWith('ru');
  const fetch = useFetch();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  const save = async (next: string) => {
    if (saving || (group && !next.trim())) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        group
          ? `/integrations/customers/${encodeURIComponent(id)}`
          : `/integrations/${encodeURIComponent(id)}/display-name`,
        { method: 'PUT', body: JSON.stringify({ name: next.trim() }) }
      );
      if (!response.ok) throw new Error('Rename refused');
      onSaved();
    } catch {
      setError(
        ru
          ? 'Не удалось сохранить. Проверьте название и повторите попытку.'
          : 'Could not save. Check the name and try again.'
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-[16px]"
      onSubmit={(event) => {
        event.preventDefault();
        void save(value);
      }}
    >
      {!group && (
        <p className="cf-body-sm text-cf-ink-muted">
          {ru
            ? 'Название общее для рабочего пространства. Имя в социальной сети не изменится.'
            : 'This name is shared in your workspace. The name on the social network stays the same.'}
          {originalName && (
            <>
              {' '}
              {ru ? 'Имя на площадке:' : 'Platform name:'} {originalName}
            </>
          )}
        </p>
      )}
      <Input
        standalone
        autoFocus
        label={ru ? 'Название' : 'Name'}
        value={value}
        maxLength={100}
        disabled={saving}
        aria-describedby={errorId}
        aria-invalid={!!error}
        onChange={(event) => setValue(event.target.value)}
      />
      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        className="cf-body-sm min-h-[24px] text-cf-danger"
      >
        {error}
      </p>
      <div className="flex flex-wrap gap-[8px]">
        <Button
          type="submit"
          loading={saving}
          loadingLabel={ru ? 'Сохраняем' : 'Saving'}
          disabled={saving || (group && !value.trim())}
        >
          {ru ? 'Сохранить' : 'Save'}
        </Button>
        {!group && (
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void save('')}
          >
            {ru ? 'Вернуть имя площадки' : 'Reset to platform name'}
          </Button>
        )}
      </div>
    </form>
  );
}
