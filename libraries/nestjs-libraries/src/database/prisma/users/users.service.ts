import { HttpException, Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from '@contentfactory/nestjs-libraries/database/prisma/users/users.repository';
import { Provider } from '@prisma/client';
import { UserDetailDto } from '@contentfactory/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto';
import { OrganizationRepository } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  BACKEND_LOCALES,
  resolveBackendLocale,
  translateBackendString,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  ADMIN_BIND_CLAIM_WINDOW_MS,
  generateAdminBindCode,
} from '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind';

@Injectable()
export class UsersService {
  constructor(
    private _usersRepository: UsersRepository,
    private _organizationRepository: OrganizationRepository,
    private _notificationService: NotificationService
  ) {}

  private readonly _logger = new Logger(UsersService.name);

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserById(id: string) {
    return this._usersRepository.getUserById(id);
  }

  listPendingNewsletterDeliveries(limit: number, now: Date) {
    return this._usersRepository.listPendingNewsletterDeliveries(limit, now);
  }

  claimNewsletterDelivery(
    userId: string,
    pendingAt: Date,
    leaseId: string,
    leaseExpiresAt: Date,
    now: Date
  ) {
    return this._usersRepository.claimNewsletterDelivery(
      userId,
      pendingAt,
      leaseId,
      leaseExpiresAt,
      now
    );
  }

  markNewsletterDelivered(userId: string, pendingAt: Date, leaseId: string) {
    return this._usersRepository.markNewsletterDelivered(
      userId,
      pendingAt,
      leaseId
    );
  }

  clearNewsletterDeliveryPending(
    userId: string,
    pendingAt: Date,
    leaseId: string
  ) {
    return this._usersRepository.clearNewsletterDeliveryPending(
      userId,
      pendingAt,
      leaseId
    );
  }

  releaseNewsletterDeliveryLease(
    userId: string,
    pendingAt: Date,
    leaseId: string
  ) {
    return this._usersRepository.releaseNewsletterDeliveryLease(
      userId,
      pendingAt,
      leaseId
    );
  }

  getUserWithActiveSubscriptionByEmail(email: string, excludeUserId: string) {
    return this._usersRepository.getUserWithActiveSubscriptionByEmail(
      email,
      excludeUserId
    );
  }

  getImpersonateUser(name: string) {
    return this._organizationRepository.getImpersonateUser(name);
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._usersRepository.getUserByProvider(providerId, provider);
  }

  listIdentities(userId: string) {
    return this._usersRepository.listIdentities(userId);
  }

  linkIdentity(
    userId: string,
    provider: Provider,
    providerIdentifier: string,
    passwordHash?: string
  ) {
    return this._usersRepository.linkIdentity(
      userId,
      provider,
      providerIdentifier,
      passwordHash
    );
  }

  assertLocalIdentityClaimable(userId: string, providerIdentifier: string) {
    return this._usersRepository.assertLocalIdentityClaimable(
      userId,
      providerIdentifier
    );
  }

  hasLocalSignIn(userId: string) {
    return this._usersRepository.hasLocalSignIn(userId);
  }

  unlinkIdentity(
    userId: string,
    provider: Provider,
    providerIdentifier: string
  ) {
    return this._usersRepository.unlinkIdentity(
      userId,
      provider,
      providerIdentifier
    );
  }

  async switchUser(
    currentUserId: string,
    targetUserId: string,
    adminId: string
  ) {
    const { kept, switched } =
      await this._usersRepository.switchUserCredentials(
        currentUserId,
        targetUserId
      );

    this._logger.log(
      `User login switch performed by admin ${adminId}: account ${
        kept.id
      } login ${switched.email} -> ${kept.email}; account ${
        switched.id
      } login ${kept.email} -> ${switched.email}`
    );

    // the swap is already committed; a notification failure must not fail it
    if (this._notificationService.hasEmailProvider()) {
      await Promise.all(
        [kept, switched].map((account) => {
          const locale = resolveBackendLocale(account.language);
          return this._notificationService
            .sendEmail(
              account.email,
              translateBackendString('email_login_changed_subject', locale),
              translateBackendString('email_login_changed_body', locale, {
                email: account.email,
              }),
              undefined,
              locale
            )
            .catch((err) =>
              this._logger.error(`Failed to notify ${account.email}`, err)
            );
        })
      );
    }

    return { kept, switched };
  }

  activateUser(id: string) {
    return this._usersRepository.activateUser(id);
  }

  /**
   * Issues a fresh one-time code for the given, already-authenticated
   * administrator to prove ownership of a Telegram chat by sending
   * `/start <code>` there. Requesting again before the previous code expired
   * discards it — only the newest code an administrator asked for is ever
   * live, so an old link copied somewhere and forgotten cannot bind a chat
   * later.
   */
  async issueTelegramBindingCode(userId: string) {
    const code = generateAdminBindCode();
    const expiresAt = new Date(Date.now() + ADMIN_BIND_CLAIM_WINDOW_MS);
    await this._usersRepository.setTelegramBindingCode(
      userId,
      code,
      expiresAt
    );
    return { code, expiresAt: expiresAt.toISOString() };
  }

  async getTelegramBindingStatus(userId: string) {
    const user = await this._usersRepository.getTelegramBindingStatus(userId);
    return { connected: Boolean(user?.telegramChatId) };
  }

  async listAccounts(params: {
    status: 'pending' | 'active' | 'all';
    search?: string;
    page: number;
    limit: number;
  }) {
    const take = Math.min(Math.max(params.limit, 1), 100);
    const [users, pending, total] = await Promise.all([
      this._usersRepository.listAccounts({
        status: params.status,
        search: params.search,
        take,
        skip: Math.max(params.page, 0) * take,
      }),
      this._usersRepository.countAccounts('pending'),
      this._usersRepository.countAccounts('all'),
    ]);

    return { users, pending, total };
  }

  /**
   * `adminId` is who pressed the button. Optional only because a caller
   * without one should still be able to approve rather than fail; the line it
   * writes then says the author is unknown, which is the truth
   * (`content-factory-next-fn33.106`).
   */
  async approveAccount(id: string, adminId?: string) {
    const user = await this._usersRepository.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    // Approval is an answer to a registration nobody has looked at yet.
    // A blocked account is a decision already made, and lifting it is the
    // other door — with its own name, so that nobody switches a blocked
    // person back on believing they are letting a newcomer in
    // (`content-factory-next-fn33.66`).
    if (user.blockedAt) {
      throw new HttpException(
        'This account is blocked, not waiting for approval',
        400
      );
    }

    this._logger.log(`Account ${id} approved by ${adminId ?? 'unknown'}`);
    const approved = await this._usersRepository.activateUser(id);
    const locale = resolveBackendLocale(user.language);

    // Activating the account has already succeeded. A failure to enqueue the
    // notification must not make an administrator retry an approval that is
    // already durable.
    try {
      await this._notificationService.sendEmail(
        user.email,
        translateBackendString('email_account_approved_subject', locale),
        translateBackendString('email_account_approved_body', locale, {
          link: `${process.env.FRONTEND_URL}/auth`,
        }),
        undefined,
        locale
      );
    } catch (err) {
      this._logger.error(
        `Approved account ${id}, but its sign-in email could not be queued`,
        err
      );
    }

    return approved;
  }

  /**
   * A rejection now says so to the person waiting (`content-factory-next-fn33.30`).
   * Silence was the old default, and it left someone who registered waiting for
   * an answer that was never coming. The letter is deliberately bare: no reason,
   * no link, nothing to reply to — an instance administrator declines an account
   * for reasons that are theirs, and a link would only invite the same
   * registration back.
   *
   * The address and the language are read before the delete, because after it
   * there is no row to read them from. The letter is queued after the delete and
   * its failure is logged, not raised: the account is already gone, and an
   * administrator must not retry a removal that already happened.
   */
  async rejectPendingAccount(id: string, adminId: string) {
    const user = await this._usersRepository.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    const { email, language } = user;
    const rejected = await this._usersRepository.rejectPendingAccount(id);
    this._logger.log(`Account ${id} rejected by ${adminId}`);

    const locale = resolveBackendLocale(language);
    try {
      await this._notificationService.sendEmail(
        email,
        translateBackendString('email_account_rejected_subject', locale),
        translateBackendString('email_account_rejected_body', locale),
        undefined,
        locale
      );
    } catch (err) {
      this._logger.error(
        `Rejected account ${id}, but its notice could not be queued`,
        err
      );
    }

    return rejected;
  }

  /**
   * Deleting an account for good, which the two older actions do not do:
   * rejection only reaches an account that has never signed in, and blocking
   * leaves the row in place forever. Refused for the instance administrator and
   * for the administrator's own account, for the same reason blocking is: both
   * are ways to lose every administrator at once, and recovering needs database
   * access.
   */
  async deleteAccount(id: string, adminId: string, deleteWorkspaces = false) {
    const user = await this._usersRepository.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    if (id === adminId) {
      throw new HttpException('You cannot delete your own account', 400);
    }

    if (user.isSuperAdmin) {
      throw new HttpException('An administrator account cannot be deleted', 400);
    }

    const deleted = await this._usersRepository.deleteAccount(
      id,
      deleteWorkspaces
    );
    // The log says which of the two presses it was: «deleted» and «deleted
    // with its workspaces» are different amounts of data gone, and afterwards
    // nothing else records which one happened.
    this._logger.log(
      deleteWorkspaces
        ? `Account ${id} deleted with its workspaces by ${adminId}`
        : `Account ${id} deleted by ${adminId}`
    );
    return deleted;
  }

  /**
   * Switching an account off takes effect on the next request: the auth
   * middleware re-reads the user from the database instead of trusting the
   * token, so an existing session dies with it.
   */
  async blockAccount(id: string, adminId: string) {
    const user = await this._usersRepository.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    // Two ways to lose every administrator at once, both refused here rather
    // than left to whoever clicks: blocking yourself, and blocking the other
    // administrator. Recovering from either needs database access.
    if (id === adminId) {
      throw new HttpException('You cannot block your own account', 400);
    }

    if (user.isSuperAdmin) {
      throw new HttpException('An administrator account cannot be blocked', 400);
    }

    this._logger.log(`Account ${id} blocked by ${adminId}`);
    return this._usersRepository.deactivateUser(id);
  }

  /**
   * Lifting a block. The mirror of `blockAccount`, and deliberately not the
   * approval door: approval writes a «your account is ready» letter to somebody
   * who has never signed in, which is the wrong thing to say to a person whose
   * access was taken away and given back.
   *
   * `content-factory-next-fn33.66`.
   */
  async unblockAccount(id: string, adminId: string) {
    const user = await this._usersRepository.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    if (!user.blockedAt) {
      throw new HttpException('This account is not blocked', 400);
    }

    this._logger.log(`Account ${id} unblocked by ${adminId}`);
    return this._usersRepository.activateUser(id);
  }

  updatePassword(id: string, password: string) {
    return this._usersRepository.updatePassword(id, password);
  }

  getPersonal(userId: string) {
    return this._usersRepository.getPersonal(userId);
  }

  changePersonal(userId: string, body: UserDetailDto) {
    return this._usersRepository.changePersonal(userId, body);
  }

  /**
   * `content-factory-next-fn33.53`. The chosen language belongs to the account,
   * not to one browser: it decides the language of every letter the server
   * sends, and it is what a second device has to read to come up in the right
   * language.
   *
   * The list is checked here as well as in the DTO. `resolveBackendLocale`
   * silently answers English for anything it does not know — right for reading
   * a stored value, wrong for a write, because it would store the unknown id
   * and quietly keep sending English. A language we cannot write letters in is
   * refused instead.
   */
  async changeLanguage(userId: string, language: string) {
    if (!(BACKEND_LOCALES as readonly string[]).includes(language)) {
      throw new HttpException('Unsupported language', 400);
    }

    return this._usersRepository.changeLanguage(userId, language);
  }

  getEmailNotifications(userId: string) {
    return this._usersRepository.getEmailNotifications(userId);
  }

  updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    return this._usersRepository.updateEmailNotifications(userId, body);
  }
}
