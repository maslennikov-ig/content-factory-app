import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { sign } from 'jsonwebtoken';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { StripeService } from '@contentfactory/nestjs-libraries/services/stripe.service';
import { Response, Request } from 'express';
import { AuthService } from '@contentfactory/backend/services/auth/auth.service';
import { AuthService as AuthChecker } from '@contentfactory/helpers/auth/auth.service';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { getCookieUrlFromDomain } from '@contentfactory/helpers/subdomain/subdomain.management';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { UserDetailDto } from '@contentfactory/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto';
import { HttpForbiddenException } from '@contentfactory/nestjs-libraries/services/exception.filter';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  ConfirmUserIdentityDto,
  LinkUserIdentityDto,
  UnlinkUserIdentityDto,
} from '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto';

@ApiTags('User')
@Controller('/user')
export class UsersController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _stripeService: StripeService,
    private _authService: AuthService,
    private _orgService: OrganizationService,
    private _userService: UsersService
  ) {}

  private readonly _logger = new Logger(UsersController.name);

  @Get('/self')
  async getSelf(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization,
    @Req() req: Request
  ) {
    if (!organization) {
      throw new HttpForbiddenException();
    }

    const impersonate = req.cookies.impersonate || req.headers.impersonate;
    // @ts-ignore
    return {
      ...user,
      orgId: organization.id,
      totalChannels: !process.env.STRIPE_PUBLISHABLE_KEY
        ? 10000
        : // @ts-ignore
          organization?.subscription?.totalChannels || pricing.FREE.channel,
      tier:
        // @ts-ignore
        organization?.subscription?.subscriptionTier ||
        (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE'),
      // @ts-ignore
      role: organization?.users[0]?.role,
      // @ts-ignore
      isLifetime: !!organization?.subscription?.isLifetime,
      admin: !!user.isSuperAdmin,
      impersonate: !!impersonate,
      isTrailing: !process.env.STRIPE_PUBLISHABLE_KEY
        ? false
        : organization?.isTrailing,
      allowTrial: organization?.allowTrial,
      streakSince: organization?.streakSince || null,
      publicApi:
        // @ts-ignore
        organization?.users[0]?.role === 'SUPERADMIN' ||
        // @ts-ignore
        organization?.users[0]?.role === 'ADMIN'
          ? organization?.apiKey
          : '',
    };
  }

  @Get('/personal')
  async getPersonalInformation(@GetUserFromRequest() user: User) {
    return this._userService.getPersonal(user.id);
  }

  @Get('/identities')
  listIdentities(@GetUserFromRequest() user: User) {
    return this._userService.listIdentities(user.id);
  }

  @Post('/identities/link')
  linkIdentity(
    @GetUserFromRequest() user: User,
    @Body() body: LinkUserIdentityDto,
    @Req() req: Request
  ) {
    this.assertIdentityMutationRequest(user.id, req);
    return this._authService.linkIdentity(user.id, body, {
      state: body.state,
      browserState: req.cookies?.oauth_state,
    });
  }

  @Post('/identities/confirm')
  confirmIdentity(
    @GetUserFromRequest() user: User,
    @Body() body: ConfirmUserIdentityDto,
    @Req() req: Request
  ) {
    this.assertIdentityMutationRequest(user.id, req);
    return this._authService.confirmIdentityLink(user.id, body.token);
  }

  @Delete('/identities/unlink')
  unlinkIdentity(
    @GetUserFromRequest() user: User,
    @Body() body: UnlinkUserIdentityDto,
    @Req() req: Request
  ) {
    this.assertIdentityMutationRequest(user.id, req);
    return this._userService.unlinkIdentity(
      user.id,
      body.provider,
      body.providerIdentifier
    );
  }

  @Get('/impersonate')
  async getImpersonate(
    @GetUserFromRequest() user: User,
    @Query('name') name: string
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._userService.getImpersonateUser(name);
  }

  @Post('/impersonate')
  async setImpersonate(
    @GetUserFromRequest() user: User,
    @Body('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    response.cookie('impersonate', id, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    if (process.env.NOT_SECURED) {
      response.header('impersonate', id);
    }
  }

  @Post('/switch')
  async switchUser(
    @GetUserFromRequest() user: User,
    @Body('id') id: string,
    @Req() req: Request
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    // `user` is the impersonated account, so the admin id comes from the token.
    // Require an active impersonation session and never allow the admin's own
    // account in the swap — either would trade away the admin's login.
    const adminId = this.getRequestUserId(req);
    if (
      !id ||
      !adminId ||
      id === user.id ||
      adminId === user.id ||
      adminId === id
    ) {
      throw new HttpException('Invalid user to switch to', 400);
    }

    const { kept, switched } = await this._userService.switchUser(
      user.id,
      id,
      adminId
    );

    await this._stripeService.syncCustomerEmailsAfterSwitch([kept, switched]);

    return { success: true };
  }

  private getRequestUserId(req: Request): string | null {
    try {
      const auth = (req.headers.auth as string) || req.cookies?.auth;
      const payload = AuthChecker.verifyJWT(auth) as { id?: string } | null;
      return payload?.id || null;
    } catch {
      return null;
    }
  }

  private assertIdentityMutationRequest(userId: string, req: Request) {
    const contentType = String(req.headers['content-type'] || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = process.env.FRONTEND_URL
        ? new URL(process.env.FRONTEND_URL).origin
        : null;
    } catch {
      expectedOrigin = null;
    }

    // Without a configured origin every request looks foreign, and the refusal
    // that follows is indistinguishable from an attack being blocked. Say which
    // it is: this is a deployment fault, not the caller's.
    if (!expectedOrigin) {
      this._logger.error(
        'FRONTEND_URL is missing or unparseable; refusing every sign-in method change until it is set'
      );
      throw new HttpException(
        {
          message:
            'Sign-in method changes are unavailable: FRONTEND_URL is not configured',
          code: 'identity_mutations_unavailable',
        },
        500
      );
    }

    if (
      contentType !== 'application/json' ||
      req.headers.origin !== expectedOrigin ||
      this.getRequestUserId(req) !== userId
    ) {
      throw new HttpException(
        {
          message: 'Forbidden identity mutation request',
          code: 'identity_mutation_forbidden',
        },
        403
      );
    }
  }

  @Post('/personal')
  async changePersonal(
    @GetUserFromRequest() user: User,
    @Body() body: UserDetailDto
  ) {
    return this._userService.changePersonal(user.id, body);
  }

  @Get('/email-notifications')
  async getEmailNotifications(@GetUserFromRequest() user: User) {
    return this._userService.getEmailNotifications(user.id);
  }

  @Post('/email-notifications')
  async updateEmailNotifications(
    @GetUserFromRequest() user: User,
    @Body() body: EmailNotificationsDto
  ) {
    return this._userService.updateEmailNotifications(user.id, body);
  }

  @Post('/api-key/rotate')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async rotateApiKey(@GetOrgFromRequest() organization: Organization) {
    return this._orgService.updateApiKey(organization.id);
  }

  @Get('/subscription')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getSubscription(@GetOrgFromRequest() organization: Organization) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organization.id
      );

    return subscription ? { subscription } : { subscription: undefined };
  }

  @Get('/subscription/tiers')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async tiers() {
    return this._stripeService.getPackages();
  }

  @Post('/join-org')
  async joinOrg(
    @GetUserFromRequest() user: User,
    @Body('org') org: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const getOrgFromCookie = this._authService.getOrgFromCookie(org);

    if (!getOrgFromCookie) {
      return response.status(200).json({ id: null });
    }

    const addedOrg = await this._orgService.addUserToOrg(
      user.id,
      getOrgFromCookie.id,
      getOrgFromCookie.orgId,
      getOrgFromCookie.role
    );

    response.status(200).json({
      id: typeof addedOrg !== 'boolean' ? addedOrg.organizationId : null,
    });
  }

  @Get('/organizations')
  async getOrgs(@GetUserFromRequest() user: User) {
    return (await this._orgService.getOrgsByUserId(user.id)).filter(
      (f) => !f.users[0].disabled
    );
  }

  @Post('/change-org')
  changeOrg(
    @Body('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    response.cookie('showorg', id, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    if (process.env.NOT_SECURED) {
      response.header('showorg', id);
    }

    response.status(200).send();
  }

  @Post('/logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.header('logout', 'true');
    response.cookie('auth', '', {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      maxAge: -1,
      expires: new Date(0),
    });

    response.cookie('showorg', '', {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      maxAge: -1,
      expires: new Date(0),
    });

    response.cookie('impersonate', '', {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      maxAge: -1,
      expires: new Date(0),
    });

    response.status(200).send();
  }
}
