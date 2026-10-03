'use client';

import { useEffect, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { documentThemeMode } from '@contentfactory/frontend/components/layout/document-theme';

type EmojiModule = typeof import('emoji-picker-react');

let pendingLoad: Promise<EmojiModule> | undefined;
let loadFailed = false;

function loadEmojiPicker() {
  if (!pendingLoad) {
    const request = import('emoji-picker-react');
    pendingLoad = request;
    request.catch(() => {
      if (pendingLoad === request) loadFailed = true;
    });
  }
  return pendingLoad;
}

/** Mounted only for an open popup; the picker and its enums stay out of SSR. */
export function AdaptationEmojiPicker({
  searchPlaceholder,
  loadingLabel,
  failedLabel,
  retryLabel,
  onPick,
}: {
  searchPlaceholder: string;
  loadingLabel: string;
  failedLabel: string;
  retryLabel: string;
  onPick: (emoji: string) => void;
}) {
  const [loaded, setLoaded] = useState<EmojiModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    loadEmojiPicker().then(
      (module) => {
        if (mounted) setLoaded(() => module);
      },
      () => {
        if (mounted) setFailed(true);
      }
    );
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const retry = () => {
    if (loadFailed) {
      pendingLoad = undefined;
      loadFailed = false;
    }
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  if (!loaded) {
    return (
      <div className="flex w-[320px] max-w-full flex-col items-start gap-[8px] p-[12px]">
        <p
          role={failed ? 'alert' : 'status'}
          aria-busy={!failed}
          className="cf-body-sm text-cf-ink"
        >
          {failed ? failedLabel : loadingLabel}
        </p>
        {failed ? (
          <Button type="button" variant="quiet" density="dense" onClick={retry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  const Picker = loaded.default;
  return (
    <Picker
      open
      width={320}
      height={360}
      emojiStyle={loaded.EmojiStyle.NATIVE}
      theme={
        documentThemeMode() === 'light' ? loaded.Theme.LIGHT : loaded.Theme.DARK
      }
      searchPlaceholder={searchPlaceholder}
      autoFocusSearch
      skinTonesDisabled
      lazyLoadEmojis
      previewConfig={{ showPreview: false }}
      onEmojiClick={(data) => onPick(data.emoji)}
    />
  );
}
