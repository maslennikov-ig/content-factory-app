'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { ReactTags } from 'react-tag-autocomplete';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Input } from '@contentfactory/react/form/input';
import { ColorPicker } from '@contentfactory/react/form/color.picker';
import { Button } from '@contentfactory/react/form/button';
import { uniqBy } from 'lodash';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import clsx from 'clsx';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import {
  TagIcon,
  DropdownArrowIcon,
  PlusIcon,
  CheckmarkIcon,
  CloseIcon,
} from '@contentfactory/frontend/components/ui/icons';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
import { Status } from '@contentfactory/frontend/components/ui/surface';

export const TagsComponent: FC<{
  name: string;
  label: string;
  initial: any[];
  /**
   * Выключен, когда окно поста открыто на чтение
   * (`content-factory-next-fn33.90.10`). Выключенная кнопка не открывает
   * список: выбрать было бы можно, а сохранить — нет.
   */
  disabled?: boolean;
  onChange: (event: {
    target: {
      value: any[];
      name: string;
    };
  }) => void;
}> = (props) => {
  const fetch = useFetch();

  const loadTags = useCallback(async () => {
    return (await fetch('/posts/tags')).json();
  }, []);

  const { data, isLoading, mutate } = useSWR('load-tags', loadTags);

  if (isLoading) {
    return null;
  }

  return <TagsComponentInner {...props} allTags={data} mutate={mutate} />;
};

export const TagsComponentInner: FC<{
  name: string;
  label: string;
  initial: any[];
  allTags: any;
  disabled?: boolean;
  mutate: () => Promise<any>;
  onChange: (event: {
    target: {
      value: any[];
      name: string;
    };
  }) => void;
}> = ({ initial, onChange, name, mutate, disabled, allTags: data }) => {
  const t = useT();
  const fetch = useFetch();
  const [isOpen, setIsOpen] = useState(false);
  const [allowClose, setAllowClose] = useState(true);
  const [tagValue, setTagValue] = useState<any[]>(
    (initial?.slice(0) || []).map((p: any) => {
      return data?.tags.find((a: any) => a.name === p.value) || p;
    })
  );
  const modals = useModals();

  const ref = useClickOutside(() => {
    if (!isOpen || !allowClose) {
      return;
    }
    setIsOpen(false);
  });

  const addTag = useCallback(async () => {
    const val: string | undefined = await new Promise((resolve) => {
      modals.openModal({
        title: t('add_new_tag', 'Add New Tag'),
        children: (close) => (
          <ShowModal tag="" close={close} resolve={resolve} />
        ),
      });
    });

    const newValues = await mutate();

    if (!val) {
      return;
    }

    const newTag = newValues.tags.find((p: any) => p.name === val);
    if (newTag) {
      const modify = [...tagValue, newTag];
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    }
  }, []);

  const deleteTag = useCallback(
    async (tag: any, e: React.MouseEvent) => {
      setAllowClose(false);
      e.stopPropagation();
      const confirmed: boolean = await new Promise((resolve) => {
        modals.openModal({
          title: t('delete_tag', 'Delete Tag'),
          children: (close) => (
            <ConfirmDeleteModal
              tagName={tag.name}
              close={close}
              resolve={resolve}
            />
          ),
        });
      });

      if (!confirmed) {
        setTimeout(() => {
          setAllowClose(true);
        }, 500);
        return;
      }

      await fetch(`/posts/tags/${tag.id}`, {
        method: 'DELETE',
      });

      // Remove the tag from current selection if it was selected
      const modify = tagValue.filter((a) => a.id !== tag.id);
      if (modify.length !== tagValue.length) {
        setTagValue(modify);
        onChange({
          target: {
            value: modify.map((p: any) => ({
              label: p.name,
              value: p.name,
            })),
            name,
          },
        });
      }

      await mutate();

      setTimeout(() => {
        setAllowClose(true);
      }, 500);
    },
    [tagValue, name, onChange, mutate, fetch, modals, t]
  );

  return (
    <div ref={ref} className="relative flex select-none items-center">
      <Menu open={isOpen} onOpenChange={setIsOpen}>
        <MenuButton
          aria-label={t('tags', 'Tags')}
          disabled={disabled}
          className="flex items-center gap-[8px] rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink hover:bg-cf-surface-subtle"
        >
          <TagIcon />
          {tagValue.length === 0 ? (
            <span>{t('add_new_tag', 'Add New Tag')}</span>
          ) : (
            <span className="flex items-center gap-[8px]">
              <Status icon={<TagDot color={tagValue[0].color} />}>
                {tagValue[0].name}
              </Status>
              {tagValue.length > 1 ? (
                <span className="cf-label-sm text-cf-ink-muted">
                  +{tagValue.length - 1}
                </span>
              ) : null}
            </span>
          )}
          <DropdownArrowIcon size={12} rotated={isOpen} />
        </MenuButton>
        {isOpen && !disabled && (
          <MenuList
            aria-label={t('tags', 'Tags')}
            style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
            className="absolute bottom-[100%] start-0 z-[300] mb-[8px] flex w-[240px] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]"
          >
            {(data?.tags || []).map((p: any) => (
              <div key={p.name} className="flex items-center gap-[4px]">
                <MenuOption
                  keepOpen
                  layout="content"
                  selected={!!tagValue.find((a) => a.id === p.id)}
                  onClick={() => {
                    const exists = !!tagValue.find((a) => a.id === p.id);
                    const modify = exists
                      ? tagValue.filter((a) => a.id !== p.id)
                      : [...tagValue, p];
                    setTagValue(modify);
                    onChange({
                      target: {
                        value: modify.map((one: any) => ({
                          label: one.name,
                          value: one.name,
                        })),
                        name,
                      },
                    });
                  }}
                  className="flex flex-1 items-center gap-[8px] rounded-[8px] px-[8px] text-start hover:bg-cf-surface-subtle"
                >
                  <Check value={!!tagValue.find((a) => a.id === p.id)} />
                  <span className="flex min-w-0 flex-1 items-center">
                    <Status icon={<TagDot color={p.color} />}>{p.name}</Status>
                  </span>
                </MenuOption>
                {!tagValue.find((a) => a.id === p.id) && (
                  <Button
                    variant="quiet"
                    iconOnly
                    density="dense"
                    aria-label={t('delete_tag', 'Delete Tag')}
                    onClick={(e) => deleteTag(p, e)}
                    className="text-cf-danger"
                  >
                    <CloseIcon size={12} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={addTag}
              className="mt-[8px] flex items-center justify-center gap-[8px]"
            >
              <PlusIcon />
              <span>{t('add_new_tag', 'Add New Tag')}</span>
            </Button>
          </MenuList>
        )}
      </Menu>
    </div>
  );
};

/**
 * Цвет тега — это данные, а не оформление.
 *
 * Раньше имя тега печаталось белым по этому цвету: белый текст на цвете,
 * который выбрал человек, читается через раз и не поддаётся расчёту контраста.
 * Точка ставит тот же цвет рядом с именем, а имя берёт цвет у `Status`.
 */
const TagDot: FC<{ color?: string }> = ({ color }) => (
  <span
    aria-hidden="true"
    className="inline-block h-[8px] w-[8px] rounded-full border border-cf-border"
    style={color ? { backgroundColor: color } : undefined}
  />
);

const Check: FC<{ value: boolean }> = ({ value }) => (
  <span
    aria-hidden="true"
    className={clsx(
      'flex h-[20px] w-[20px] min-w-[20px] items-center justify-center rounded-[6px] border border-cf-border-control',
      value && 'bg-cf-accent border-transparent'
    )}
  >
    {value ? <CheckmarkIcon className="text-cf-accent-ink" /> : ''}
  </span>
);
export const TagsComponentA: FC<{
  name: string;
  label: string;
  initial: any[];
  onChange: (event: {
    target: {
      value: any[];
      name: string;
    };
  }) => void;
}> = (props) => {
  const { onChange, name, initial } = props;
  const fetch = useFetch();
  const [tagValue, setTagValue] = useState<any[]>(initial?.slice(0) || []);
  const [suggestions, setSuggestions] = useState<string>('');
  const [showModal, setShowModal] = useState<any>(false);
  const loadTags = useCallback(async () => {
    return (await fetch('/posts/tags')).json();
  }, []);
  const { isLoading, data, mutate } = useSWR<{
    tags: {
      name: string;
      color: string;
    }[];
  }>('tags', loadTags, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
  const onDelete = useCallback(
    (tagIndex: number) => {
      const modify = tagValue.filter((_, i) => i !== tagIndex);
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    },
    [tagValue]
  );
  const createNewTag = useCallback(
    async (newTag: any) => {
      const val = await new Promise((resolve) => {
        setShowModal({
          tag: newTag.value,
          resolve,
          close: () => setShowModal(false),
        });
      });
      setShowModal(false);
      mutate();
      return val;
    },
    [mutate]
  );
  const edit = useCallback(
    (tag: any) => async (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      const val = await new Promise((resolve) => {
        setShowModal({
          tag: tag.name,
          color: tag.color,
          id: tag.id,
          resolve,
          close: () => setShowModal(false),
        });
      });
      setShowModal(false);
      mutate();
      const modify = tagValue.map((t) => {
        if (t.label === tag.name) {
          return {
            value: val,
            label: val,
          };
        }
        return t;
      });
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    },
    [tagValue, data]
  );
  const onAddition = useCallback(
    async (newTag: any) => {
      if (tagValue.length >= 3) {
        return;
      }
      const getTag = data?.tags?.find((f) => f.name === newTag.label)
        ? newTag.label
        : await createNewTag(newTag);
      const modify = [
        ...tagValue,
        {
          value: getTag,
          label: getTag,
        },
      ];
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    },
    [tagValue, data]
  );

  // useEffect(() => {
  //   const settings = getValues()[props.name];
  //   if (settings) {
  //     setTagValue(settings);
  //   }
  // }, []);

  const suggestionsArray = useMemo(() => {
    return uniqBy<{
      label: string;
      value: string;
    }>(
      [
        ...(data?.tags.map((p) => ({
          label: p.name,
          value: p.name,
        })) || []),
        ...tagValue,
        {
          label: suggestions,
          value: suggestions,
        },
      ].filter((f) => f.label),
      (o) => o.label
    );
  }, [suggestions, tagValue]);

  const t = useT();

  if (isLoading) {
    return null;
  }
  return (
    <>
      {showModal && <ShowModal {...showModal} />}
      <div className="flex-1 flex tags-top">
        <ReactTags
          placeholderText={t('add_a_tag', 'Add a tag')}
          suggestions={suggestionsArray}
          selected={tagValue}
          onAdd={onAddition}
          onInput={setSuggestions}
          onDelete={onDelete}
          renderTag={(tag) => {
            const findTag = data?.tags?.find((f) => f.name === tag.tag.label);
            const findIndex = tagValue.findIndex(
              (f) => f.label === tag.tag.label
            );
            return (
              <div
                className={`min-w-[50px] float-left ms-[4px] p-[3px] rounded-sm relative`}
                style={{
                  backgroundColor: findTag?.color,
                }}
              >
                <div
                  className="absolute -top-[5px] start-[10px] text-[12px] text-red-600 bg-white px-[3px] rounded-full"
                  onClick={edit(findTag)}
                >
                  {t('edit', 'Edit')}
                </div>
                <div
                  className="absolute -top-[5px] -start-[5px] text-[12px] text-red-600 bg-white px-[3px] rounded-full"
                  onClick={() => onDelete(findIndex)}
                >
                  X
                </div>
                <div className="text-white mix-blend-difference">
                  {tag.tag.label}
                </div>
              </div>
            );
          }}
        />
      </div>
    </>
  );
};
const ConfirmDeleteModal: FC<{
  tagName: string;
  close: () => void;
  resolve: (value: boolean) => void;
}> = ({ tagName, close, resolve }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-[14px]">
        {t(
          'confirm_delete_tag',
          'Are you sure you want to delete the tag "{{tagName}}"?',
          { tagName }
        )}
      </p>
      <div className="flex gap-[8px] justify-end">
        <Button
          onClick={() => {
            resolve(false);
            close();
          }}
        >
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          onClick={() => {
            resolve(true);
            close();
          }}
          className="bg-red-500 hover:bg-red-600"
        >
          {t('delete', 'Delete')}
        </Button>
      </div>
    </div>
  );
};

const ShowModal: FC<{
  tag: string;
  color?: string;
  id?: string;
  close: () => void;
  resolve: (value: string) => void;
}> = (props) => {
  const t = useT();

  const { close, tag, resolve, color: theColor, id } = props;
  const fetch = useFetch();
  const [color, setColor] = useState<string>(theColor || '#942828');
  const [tagName, setTagName] = useState<string>(tag);
  const save = useCallback(async () => {
    await fetch(id ? `/posts/tags/${id}` : '/posts/tags', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: tagName,
        color,
      }),
    });
    resolve(tagName);
    close();
  }, [tagName, color, id]);
  return (
    <div>
      <Input
        name="name"
        disableForm={true}
        label={t('tag_name', 'Name')}
        value={tagName}
        onChange={(e) => setTagName(e.target.value)}
      />
      <ColorPicker
        onChange={(e) => setColor(e.target.value)}
        label={t('label_tag_color', 'Tag Color')}
        name="color"
        value={color}
        enabled={true}
        canBeCancelled={false}
      />
      <Button onClick={save} className="mt-[16px]">
        {t('save', 'Save')}
      </Button>
    </div>
  );
};
