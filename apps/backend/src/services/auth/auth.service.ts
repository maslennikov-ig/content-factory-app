import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuthService as AuthChecker } from '@contentfactory/helpers/auth/auth.service';
import { registrationRequiresApproval } from '@contentfactory/helpers/auth/registration.approval';
import { resolveNewsletterConsent } from '@contentfactory/helpers/auth/newsletter.consent';
import { AuthProviderManager } from '@contentfactory/backend/services/auth/providers/providers.manager';
import type { AuthCallbackContext } from '@contentfactory/backend/services/auth/providers.interface';
import dayjs from 'dayjs';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import { ForgotReturnPasswordDto } from '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { LinkUserIdentityDto } from '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto';
import {
  discardIdentityConfirmation,
  IDENTITY_CONFIRMATION_TTL_SECONDS,
  issueIdentityConfirmation,
  readIdentityConfirmation,
} from '@contentfactory/backend/services/auth/identity-confirmation';
import { NewsletterDeliveryRetryServiceV1 } from '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1';
import { PublicGrowthService } from '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service';
import { TelegramUpdatesService } from '@contentfactory/nestjs-libraries/integrations/telegram.updates.service';
import {
  resolveBackendLocale,
  translateBackendString,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';

/**
 * Providers whose `getToken` binds the callback to the browser that started it.
 * FARCASTER and WALLET do not take the callback context at all, so a link
 * request naming them would be an account change with no proof it came from the
 * tab that asked. They stay out until they carry that binding.
 */
const LINKABLE_EXTERNAL_PROVIDERS = new Set<Provider>([
  Provider.GENERIC,
  Provider.GITHUB,
  Provider.GOOGLE,
  Provider.TELEGRAM,
]);

@Injectable()
export class AuthService {
  private readonly _logger = new Logger(AuthService.name);

  constructor(
    private _userService: UsersService,
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService,
    private _emailService: EmailService,
    private _providerManager: AuthProviderManager,
    private _newsletterRetry: NewsletterDeliveryRetryServiceV1,
    private _publicGrowthService: PublicGrowthService,
    private _telegramUpdatesService: TelegramUpdatesService
  ) {}

  /**
   * Best-effort on purpose, called right after the account that made this
   * true is already committed. A failure here must read as "an administrator
   * was not paged", never as "the registration failed" — the applicant
   * already has an account waiting for approval regardless of whether anyone
   * heard about it yet.
   *
   * `TelegramUpdatesService.notifyAdminsOfPendingApproval` already logs every
   * failure it can reach loudly through Nest's own `Logger` and never throws;
   * this catch exists only for what is outside that guarantee — dependency
   * injection producing something unusable, say — so a defect there is still
   * discoverable instead of taking registration down with it.
   */
  private async notifyAdminsOfPendingApproval(
    email: string,
    createdAt: Date
  ) {
    try {
      await this._telegramUpdatesService.notifyAdminsOfPendingApproval(
        email,
        createdAt
      );
    } catch (error) {
      this._logger.error(
        'Registration succeeded but paging administrators about the pending approval failed',
        error
      );
    }
  }
  async canRegister(provider: string) {
    if (
      process.env.DISABLE_REGISTRATION !== 'true' ||
      provider === Provider.GENERIC
    ) {
      return true;
    }

    return (await this._organizationService.getCount()) === 0;
  }

  async routeAuth(
    provider: Provider,
    body: CreateOrgUserDto | LoginUserDto,
    ip: string,
    userAgent: string,
    addToOrg?: boolean | { orgId: string; role: 'USER' | 'ADMIN'; id: string }
  ) {
    if (provider === Provider.LOCAL) {
      if (this.plusAddressingBlocked(body.email)) {
        throw new Error('Email with plus sign is not allowed');
      }
      if (body instanceof CreateOrgUserDto) {
        body.email = body.email.toLowerCase();
      }
      const user = await this._userService.getUserByEmail(body.email);
      if (body instanceof CreateOrgUserDto) {
        if (user) {
          throw new Error('Email already exists');
        }

        if (!(await this.canRegister(provider))) {
          throw new Error('Registration is disabled');
        }

        const newsletterConsent = resolveNewsletterConsent({
          requested: body.subscribeToNewsletter,
          provider,
          email: body.email,
        });

        const create = await this._organizationService.createOrgAndUser(
          { ...body, newsletterConsent },
          ip,
          userAgent
        );

        await this.recordRegistrationCompleted(create.id);

        const addedOrg =
          addToOrg && typeof addToOrg !== 'boolean'
            ? await this._organizationService.addUserToOrg(
                create.users[0].user.id,
                addToOrg.id,
                addToOrg.orgId,
                addToOrg.role
              )
            : false;

        const created = create.users[0].user;

        await this.subscribeNewAccount(
          newsletterConsent,
          created.id,
          created.newsletterDeliveryPendingAt
        );

        // In approval mode the account exists but is not usable, and there is
        // no self-service way to change that. Handing out a session token or
        // an activation link here would be handing out the very thing the
        // administrator is supposed to grant. The applicant still has to hear
        // something, so a separate, link-free email tells them the request
        // was received and is waiting on a person.
        if (!created.activated && registrationRequiresApproval()) {
          const awaitingApprovalLocale = resolveBackendLocale(created.language);
          // The account is already written. A mail failure here must not turn
          // a registration that succeeded into an error the person reads as
          // "it did not work" — they would try again and be told the address
          // is taken. So the send is allowed to fail on its own.
          //
          // This swallow is deliberate and it is also the defect named in
          // `content-factory-next-7jxo`: today nothing downstream can tell a
          // failed send from a successful one, so `console.error` is the only
          // place a failure can surface at all. When 7jxo gives the mail path
          // a real way to report, this is one of its callers.
          try {
            await this._emailService.sendEmail(
              body.email,
              translateBackendString(
                'email_awaiting_approval_subject',
                awaitingApprovalLocale
              ),
              translateBackendString(
                'email_awaiting_approval_body',
                awaitingApprovalLocale
              ),
              'top',
              undefined,
              awaitingApprovalLocale
            );
          } catch (err) {
            console.error(
              'Registration succeeded but the awaiting-approval email could not be queued',
              err
            );
          }
          await this.notifyAdminsOfPendingApproval(
            body.email,
            created.createdAt
          );
          return { addedOrg, jwt: '', awaitingApproval: true };
        }

        const obj = {
          addedOrg,
          jwt: await this.jwt(created),
          awaitingApproval: false,
        };
        const registrationLocale = resolveBackendLocale(created.language);
        await this._emailService.sendEmail(
          body.email,
          translateBackendString(
            'email_activate_account_subject',
            registrationLocale
          ),
          translateBackendString('email_activate_account_body', registrationLocale, {
            link: `${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}`,
          }),
          'top',
          undefined,
          registrationLocale
        );
        return obj;
      }

      if (!user || !AuthChecker.comparePassword(body.password, user.password)) {
        throw new Error('Invalid user name or password');
      }

      if (!user.activated) {
        throw new Error(this.inactiveReason());
      }

      return { addedOrg: false, jwt: await this.jwt(user), awaitingApproval: false };
    }

    const { user, created } = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent
    );

    // A federated account is subject to the same gate: the identity provider
    // proves who someone is, not that this instance wants them.
    if (!user.activated) {
      if (created && registrationRequiresApproval()) {
        await this.notifyAdminsOfPendingApproval(user.email, user.createdAt);
        return { addedOrg: false, jwt: '', awaitingApproval: true };
      }

      throw new Error(this.inactiveReason());
    }

    const addedOrg =
      addToOrg && typeof addToOrg !== 'boolean'
        ? await this._organizationService.addUserToOrg(
            user.id,
            addToOrg.id,
            addToOrg.orgId,
            addToOrg.role
          )
        : false;
    return { addedOrg, jwt: await this.jwt(user), awaitingApproval: false };
  }

  /**
   * What to tell someone whose account exists but is switched off. The two
   * cases differ in what the person should do next: wait for an email, or wait
   * for a person. An account an administrator switched back off also lands
   * here, and is told to wait for a person — which is what it needs.
   */
  private inactiveReason() {
    return registrationRequiresApproval()
      ? 'User is awaiting approval'
      : 'User is not activated';
  }

  public getOrgFromCookie(cookie?: string) {
    if (!cookie) {
      return false;
    }

    try {
      const getOrg: any = AuthChecker.verifyJWT(cookie);
      if (dayjs(getOrg.timeLimit).isBefore(dayjs())) {
        return false;
      }

      return getOrg as {
        email: string;
        role: 'USER' | 'ADMIN';
        orgId: string;
        id: string;
      };
    } catch (err) {
      return false;
    }
  }

  private async loginOrRegisterProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error('Invalid provider token');
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider
    );
    if (user) {
      return { user, created: false };
    }

    if (!(await this.canRegister(provider))) {
      throw new Error('Registration is disabled');
    }

    // Federated identities are not all addresses. Telegram and Farcaster hand
    // back `telegram_<sub>` and `farcaster_<fid>`, and the checkbox that hides
    // itself for them lives in the browser, where a direct request never goes.
    const newsletterConsent = resolveNewsletterConsent({
      requested: body.subscribeToNewsletter,
      provider,
      email: providerUser.email,
    });

    const create = await this._organizationService.createOrgAndUser(
      {
        company: body.company,
        workspaceName: body.workspaceName,
        email: providerUser.email,
        password: '',
        provider,
        providerId: providerUser.id,
        newsletterConsent,
        language: body.language,
      },
      ip,
      userAgent
    );

    await this.recordRegistrationCompleted(create.id);

    await this.subscribeNewAccount(
      newsletterConsent,
      create.users[0].user.id,
      create.users[0].user.newsletterDeliveryPendingAt
    );

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, create.id);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return { user: create.users[0].user, created: true };
  }

  private async recordRegistrationCompleted(organizationId: string) {
    try {
      await this._publicGrowthService?.recordTrusted(
        'registration_completed',
        `registration_completed:${organizationId}`
      );
    } catch (error) {
      // The account transaction is already committed. Analytics must remain
      // best-effort and its own deduplication makes a later retry safe.
      console.error(
        'Failed to record registration_completed after account creation',
        error
      );
    }
  }

  /**
   * The reset link goes to the address the account already owns, and only to an
   * account that can sign in with a password at all.
   *
   * Both halves are load-bearing. Sending to the address typed into the form
   * means anyone who can get a foreign address attached to their own account
   * has the owner of that address handed a working reset link into *their*
   * account — the recipient sets a password, works there, and never learns it
   * is not their account. Skipping the password-method check offers that link
   * for accounts that have no password login to reset.
   */
  async forgot(email: string) {
    const user = await this._userService.getUserByEmail(email);
    if (!user) {
      return false;
    }

    if (!(await this._userService.hasLocalSignIn(user.id))) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
    });

    const resetLocale = resolveBackendLocale(user.language);
    await this._notificationService.sendEmail(
      user.email,
      translateBackendString('email_reset_password_subject', resetLocale),
      translateBackendString('email_reset_password_body', resetLocale, {
        link: `${process.env.FRONTEND_URL}/auth/forgot/${resetValues}`,
      }),
      undefined,
      resetLocale
    );
  }

  forgotReturn(body: ForgotReturnPasswordDto) {
    const user = AuthChecker.verifyJWT(body.token) as {
      id: string;
      expires: string;
    };
    if (dayjs(user.expires).isBefore(dayjs())) {
      return false;
    }

    return this._userService.updatePassword(user.id, body.password);
  }

  async activate(code: string) {
    // Approval mode has exactly one way in, and it goes through a person.
    if (registrationRequiresApproval()) {
      return false;
    }

    const user = AuthChecker.verifyJWT(code) as {
      id: string;
      activated: boolean;
      email: string;
    };
    if (user.id && !user.activated) {
      const getUserAgain = await this._userService.getUserByEmail(user.email);
      if (getUserAgain.activated) {
        return false;
      }
      await this._userService.activateUser(user.id);
      user.activated = true;
      return this.jwt(user as any);
    }

    return false;
  }

  async resendActivationEmail(email: string) {
    if (registrationRequiresApproval()) {
      throw new Error('Activation is handled by an administrator');
    }

    const user = await this._userService.getUserByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.activated) {
      throw new Error('Account is already activated');
    }

    const jwt = await this.jwt(user);
    const resendLocale = resolveBackendLocale(user.language);

    await this._emailService.sendEmail(
      user.email,
      translateBackendString('email_activate_account_subject', resendLocale),
      translateBackendString('email_activate_account_body', resendLocale, {
        link: `${process.env.FRONTEND_URL}/auth/activate/${jwt}`,
      }),
      'top',
      undefined,
      resendLocale
    );

    return true;
  }

  oauthLink(provider: string, query?: any) {
    const providerInstance = this._providerManager.getProvider(provider);
    return providerInstance.generateLink(query);
  }

  async linkIdentity(
    userId: string,
    body: LinkUserIdentityDto,
    callback?: AuthCallbackContext
  ) {
    if (body.provider === Provider.LOCAL) {
      return this.startLocalIdentityConfirmation(userId, body);
    }

    if (!LINKABLE_EXTERNAL_PROVIDERS.has(body.provider)) {
      throw new HttpException(
        {
          message: 'This provider cannot be linked',
          code: 'unsupported_sign_in_provider',
        },
        400
      );
    }

    if (!body.code) {
      throw new Error('Provider code is required');
    }
    const providerInstance = this._providerManager.getProvider(body.provider);
    const token = await providerInstance.getToken(
      body.code,
      body.redirectUri,
      callback
    );
    const verifiedUser = await providerInstance.getUser(token);
    if (!verifiedUser) {
      throw new Error('Invalid provider identity');
    }

    // Only the provider's stable subject identifies the identity. Its email is
    // display/contact data and never chooses which local account receives it.
    return this._userService.linkIdentity(
      userId,
      body.provider,
      verifiedUser.id
    );
  }

  /**
   * Adding a password login writes nothing yet.
   *
   * Registration proves the address before the account is usable; adding the
   * same kind of login later has to prove it too, or an account can claim any
   * address it can spell — blocking that person's registration, and standing
   * between them and their own password reset. So the claim waits in Redis for
   * twenty minutes, holding the already-hashed password, and the address itself
   * decides whether it is ever spent.
   */
  private async startLocalIdentityConfirmation(
    userId: string,
    body: LinkUserIdentityDto
  ) {
    if (!body.email || !body.password) {
      throw new HttpException(
        {
          message: 'Email and password are required for LOCAL identity',
          code: 'identity_email_required',
        },
        400
      );
    }

    if (this.plusAddressingBlocked(body.email)) {
      throw new HttpException(
        {
          message: 'Email with plus sign is not allowed',
          code: 'email_plus_not_allowed',
        },
        400
      );
    }

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      throw new HttpException(
        {
          message:
            'Email confirmation is unavailable: FRONTEND_URL is not configured',
          code: 'identity_confirmation_unavailable',
        },
        500
      );
    }

    const providerIdentifier =
      await this._userService.assertLocalIdentityClaimable(userId, body.email);

    const token = await issueIdentityConfirmation({
      userId,
      providerIdentifier,
      passwordHash: AuthChecker.hashPassword(body.password),
    });
    const minutes = Math.round(IDENTITY_CONFIRMATION_TTL_SECONDS / 60);

    // The new address has no account of its own yet — it is what is being
    // confirmed — so there is no language to read from it. The signed-in
    // account making the request is the only party with one.
    const requester = await this._userService.getUserById(userId);
    const confirmationLocale = resolveBackendLocale(requester?.language);

    await this._emailService.sendEmail(
      providerIdentifier,
      translateBackendString(
        'email_confirm_identity_subject',
        confirmationLocale
      ),
      translateBackendString('email_confirm_identity_body', confirmationLocale, {
        link: `${frontendUrl}/settings?identity_confirmation=${token}`,
        minutes,
      }),
      'top',
      undefined,
      confirmationLocale
    );

    return {
      status: 'confirmation_sent',
      email: providerIdentifier,
      expiresInMinutes: minutes,
    };
  }

  /**
   * Spends a confirmation. The signed-in account must be the one that asked:
   * the token proves someone reads the mailbox, the session proves who is
   * adding it, and neither alone is enough. A link opened by the wrong account
   * is refused without being spent, so the right account can still use it.
   */
  async confirmIdentityLink(userId: string, token: string) {
    const pending = await readIdentityConfirmation(token);
    if (!pending) {
      throw new HttpException(
        {
          message: 'This confirmation link is invalid, expired or already used',
          code: 'identity_confirmation_expired',
        },
        400
      );
    }

    if (pending.userId !== userId) {
      throw new HttpException(
        {
          message: 'This confirmation link belongs to a different account',
          code: 'identity_confirmation_wrong_account',
        },
        403
      );
    }

    const identity = await this._userService.linkIdentity(
      userId,
      Provider.LOCAL,
      pending.providerIdentifier,
      pending.passwordHash
    );
    await discardIdentityConfirmation(token);
    return identity;
  }

  private plusAddressingBlocked(email: string) {
    return Boolean(process.env.DISALLOW_PLUS) && email.includes('+');
  }

  async checkExists(
    provider: string,
    code: string,
    redirectUri?: string,
    callback?: AuthCallbackContext
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const token = await providerInstance.getToken(code, redirectUri, callback);
    const user = await providerInstance.getUser(token);
    if (!user) {
      throw new Error('Invalid user');
    }
    const checkExists = await this._userService.getUserByProvider(
      user.id,
      provider as Provider
    );
    if (checkExists) {
      // This is the second door into a federated session, and it used to hand
      // out the cookie without asking whether the account was switched on.
      // Every API call would then be refused by the middleware, leaving the
      // browser logged in to nothing.
      if (!checkExists.activated) {
        return { awaitingApproval: true };
      }

      return { jwt: await this.jwt(checkExists) };
    }

    return { token };
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }

  private async subscribeNewAccount(
    consent: boolean,
    userId: string,
    pendingAt?: Date | null
  ) {
    if (!consent) {
      return;
    }

    try {
      if (!pendingAt) {
        throw new Error('Newsletter pending delivery state is unavailable');
      }
      await this._newsletterRetry.schedule(userId, pendingAt);
    } catch {
      // The pending row is durable. Registration succeeds, and the bounded
      // reconciler will claim this transition after Temporal recovers.
      console.error(
        'Newsletter retry scheduling failed after account creation.',
        `user=${userId}`
      );
    }
  }
}
