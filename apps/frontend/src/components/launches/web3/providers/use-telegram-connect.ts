'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { timer } from '@contentfactory/helpers/utils/timer';
import { generateConnectWord } from '@contentfactory/frontend/components/launches/web3/providers/connect.word';

/**
 * Matches the window the backend will honour a connect receipt for. Polling
 * past it can only ever fail, and it used to do that in silence: the loop had
 * no end, so a command sent too long ago left the dialog spinning forever with
 * nothing to act on.
 */
export const CONNECT_CLAIM_WINDOW_MS = 15 * 60 * 1_000;

/**
 * The Telegram `/connect <word>` mechanics, once (2q28.6).
 *
 * Two screens connect a Telegram channel: the connect dialog on «Каналы»
 * (`telegram.provider.tsx`) and the channel step of «С чего начать». Both
 * need the same word, the same polling of `/integrations/telegram/updates`
 * and the same 15-minute deadline; a second hand-written loop would be the
 * second opinion on when a request expires. The screens differ only in what
 * they draw and in what they do with the chat id.
 *
 * The word is drawn when waiting starts, not at render: a word drawn during
 * server rendering would differ from the one the browser draws, and nobody
 * needs a word before pressing the button anyway.
 */
export function useTelegramConnect(onChat: (chatId: string) => void) {
  const fetch = useFetch();
  const word = useRef('');
  const stop = useRef(false);
  const [started, setStarted] = useState(false);
  const [expired, setExpired] = useState(false);

  const start = useCallback(async () => {
    if (!word.current) word.current = generateConnectWord();
    stop.current = false;
    setExpired(false);
    setStarted(true);
    const deadline = Date.now() + CONNECT_CLAIM_WINDOW_MS;
    let id = '';
    while (!stop.current) {
      const data = await (
        await fetch(
          `/integrations/telegram/updates?word=${word.current}${
            id ? `&id=${id}` : ''
          }`
        )
      ).json();
      if (stop.current) return;
      if (data.lastChatId) id = data.lastChatId;
      if (data.chatId) {
        onChat(data.chatId);
        return;
      }
      if (Date.now() >= deadline) {
        setExpired(true);
        return;
      }
      await timer(2000);
    }
  }, [fetch, onChat]);

  const startAgain = useCallback(() => {
    // A fresh word, because the old one is what the backend will no longer
    // accept, and the command in the chat has to change with it.
    word.current = generateConnectWord();
    return start();
  }, [start]);

  useEffect(() => {
    return () => {
      stop.current = true;
    };
  }, []);

  return {
    command: word.current ? `/connect ${word.current}` : '',
    started,
    expired,
    start,
    startAgain,
  };
}
