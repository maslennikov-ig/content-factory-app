import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Тело `DELETE /integrations`: какой канал снять.
 *
 * До 05.09.2026 контроллер читал `@Body('id')` без разбора. Пустое тело давало
 * `id === undefined`, Prisma в `where` пропускает `undefined` как «без
 * условия», и `getPostsForChannel(org, undefined)` возвращал все посты
 * области — каждый из них помечался удалённым, и только потом падало само
 * снятие канала (`content-factory-next-fn33.90.3`). Один запрос без
 * идентификатора стирал ленту области целиком.
 */
export class DeleteIntegrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;
}
