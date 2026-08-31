import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response, Request } from 'express';

import { CreateOrgUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto';
import { AuthService } from '@contentfactory/backend/services/auth/auth.service';
import { ForgotReturnPasswordDto } from '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { ForgotPasswordDto } from '@contentfactory/nestjs-libraries/dtos/auth/forgot.password.dto';
import { ResendActivationDto } from '@contentfactory/nestjs-libraries/dtos/auth/resend-activation.dto';
import { ApiTags } from '@nestjs/swagger';
import { getCookieUrlFromDomain } from '@contentfactory/helpers/subdomain/subdomain.management';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { RealIP } from 'nestjs-real-ip';
import { UserAgent } from '@contentfactory/nestjs-libraries/user/user.agent';
import { Provider } from '@prisma/client';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_MAX_AGE = 1000 * 60 * 5;

/**
 * Pulls `state` out of an authorization URL. Anything that is not a URL, or a
 * URL without `state`, yields nothing and leaves the flow exactly as it was —
 * only providers that opted into `state` get a browser-bound cookie.
 */
function readOauthState(link: unknown): string | undefined {
  if (typeof link !== 'string') return undefined;
  try {
    return new URL(link).searchParams.get('state') || undefined;
  } catch {
    return undefined;
  }
}

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(
    private _authService: AuthService,
    private _emailService: EmailService
  ) {}

  @Get('/can-register')
  async canRegister() {
    return {
      register: await this._authService.canRegister(Provider.LOCAL as string),
    };
  }

  @Post('/register')
  async register(
    @Req() req: Request,
    @Body() body: CreateOrgUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg, awaitingApproval } =
        await this._authService.routeAuth(
          body.provider,
          body,
          ip,
          userAgent,
          getOrgFromCookie
        );

      // The account was created and is waiting for an administrator. No
      // session cookie is set: the browser leaves registration with nothing it
      // can use until a person approves the account.
      if (awaitingApproval) {
        response.header('approval', 'true');
        response.status(200).json({ approval: true });
        return;
      }

      const activationRequired =
        body.provider === 'LOCAL' && this._emailService.hasProvider();

      if (activationRequired) {
        response.header('activate', 'true');
        response.status(200).json({ activate: true });
        return;
      }

      response.cookie('auth', jwt, {
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
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
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
          response.header('showorg', addedOrg.organizationId);
        }
      }

      response.header('onboarding', 'true');
      response.status(200).json({
        register: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  @Post('/login')
  async login(
    @Req() req: Request,
    @Body() body: LoginUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg, awaitingApproval } =
        await this._authService.routeAuth(
          body.provider,
          body,
          ip,
          userAgent,
          getOrgFromCookie
        );

      // Signing in through a provider can also create the account, and in
      // approval mode that account is not usable yet. Same treatment as
      // registration: no cookie, and a state the page can explain.
      if (awaitingApproval) {
        response.header('approval', 'true');
        response.status(200).json({ approval: true });
        return;
      }

      response.cookie('auth', jwt, {
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
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
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
          response.header('showorg', addedOrg.organizationId);
        }
      }

      response.header('reload', 'true');
      response.status(200).json({
        login: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  @Post('/forgot')
  async forgot(@Body() body: ForgotPasswordDto) {
    try {
      await this._authService.forgot(body.email);
      return {
        forgot: true,
      };
    } catch (e) {
      return {
        forgot: false,
      };
    }
  }

  @Post('/forgot-return')
  async forgotReturn(@Body() body: ForgotReturnPasswordDto) {
    const reset = await this._authService.forgotReturn(body);
    return {
      reset: !!reset,
    };
  }

  @Get('/oauth-mobile-callback')
  mobileCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const scheme = process.env.MOBILE_APP_SCHEME || 'contentfactory://auth/callback';
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (state) params.set('state', state);
    return response.redirect(302, `${scheme}?${params.toString()}`);
  }

  @Get('/oauth/:provider')
  async oauthLink(
    @Param('provider') provider: string,
    @Query() query: any,
    @Res({ passthrough: true }) response: Response
  ) {
    const link = await this._authService.oauthLink(provider, query);

    // A provider that puts `state` in its authorization URL gets that value
    // mirrored into a short-lived cookie, so the callback can prove it reached
    // the same browser that asked for the link. Providers without `state` are
    // untouched; the response body stays the bare link either way.
    const state = readOauthState(link);
    if (state) {
      response.cookie(OAUTH_STATE_COOKIE, state, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
      });
    }

    return link;
  }

  @Post('/activate')
  async activate(
    @Body('code') code: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const activate = await this._authService.activate(code);
    if (!activate) {
      return response.status(200).json({ can: false });
    }

    response.cookie('auth', activate, {
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
      response.header('auth', activate);
    }

    response.header('onboarding', 'true');

    return response.status(200).json({ can: true });
  }

  @Post('/resend-activation')
  async resendActivation(@Body() body: ResendActivationDto) {
    try {
      await this._authService.resendActivationEmail(body.email);
      return {
        success: true,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message,
      };
    }
  }

  @Post('/oauth/:provider/exists')
  async oauthExists(
    @Req() req: Request,
    @Body('code') code: string,
    @Body('redirect_uri') redirect_uri: string,
    @Body('state') state: string,
    @Param('provider') provider: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const { jwt, token, awaitingApproval } = await this._authService.checkExists(
      provider,
      code,
      redirect_uri,
      { state, browserState: req?.cookies?.[OAUTH_STATE_COOKIE] }
    );

    // The state is single-use in Redis, so the cookie has nothing left to
    // authorize once the exchange is done.
    response.clearCookie(OAUTH_STATE_COOKIE, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    });

    if (awaitingApproval) {
      response.header('approval', 'true');
      return response.status(200).json({ approval: true });
    }

    if (token) {
      return response.json({ token });
    }

    response.cookie('auth', jwt, {
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
      response.header('auth', jwt);
    }

    response.header('reload', 'true');

    response.status(200).json({
      login: true,
    });
  }
}
