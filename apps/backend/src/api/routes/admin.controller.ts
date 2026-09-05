import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { DeleteAccountDto } from '@contentfactory/nestjs-libraries/dtos/users/delete-account.dto';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ErrorsService } from '@contentfactory/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsService } from '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { registrationRequiresApproval } from '@contentfactory/helpers/auth/registration.approval';
import dayjs from 'dayjs';
import { ProductEventsService } from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service';
import { PUBLIC_GROWTH_SERVICE } from '@contentfactory/backend/api/routes/public-growth.token';
import { assertSameOriginJsonMutation } from '@contentfactory/nestjs-libraries/auth/same-origin-mutation';
import { Request } from 'express';

interface PublicGrowthReportService {
  getAdminReport(
    from: string | undefined,
    to: string | undefined
  ): Promise<{
    totals: Record<string, number>;
    ratios: Record<string, number>;
  }>;
}

@ApiTags('Admin')
@Controller('/admin')
export class AdminController {
  constructor(
    private _errorsService: ErrorsService,
    private _adminStatsService: AdminStatsService,
    private _usersService: UsersService,
    private _productEventsService: ProductEventsService,
    @Inject(PUBLIC_GROWTH_SERVICE)
    private _publicGrowthService: PublicGrowthReportService
  ) {}

  private readonly _logger = new Logger(AdminController.name);

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
  }

  /**
   * One proof for both ways an account can be removed — rejection and deletion.
   * The wording stayed with rejection's codes on purpose: the screen and the
   * logs already read them, and a second near-identical set of codes for the
   * same check would only be a second thing to keep in step.
   */
  private assertAccountRemovalRequest(userId: string, req: Request) {
    assertSameOriginJsonMutation(
      userId,
      req,
      {
        action: 'pending-account rejection',
        unavailableMessage:
          'Pending-account rejection is unavailable: FRONTEND_URL is not configured',
        unavailableCode: 'pending_rejection_unavailable',
        forbiddenMessage: 'Forbidden pending-account rejection request',
        forbiddenCode: 'pending_rejection_forbidden',
      },
      this._logger
    );
  }

  /**
   * The other three ways one press changes an account: approval, blocking and
   * lifting a block.
   *
   * They carried only `assertSuperAdmin`, and that is a check on *who* is
   * signed in, not on *where the press came from*. The session cookie is
   * `sameSite: 'none'`, these routes take no body, and a page on any other
   * site could therefore make an administrator's own browser switch an
   * account off — the administrator would see nothing but the result. The
   * neighbouring removal doors already proved the origin; these three now do
   * the same.
   *
   * Their own codes rather than rejection's: an approval that is refused is
   * not a rejection that is refused, and a log line that says otherwise sends
   * the reader to the wrong route.
   */
  private assertAccountStateRequest(userId: string, req: Request) {
    assertSameOriginJsonMutation(
      userId,
      req,
      {
        action: 'an account state change',
        unavailableMessage:
          'Account state changes are unavailable: FRONTEND_URL is not configured',
        unavailableCode: 'account_state_change_unavailable',
        forbiddenMessage: 'Forbidden account state change request',
        forbiddenCode: 'account_state_change_forbidden',
      },
      this._logger
    );
  }

  @Get('/product-events')
  async getProductEvents(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    this.assertSuperAdmin(user);
    return this._productEventsService.getAdminReport(from, to);
  }

  @Get('/public-growth-report')
  async getPublicGrowthReport(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    this.assertSuperAdmin(user);
    return this._publicGrowthService.getAdminReport(from, to);
  }

  @Get('/errors')
  async listErrors(
    @GetUserFromRequest() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('email') email?: string,
    @Query('unknownFirst') unknownFirst?: string
  ) {
    this.assertSuperAdmin(user);
    return this._errorsService.listErrors({
      page: page ? parseInt(page, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
      platform: platform || undefined,
      email: email || undefined,
      unknownFirst: unknownFirst === 'true' || unknownFirst === '1',
    });
  }

  @Get('/errors/platforms')
  async listPlatforms(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._errorsService.listPlatforms();
  }

  @Get('/stats')
  async getStats(
    @GetUserFromRequest() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unknownOnly') unknownOnly?: string
  ) {
    this.assertSuperAdmin(user);

    const fromDate = from ? dayjs(from) : dayjs().subtract(30, 'day');
    const toDate = to ? dayjs(to) : dayjs();

    return this._adminStatsService.getStats({
      from: fromDate.startOf('day').toDate(),
      to: toDate.endOf('day').toDate(),
      unknownOnly: unknownOnly === 'true' || unknownOnly === '1',
    });
  }

  @Get('/users')
  async listUsers(
    @GetUserFromRequest() user: User,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    this.assertSuperAdmin(user);

    const result = await this._usersService.listAccounts({
      status: status === 'active' || status === 'all' ? status : 'pending',
      search: search?.trim() || undefined,
      page: page ? parseInt(page, 10) || 0 : 0,
      limit: limit ? parseInt(limit, 10) || 25 : 25,
    });

    // The page needs to know whether new accounts arrive switched off, so it
    // can say why the pending list is empty instead of implying approval is on.
    return { ...result, approvalRequired: registrationRequiresApproval() };
  }

  @Post('/users/:id/approve')
  async approveUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    this.assertSuperAdmin(user);
    this.assertAccountStateRequest(user.id, req);
    await this._usersService.approveAccount(id, user.id);
    return { success: true };
  }

  @Post('/users/:id/reject')
  async rejectPendingUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    this.assertSuperAdmin(user);
    this.assertAccountRemovalRequest(user.id, req);
    await this._usersService.rejectPendingAccount(id, user.id);
    return { success: true };
  }

  /**
   * Removing an account outright. Behind the same same-origin proof as
   * rejection, and for a stronger reason: this one reaches accounts that have
   * been in the product, so a forged request would be a deletion, not a
   * declined registration.
   *
   * `content-factory-next-fn33.32`: one door, two presses. Without
   * `deleteWorkspaces` an account that is the only member of a workspace still
   * holding content is answered 409 with what would go; with it, the workspace
   * and its content go too. The flag is a body field, not a query parameter —
   * a URL that empties a workspace has no business in browser history.
   */
  @Post('/users/:id/delete')
  async deleteUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body?: DeleteAccountDto
  ) {
    this.assertSuperAdmin(user);
    this.assertAccountRemovalRequest(user.id, req);
    await this._usersService.deleteAccount(
      id,
      user.id,
      body?.deleteWorkspaces === true
    );
    return { success: true };
  }

  @Post('/users/:id/block')
  async blockUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    this.assertSuperAdmin(user);
    this.assertAccountStateRequest(user.id, req);
    await this._usersService.blockAccount(id, user.id);
    return { success: true };
  }

  /**
   * Lifting a block, and not the same door as approval.
   *
   * `content-factory-next-fn33.66`: a blocked account used to be
   * indistinguishable from one waiting for approval — both were
   * `activated: false` — so it appeared among the pending with an «Approve»
   * button, and giving somebody their access back looked exactly like letting
   * a newcomer in. Two states, two doors, and each one says what it did.
   */
  @Post('/users/:id/unblock')
  async unblockUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    this.assertSuperAdmin(user);
    this.assertAccountStateRequest(user.id, req);
    await this._usersService.unblockAccount(id, user.id);
    return { success: true };
  }

  @Post('/telegram/connect')
  async connectTelegram(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._usersService.issueTelegramBindingCode(user.id);
  }

  @Get('/telegram/status')
  async telegramStatus(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._usersService.getTelegramBindingStatus(user.id);
  }
}
