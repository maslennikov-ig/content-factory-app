/**
 * Календарь для экрана адаптации — портом, а не классом
 * (`content-factory-next-97dq.37`).
 *
 * Выход адаптации в очередь идёт теми же тремя шагами, что делал Postiz-окно
 * «Создать пост»: проверка площадки (`POST /posts/valid`), дата и перевод
 * черновика в очередь с запуском публикации. Второго пути к очереди продукт не
 * заводит, поэтому заготовки зовут сам `PostsService` — но по имени порта:
 * класс тянет за собой Temporal, хранилище и провайдеров, а наборы и сборки
 * без календаря собирают `PieceService` и без них. Привязан порт в
 * `DatabaseModule` (`useExisting: PostsService`).
 */

import type { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';

export const PIECE_POSTS_PORT = 'PIECE_POSTS_PORT';

export type PiecePostsPort = Pick<
  PostsService,
  'validatePosts' | 'changeDate' | 'changePostStatus'
>;
