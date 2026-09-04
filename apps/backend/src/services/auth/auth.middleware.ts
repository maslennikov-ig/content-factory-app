import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { User } from '@prisma/client';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { getCookieUrlFromDomain } from '@contentfactory/helpers/subdomain/subdomain.management';
import { HttpForbiddenException } from '@contentfactory/nestjs-libraries/services/exception.filter';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import { runAsActingUser } from '@contentfactory/nestjs-libraries/user/acting.user';

export const removeAuth = (res: Response) => {
  res.cookie('auth', '', {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          httpOnly: true,
          sameSite: 'none',
        }
      : {}),
    expires: new Date(0),
    maxAge: -1,
  });
  res.header('logout', 'true');
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _userService: UsersService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.auth || req.cookies.auth;
    if (!auth) {
      throw new HttpForbiddenException();
    }
    let actingUserId: string | undefined;
    try {
      // Verify the JWT signature only. Never trust authorization-relevant
      // claims (id, isSuperAdmin, activated) from the token body — always
      // re-resolve the user from the database using the id.
      const payload = AuthService.verifyJWT(auth) as User | null;
      const orgHeader = req.cookies.showorg || req.headers.showorg;

      if (!payload?.id) {
        throw new HttpForbiddenException();
      }

      let user = (await this._userService.getUserById(payload.id)) as User | null;

      if (!user) {
        throw new HttpForbiddenException();
      }

      if (!user.activated) {
        throw new HttpForbiddenException();
      }

      const impersonate = req.cookies.impersonate || req.headers.impersonate;
      if (user?.isSuperAdmin && impersonate) {
        const loadImpersonate = await this._organizationService.getUserOrg(
          impersonate
        );

        if (loadImpersonate) {
          user = loadImpersonate.user;
          user.isSuperAdmin = true;
          delete user.password;

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.user = user;

          // @ts-ignore
          loadImpersonate.organization.users =
            loadImpersonate.organization.users.filter(
              (f) => f.userId === user.id
            );
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          req.org = loadImpersonate.organization;
          // The impersonated identity, not the superadmin behind it: what the
          // request does, it does as that person, and the ledger should read
          // the same way the organization's own screens do.
          runAsActingUser(user.id, next);
          return;
        }
      }

      delete user.password;
      const organizations = (
        await this._organizationService.getOrgsByUserId(user.id)
      ).filter((f) => !f.users[0].disabled);

      // An empty array is not a missing one, and the old `if (!organization)`
      // was never true: a member switched off in the only workspace they had
      // fell through to `setOrg.apiKey` on `undefined` and was answered by the
      // crash that made. The session is valid — the membership is what ran
      // out — so this is a refusal with a code and a sentence rather than the
      // blank logout below (`content-factory-next-fn33.104`).
      if (!organizations.length) {
        throw new HttpException(
          {
            message:
              'This account is not a member of any active workspace. Ask an administrator to restore your access or invite you again.',
            code: 'workspace_membership_none',
          },
          403
        );
      }

      const setOrg =
        organizations.find((org) => org.id === orgHeader) || organizations[0];

      if (!setOrg.apiKey) {
        await this._organizationService.updateApiKey(setOrg.id);
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.user = user;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      req.org = setOrg;
      actingUserId = user.id;
    } catch (err) {
      // A refusal that already says why keeps its own words. Everything else —
      // a bad signature, an unknown account, a call that failed — is a session
      // that cannot be trusted, and the browser is logged out.
      if (err instanceof HttpException) throw err;
      throw new HttpForbiddenException();
    }
    if (!actingUserId) {
      // The block above either resolves a session or throws. Reaching here
      // would mean the request continued without one, and this middleware
      // exists to make that impossible.
      throw new HttpForbiddenException();
    }
    // Everything the request goes on to do runs as this person, so anything
    // that records who acted — the AI ledger first — can read it without a
    // parameter threaded through services that have no business with it.
    runAsActingUser(actingUserId, next);
  }
}
