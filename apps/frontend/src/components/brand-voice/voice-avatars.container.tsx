'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { VoiceAvatarsScreen, type AvatarKind } from './voice-avatars.screen';
import { VoiceAvatarCreateDialog } from './voice-avatar-create.dialog';
import { AVATAR_ROUTES, mapAvatarRow, mapAvatars } from './voice-avatars.adapter';
import { readVoice, readVoiceFailure, type VoiceFailure } from './voice-profile.adapter';
import type { VoiceLocale } from './voice-copy';

/**
 * Screen 12 with the five routes behind it.
 *
 * The screen owns the pixels and holds no state of its own; this owns the
 * requests, the card whose «Ещё» is open, the name being typed and the
 * confirmation on screen. The same split the other voice containers make.
 *
 * Every write answers with the whole list rather than with the row it touched,
 * and the answer replaces the cache directly. Two reasons, and both of them
 * are about the default flag: moving it changes two rows at once, so a
 * per-row update would leave the old default marked until a refetch; and
 * deleting the default changes a third. `mutate(answer, { revalidate: false })`
 * is therefore not an optimisation — it is the only shape that cannot show a
 * space with two defaults or none.
 */

const FALLBACK = {
  ru: {
    list: 'Список аватаров не загрузился. Сами аватары на месте — попробуйте ещё раз.',
    write: 'Изменение не сохранилось. Аватар по умолчанию не менялся.',
  },
  en: {
    list: 'The avatar list did not load. The avatars themselves are intact — try again.',
    write: 'The change was not saved. The default avatar did not move.',
  },
} as const;

export function VoiceAvatarsContainer({
  onOpenAvatar,
  onCollectFor,
}: {
  /** Opening an avatar is the tab's decision, not this screen's. */
  onOpenAvatar?: (avatarId: string) => void;
  onCollectFor?: (avatarId: string) => void;
  /**
   * A freshly created avatar is opened through the same door as any other, so
   * the two paths cannot disagree about where an avatar lives.
   */
} = {}) {
  const request = useFetch();
  const { language } = useVariables();
  const locale: VoiceLocale = String(language ?? 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
  const words = FALLBACK[locale];

  const list = useSWR(
    AVATAR_ROUTES.list,
    () => readVoice(request, AVATAR_ROUTES.list),
    { revalidateOnFocus: false }
  );

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{
    avatarId: string;
    successorId?: string;
  } | null>(null);
  const [failure, setFailure] = useState<VoiceFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [creating, setCreating] = useState(false);
  /**
   * A refusal that belongs to the dialog, kept apart from the list's own.
   *
   * The list shows its failures in a banner above the cards. A dialog is on
   * top of that banner, so a refused creation would put its reason where the
   * person who caused it cannot see it.
   */
  const [createFailure, setCreateFailure] = useState<string | null>(null);

  const view = useMemo(() => mapAvatars(list.data), [list.data]);

  /**
   * One place a refusal can land, and one place the answer replaces the cache.
   *
   * Every write here can be refused — a ninth avatar, an unanalysed default, a
   * successor that cannot write — and each of them refusing differently is how
   * a screen ends up with three ways of saying the same thing and one path
   * that says nothing at all.
   */
  const write = useCallback(
    async (path: string, method: 'POST' | 'DELETE', body: unknown) => {
      setBusy(true);
      setFailure(null);
      try {
        const answer = await readVoice(request, path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        await list.mutate(answer, { revalidate: false });
        setChanged(true);
        return true;
      } catch (error) {
        setFailure(
          readVoiceFailure(error) ?? {
            code: null,
            message: words.write,
            screenState: 'error',
          }
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [list, request, words.write]
  );

  const state = list.isLoading
    ? 'loading'
    : failure
    ? failure.screenState
    : list.error
    ? 'error'
    : !view.canManage
    ? 'restricted'
    : changed
    ? 'success'
    : view.state;

  /**
   * The wizard's answer, turned into the avatar that was just made.
   *
   * The create route answers with the whole list rather than with the row it
   * added — correct, because adding the first avatar also makes it the default
   * and that is a change to two rows. So the new one is the id the list did
   * not hold a moment ago. When that comparison finds nothing to open — a
   * concurrent change, a list that was already stale — the dialog simply
   * closes onto the refreshed list, which is honest rather than guessing.
   */
  const create = useCallback(
    async (input: { name: string; kind: AvatarKind }) => {
      setBusy(true);
      setCreateFailure(null);
      const before = new Set(view.avatars.map((one) => one.id));
      try {
        const answer = await readVoice(request, AVATAR_ROUTES.create, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        await list.mutate(answer, { revalidate: false });
        setCreating(false);
        setChanged(true);
        const added = (
          (answer as { avatars?: readonly unknown[] } | null)?.avatars ?? []
        )
          .map(mapAvatarRow)
          .find((one) => one.id && !before.has(one.id));
        if (added) onOpenAvatar?.(added.id);
      } catch (error) {
        setCreateFailure(
          readVoiceFailure(error)?.message ?? words.write
        );
      } finally {
        setBusy(false);
      }
    },
    [list, onOpenAvatar, request, view.avatars, words.write]
  );

  return (
    <>
    <VoiceAvatarCreateDialog
      open={creating}
      locale={locale}
      busy={busy}
      {...(createFailure ? { failure: createFailure } : {})}
      onCancel={() => {
        setCreating(false);
        setCreateFailure(null);
      }}
      onCreate={(input) => void create(input)}
    />
    <VoiceAvatarsScreen
      locale={locale}
      state={busy && !creating ? 'loading' : state}
      avatars={view.avatars}
      defaultAvatarId={view.defaultAvatarId}
      limit={view.limit}
      canManage={view.canManage}
      notice={
        failure?.message ??
        (list.error ? words.list : undefined) ??
        view.notice
      }
      openMenuId={openMenuId}
      renamingId={renamingId}
      draftName={draftName}
      confirmDelete={confirmDelete}
      // The button opens the wizard; the row is written when the two questions
      // it asks have answers. Creating first and asking afterwards is what
      // left «Без имени» at the bottom of the list.
      onCreate={() => {
        setChanged(false);
        setCreateFailure(null);
        setCreating(true);
      }}
      onOpen={(id) => onOpenAvatar?.(id)}
      onCollect={(id) => (onCollectFor ?? onOpenAvatar)?.(id)}
      onMenuToggle={(id) => setOpenMenuId(id)}
      onRenameStart={(id) => {
        const avatar = view.avatars.find((one) => one.id === id);
        setDraftName(avatar?.name ?? '');
        setRenamingId(id);
        setOpenMenuId(null);
        setChanged(false);
      }}
      onRenameChange={(value) => setDraftName(value)}
      onRenameCancel={() => {
        setRenamingId(null);
        setDraftName('');
      }}
      onRenameSubmit={(id) => {
        setChanged(false);
        void write(AVATAR_ROUTES.update, 'POST', {
          avatarId: id,
          name: draftName,
        }).then((ok) => {
          if (!ok) return;
          setRenamingId(null);
          setDraftName('');
        });
      }}
      onKindChange={(id, kind: AvatarKind) => {
        setChanged(false);
        setOpenMenuId(null);
        void write(AVATAR_ROUTES.update, 'POST', { avatarId: id, kind });
      }}
      onMakeDefault={(id) => {
        setChanged(false);
        void write(AVATAR_ROUTES.makeDefault, 'POST', { avatarId: id });
      }}
      onDeleteStart={(id) => {
        setOpenMenuId(null);
        setFailure(null);
        setChanged(false);
        setConfirmDelete({ avatarId: id });
      }}
      onDeleteSuccessorChange={(successorId) =>
        setConfirmDelete((current) =>
          current ? { ...current, successorId } : current
        )
      }
      onDeleteCancel={() => setConfirmDelete(null)}
      onDeleteConfirm={() => {
        if (!confirmDelete) return;
        void write(AVATAR_ROUTES.remove, 'DELETE', confirmDelete).then((ok) => {
          if (ok) setConfirmDelete(null);
        });
      }}
      onRetry={() => {
        setFailure(null);
        void list.mutate();
      }}
    />
    </>
  );
}

export default VoiceAvatarsContainer;
