'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '../../layout/user.context';
import { ContentReadOnlyNote, writeRightFromRole } from '../content-write-right';
import { resolveContentLocale } from '../content-section.copy';
import { useDebouncedValue } from '../content-search-words';
import { useOpenPost } from '../shared/use-open-post';
import { PiecesScreen, type PieceExpansion } from './pieces.screen';
import { piecesCopy } from './pieces.copy';
import {
  NEW_PIECE_PATH,
  PIECES_API,
  emptyPiecesFilters,
  filterPieces,
  piecePath,
  piecesListUrl,
  readPieceDetail,
  readPiecesResponse,
  readStoredColumns,
  storeColumns,
  visibleColumns,
  type PieceCellV1,
  type PiecesFilters,
  type VoiceScreenStateV1,
} from './pieces.adapter';

/**
 * Список заготовок: запросы, выбор колонок и раскрытая строка.
 *
 * `content-factory-next-tu3k.9.9`, поток Z5. Экран рисует, контейнер спрашивает
 * — тот же раздел, что у входа и у архива рядом.
 *
 * Три решения здесь стоит прочитать.
 *
 * **Право читается из сессии до отрисовки.** Читатель видит таблицу целиком,
 * но ни «Новая заготовка», ни «Адаптировать» ему не нажимаются, и рядом стоит
 * причина: узнать про 403 после нажатия — дефект, который в этом разделе уже
 * чинили (`fn33.90.8`).
 *
 * **Отбор применяется дважды нарочно.** Параметры уходят в запрос, и те же
 * параметры применяются к ответу: двери пишет параллельный поток, и фильтр,
 * который сервер ещё не знает, иначе был бы кнопкой без действия.
 *
 * **Раскрытая строка спрашивает дверь заготовки.** Список несёт выдержку, но
 * не квитанцию и не адаптации поимённо; вторая дверь на раскрытие честнее,
 * чем список, который тянет всё про всех ради одной открытой строки.
 *
 * **Поиск не отбирает фокус.** Ключ SWR собирается из «успокоившегося»
 * запроса (`useDebouncedValue`, 300 мс — те же, что у архива и у витрины
 * фактов), а `keepPreviousData` оставляет прежний ответ на время нового. Без
 * этой пары ключ менялся на каждый символ, `state` уходил в `loading`, экран
 * подменял поле поиска скелетоном — и каретка исчезала после первой буквы.
 * Скелетон теперь бывает ровно один раз, до первого ответа.
 */

export function PiecesContainer() {
  const request = useFetch();
  const t = useT();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const w = piecesCopy[locale];

  const user = useUser();
  const canWrite = writeRightFromRole(user?.role).allowed;

  const [filters, setFilters] = useState<PiecesFilters>(emptyPiecesFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(() =>
    readStoredColumns(
      typeof window === 'undefined' ? null : window.localStorage
    )
  );

  /*
    Запрос уходит на сервер не раньше, чем человек перестал печатать, и тот же
    успокоившийся запрос отбирает строки в ответе и подсвечивает слова: три
    разных значения «что ищем» на одном экране разъехались бы на первом же
    быстром вводе.
  */
  const settledQuery = useDebouncedValue(filters.q);
  const settledFilters = useMemo(
    () => ({ ...filters, q: settledQuery }),
    [filters, settledQuery]
  );

  const url = piecesListUrl(settledFilters);
  const list = useSWR(
    url,
    async () => {
      const response = await request(url);
      if (!response.ok) throw new Error('pieces unavailable');
      return readPiecesResponse(await response.json());
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const detailUrl = expandedId ? PIECES_API.detail(expandedId) : null;
  const detail = useSWR(
    detailUrl,
    async () => {
      const response = await request(detailUrl as string);
      if (!response.ok) throw new Error('piece unavailable');
      return readPieceDetail(await response.json());
    },
    { revalidateOnFocus: false }
  );

  const openPost = useOpenPost();

  const envelope = list.data;
  const failed = !!list.error && !envelope;

  const state: VoiceScreenStateV1 = failed
    ? 'error'
    : !envelope
    ? 'loading'
    : !canWrite
    ? // Читатель видит список, но не заводит заготовок: экран остаётся
      // читаемым, а причина стоит над ним.
      envelope.state === 'empty'
      ? 'empty'
      : 'default'
    : envelope.state;

  const rows = useMemo(
    () => filterPieces(envelope?.pieces ?? [], settledFilters),
    [envelope?.pieces, settledFilters]
  );

  const { shown, rest } = useMemo(
    () => visibleColumns(envelope?.columns ?? [], chosen),
    [envelope?.columns, chosen]
  );

  const setFilter = useCallback(
    <K extends keyof PiecesFilters>(key: K, value: PiecesFilters[K]) => {
      setFilters((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const toggleColumn = useCallback(
    (platform: string) => {
      const current = chosen ?? shown.map((column) => column.platform);
      const next = current.includes(platform)
        ? current.filter((one) => one !== platform)
        : [...current, platform];
      setChosen(next);
      storeColumns(
        typeof window === 'undefined' ? null : window.localStorage,
        next
      );
    },
    [chosen, shown]
  );

  const expansion: PieceExpansion | undefined = expandedId
    ? {
        core: detail.data?.core ?? null,
        adaptations: detail.data?.adaptations ?? [],
        loading: !detail.data && !detail.error,
        failed: !!detail.error,
      }
    : undefined;

  /*
    Уход на другую страницу — обычная навигация браузера, а не роутер: этот
    список открывается и вкладкой раздела, и стендом обзора, и роутер
    приложения там не смонтирован. Тот же довод, по которому вход ведёт «К
    каналам» обычной ссылкой.
  */
  const go = useCallback((path: string) => {
    if (typeof window !== 'undefined') window.location.assign(path);
  }, []);

  return (
    <PiecesScreen
      locale={locale}
      state={state}
      rows={rows}
      columns={shown}
      restColumns={rest}
      filters={filters}
      query={settledQuery}
      expandedId={expandedId}
      expansion={expansion}
      canWrite={canWrite}
      notice={envelope?.notice ?? null}
      errorMessage={w.errorBody}
      restrictedReason={t(
        'ai_allowance_unavailable',
        'AI is not available in this workspace yet.'
      )}
      readOnlyNote={
        /*
          `surface` у заметки — три значения, и «заготовок» среди них пока
          нет: файл `content-write-right.tsx` эта волна не трогает. Взято
          ближайшее по смыслу — та же работа, что на вкладке «Бриф», — и
          записано швом в артефакте потока.
        */
        canWrite ? undefined : (
          <ContentReadOnlyNote
            id="pieces-read-only"
            surface="brief"
            refusal="role"
          >
            {w.restrictedBody}
          </ContentReadOnlyNote>
        )
      }
      columnsMenuOpen={columnsMenuOpen}
      chosenColumns={chosen ?? []}
      onFilterChange={setFilter}
      onToggleColumn={toggleColumn}
      onToggleColumnsMenu={() => setColumnsMenuOpen((open) => !open)}
      onExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
      onOpenPiece={(id) => go(piecePath(id))}
      /*
        Нажатие на пустую клетку — это начало адаптации, и оно ведёт на
        страницу заготовки с выбранной площадкой: выбор канала, интервью и
        стрим живут там, а не всплывают над таблицей.
      */
      onAdapt={(id, platform) =>
        go(
          platform
            ? `${piecePath(id)}?adapt=${encodeURIComponent(platform)}`
            : piecePath(id)
        )
      }
      onOpenPost={(cell: PieceCellV1) => {
        if (cell.postId) void openPost(cell.postId);
      }}
      onNewPiece={() => go(NEW_PIECE_PATH)}
      onRetry={() => void list.mutate()}
    />
  );
}

export default PiecesContainer;
