import { IsBoolean, IsOptional } from 'class-validator';

/**
 * The second press on `POST /admin/users/:id/delete`.
 *
 * `content-factory-next-fn33.32`. The first call carries no flag and, when the
 * account is the only member of a workspace that still holds content, is
 * answered 409 with what would go. The flag is what says «yes, the workspace
 * and its data too», so it travels in the body rather than the query string:
 * a query string ends up in browser history, proxy logs and shared links,
 * where a link that deletes a workspace with its content should never be.
 */
export class DeleteAccountDto {
  @IsOptional()
  @IsBoolean()
  deleteWorkspaces?: boolean;
}
