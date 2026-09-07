export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PieceContainer } from '@contentfactory/frontend/components/content-intelligence/pieces/piece.container';

/**
 * Одна заготовка, по адресу.
 *
 * §11.8 карты раздела, решение владельца 06.09.2026. Заготовка — долгоживущий
 * объект, который правят, обсуждают и на который ссылаются, поэтому у неё есть
 * адрес, а не состояние компонента: тот же довод, по которому его получил
 * аватар. Таблица заготовок ведёт сюда, и пустая клетка — тоже, приводя с
 * собой площадку в `?adapt=`.
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
  const asked = Array.isArray(query.adapt) ? query.adapt[0] : query.adapt;
  return (
    <PieceContainer
      pieceId={id}
      {...(typeof asked === 'string' && asked ? { adaptPlatform: asked } : {})}
    />
  );
}
