import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { OAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service';
import { HttpForbiddenException } from '@contentfactory/nestjs-libraries/services/exception.filter';

@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _oauthService: OAuthService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization ||
      req.headers.Authorization) as string;
    if (!auth) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No API Key found' });
      return;
    }
    try {
      if (auth.startsWith('pos_')) {
        const authorization = await this._oauthService.getOrgByOAuthToken(auth);
        if (!authorization) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid OAuth token' });
          return;
        }

        // Same gate as the API-key branch below: the token outlives the
        // session that minted it, so blocking the account has to reach it.
        if (!authorization.user?.activated) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'User is not activated' });
          return;
        }

        const org = authorization.organization;
        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        // `content-factory-next-fn33.19`: the key stands in for an
        // administrator of this workspace, not for the instance. `ADMIN` and
        // `SUPERADMIN` open exactly the same doors (`permissions.service.ts`),
        // so nothing the key could reach before is closed now; what changes is
        // that no request carries a role the product no longer hands out.
        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'ADMIN' } }] };
      } else {
        const org = await this._organizationService.getOrgByApiKey(auth);
        if (!org) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid API key' });
          return;
        }

        // The key is the organization's, not a person's, and it is minted
        // before anyone approves the account — `/enterprise/create-user`
        // returns a working key the moment it is called. Checking here rather
        // than at issue time also means blocking an account later takes its
        // already-issued key with it, which is what the web session does.
        if (!org.users.some(({ user }) => user.activated)) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'User is not activated' });
          return;
        }

        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        // `content-factory-next-fn33.19`: the key stands in for an
        // administrator of this workspace, not for the instance. `ADMIN` and
        // `SUPERADMIN` open exactly the same doors (`permissions.service.ts`),
        // so nothing the key could reach before is closed now; what changes is
        // that no request carries a role the product no longer hands out.
        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'ADMIN' } }] };
      }
    } catch (err) {
      throw new HttpForbiddenException();
    }
    next();
  }
}
