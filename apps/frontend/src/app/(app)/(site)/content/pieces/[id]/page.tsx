export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PieceContainer } from '@contentfactory/frontend/components/content-intelligence/pieces/piece.container';

/**
 * Одна заготовка, по адресу.
 *
 * §11.8 карты раздела, решение владельца 06.09.2026. Заготовка — долгоживущий
 * объект, который правят, обсуждают и на который ссылаются, поэтому у неё есть
 * адрес, а не состояние компонента: тот же довод, по которому его получил
 * аватар. Вкладка — тоже в адресе (`?tab=core|<integrationId>`, `97dq.37`):
 * клетка таблицы заготовок и пост календаря ведут прямо во вкладку канала.
 * Старый `?adapt=<площадка>` по-прежнему открывает вкладку первого канала
 * площадки. `?when=<ISO>` приходит из окна «Что публикуем» календаря и ставит
 * «Когда» черновика этой вкладки на выбранный слот (`97dq.50`).
 *
 * Страница ничего не спрашивает сама: `PieceContainer` читает дверь заготовки
 * и ведёт стрим адаптации.
 */
export const generateMetadata = pageTitle('content_piece', 'Piece');

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const asked = first(query.adapt);
  const tab = first(query.tab);
  const when = first(query.when);
  return (
    <PieceContainer
      pieceId={id}
      {...(typeof tab === 'string' && tab ? { initialTab: tab } : {})}
      {...(typeof asked === 'string' && asked ? { adaptPlatform: asked } : {})}
      {...(typeof when === 'string' && when ? { initialWhen: when } : {})}
    />
  );
}
