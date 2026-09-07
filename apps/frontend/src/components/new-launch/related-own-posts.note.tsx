'use client';

import { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import type { RelatedOwnPostV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  composeCopy,
  type ComposeLocale,
} from '@contentfactory/frontend/components/new-launch/compose.copy';
import { editorPlainText } from '@contentfactory/frontend/components/new-launch/editor-text';

/**
 * «Свои тексты по теме» — справка в окне поста (`content-factory-next-m2eg.19`).
 *
 * Решение владельца 07.09.2026: «нам это нужно сразу сделать, чтобы модель
 * научилась на них ссылаться». Модель получает этот список при адаптации; в
 * окне он стоит затем, чтобы человек видел ровно то же, что видела она.
 * Один список на двоих — иначе ссылка в готовом тексте перестала бы быть
 * проверяемой глазами.
 *
 * Отмечать здесь нечего, как и в соседнем блоке «Что взято и откуда»: 07.09
 * владелец снял галочки со всего окна одним решением. Строка — это заголовок
 * вышедшего поста и ссылка на него; ссылка открывается в новой вкладке,
 * потому что человек посреди написания поста не должен терять окно.
 *
 * Пустой ответ не рисует ничего. «Похожих текстов не нашлось» — это отчёт о
 * работе продукта, а не помощь пишущему.
 */
export const RelatedOwnPostsNote: FC<{
  related: readonly RelatedOwnPostV1[];
  locale: ComposeLocale;
}> = ({ related, locale }) => {
  const copy = composeCopy[locale];
  if (!related.length) return null;
  return (
    <section
      data-related-own-posts="true"
      className="mt-[16px] rounded-[8px] bg-cf-surface-subtle p-[12px]"
    >
      <h4 className="cf-label-sm text-cf-ink">{copy.relatedTitle}</h4>
      <p className="cf-caption mb-[8px] text-cf-ink-muted text-pretty">
        {copy.relatedHelp}
      </p>
      <ul className="flex flex-col gap-[8px]">
        {related.map((post) => (
          <li key={post.id} className="min-w-0">
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="cf-body-sm break-words text-cf-accent underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            >
              {post.title}
            </a>
            <p className="cf-caption text-cf-ink-muted text-pretty">
              {post.excerpt}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Сколько знаков текста уходит в запрос. Дальше запрос перестаёт быть темой. */
const RELATED_QUERY_CHARACTERS = 300;

/** Короче этого искать нечего: два слова находят половину архива. */
const RELATED_MIN_QUERY_CHARACTERS = 20;

/** Разметка редактора → первые триста знаков темы. */
export const relatedQueryOf = (html: string | null | undefined): string =>
  editorPlainText(html).slice(0, RELATED_QUERY_CHARACTERS);

/**
 * Спросить дверь «свои тексты по теме» по тексту, который человек уже написал.
 *
 * Запрос — начало самого поста, а не заголовок и не тема: заголовка у поста
 * нет вовсе, а тему человек нигде не называет. Ключ SWR держит и запрос, и
 * площадку, поэтому смена канала переспрашивает, а каждая нажатая клавиша —
 * нет: ключ меняется только когда меняются первые триста знаков.
 *
 * Ничего не спрашивается, пока текста меньше двадцати знаков, и ни один отказ
 * двери не виден человеку: справка, которой нет, — это отсутствие справки, а
 * не ошибка окна.
 */
export const useRelatedOwnPosts = (
  query: string,
  platform: string | null
): RelatedOwnPostV1[] => {
  const fetch = useFetch();
  const enough = query.length >= RELATED_MIN_QUERY_CHARACTERS;
  const load = useCallback(async () => {
    const parameters = new URLSearchParams({ q: query, limit: '3' });
    if (platform) parameters.set('platform', platform);
    const response = await fetch(
      `/content-intelligence/materials/related?${parameters.toString()}`
    );
    if (!response.ok) return { related: [] };
    return response.json();
  }, [query, platform, fetch]);

  const { data } = useSWR<{ related: RelatedOwnPostV1[] }>(
    enough ? `related|${platform || ''}|${query}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
      shouldRetryOnError: false,
    }
  );

  return Array.isArray(data?.related) ? data!.related : [];
};
