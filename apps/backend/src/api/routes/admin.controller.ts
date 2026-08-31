import {
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
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
  async approveUser(@GetUserFromRequest() user: User, @Param('id') id: string) {
    this.assertSuperAdmin(user);
    await this._usersService.approveAccount(id);
    return { success: true };
  }

  @Post('/users/:id/block')
  async blockUser(@GetUserFromRequest() user: User, @Param('id') id: string) {
    this.assertSuperAdmin(user);
    await this._usersService.blockAccount(id, user.id);
    return { success: true };
  }
}
