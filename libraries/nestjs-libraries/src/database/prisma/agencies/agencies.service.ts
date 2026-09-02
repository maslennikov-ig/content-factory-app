import { Injectable } from '@nestjs/common';
import { AgenciesRepository } from '@contentfactory/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { User } from '@prisma/client';
import { CreateAgencyDto } from '@contentfactory/nestjs-libraries/dtos/agencies/create.agency.dto';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  BackendLocale,
  resolveBackendLocale,
  translateBackendString,
  translateBackendText,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  emailAction,
  emailActionBody,
  emailDirection,
  emailLabel,
  emailQuietAction,
  emailRichParagraph,
  emailValue,
} from '@contentfactory/nestjs-libraries/emails/email.template';

@Injectable()
export class AgenciesService {
  constructor(
    private _agenciesRepository: AgenciesRepository,
    private _notificationService: NotificationService
  ) {}
  getAgencyByUser(user: User) {
    return this._agenciesRepository.getAgencyByUser(user);
  }

  getCount() {
    return this._agenciesRepository.getCount();
  }

  getAllAgencies() {
    return this._agenciesRepository.getAllAgencies();
  }

  getAllAgenciesSlug() {
    return this._agenciesRepository.getAllAgenciesSlug();
  }

  getAgencyInformation(agency: string) {
    return this._agenciesRepository.getAgencyInformation(agency);
  }

  async approveOrDecline(email: string, action: string, id: string) {
    await this._agenciesRepository.approveOrDecline(action, id);
    const agency = await this._agenciesRepository.getAgencyById(id);

    // Both of these used to carry their own `<html><head>` inside the shared
    // wrapper — a document nested in a document — and were written in English
    // whatever language the account is in. The wrapper is the only document
    // now, and the words come from the catalog like every other product email.
    const locale = resolveBackendLocale(agency?.user?.language);
    const dir = emailDirection(locale);
    const agencyName = agency?.name ?? '';

    if (action === 'approve') {
      await this._notificationService.sendEmail(
        agency?.user?.email!,
        translateBackendText('email_agency_approved_subject', locale, {
          agency: agencyName,
        }),
        emailActionBody({
          intro: translateBackendString('email_agency_approved_intro', locale, {
            agency: agencyName,
          }),
          label: translateBackendString('email_agency_approved_action', locale),
          url: `${process.env.FRONTEND_URL}/agencies/${agency?.slug}`,
          fallbackHint: translateBackendString(
            'email_action_fallback_hint',
            locale
          ),
          dir,
        }),
        undefined,
        locale
      );

      return;
    }

    await this._notificationService.sendEmail(
      agency?.user?.email!,
      translateBackendText('email_agency_declined_subject', locale, {
        agency: agencyName,
      }),
      emailRichParagraph(
        translateBackendString('email_agency_declined_intro', locale, {
          agency: agencyName,
        }),
        dir
      ),
      undefined,
      locale
    );

    return;
  }

  async createAgency(user: User, body: CreateAgencyDto) {
    const agency = await this._agenciesRepository.createAgency(user, body);

    // This one goes to whoever reviews agency submissions, not to a customer,
    // so there is no account language to read — the reviewer is reached at
    // AGENCY_REVIEW_EMAIL. English, through the catalog like everything else,
    // so the day this address belongs to someone who reads Russian it is a
    // one-line change rather than a rewrite.
    const locale: BackendLocale = 'en';
    const label = (key: Parameters<typeof translateBackendString>[0]) =>
      emailLabel(translateBackendString(key, locale), 'ltr');

    const socials = [
      body.facebook,
      body.instagram,
      body.twitter,
      body.linkedIn,
      body.youtube,
      body.tiktok,
    ].filter((link): link is string => !!link);

    await this._notificationService.sendEmail(
      process.env.AGENCY_REVIEW_EMAIL || process.env.EMAIL_FROM_ADDRESS || '',
      translateBackendText('email_agency_review_subject', locale),
      emailRichParagraph(
        translateBackendString('email_agency_review_intro', locale, {
          agency: body.name,
        }),
        'ltr'
      ) +
        label('email_agency_review_field_website') +
        emailValue(body.website, 'ltr') +
        label('email_agency_review_field_social') +
        socials.map((link) => emailValue(link, 'ltr')).join('') +
        // The logo used to be an <img> pulling from the media host. An email
        // that loads an external image is one more reason for a spam filter to
        // hold it, and it shows nothing at all to a reader with images off —
        // the address, which is what a reviewer follows anyway, always shows.
        label('email_agency_review_field_logo') +
        emailValue(body.logo.path, 'ltr') +
        label('email_agency_review_field_short_description') +
        emailValue(body.shortDescription, 'ltr') +
        label('email_agency_review_field_description') +
        emailValue(body.description, 'ltr') +
        label('email_agency_review_field_niches') +
        emailValue(body.niches.join(', '), 'ltr') +
        emailAction({
          label: translateBackendString(
            'email_agency_review_action_approve',
            locale
          ),
          url: `${process.env.FRONTEND_URL}/agencies/action/approve/${agency.id}`,
          fallbackHint: translateBackendString(
            'email_action_fallback_hint',
            locale
          ),
          dir: 'ltr',
        }) +
        emailQuietAction({
          label: translateBackendString(
            'email_agency_review_action_decline',
            locale
          ),
          url: `${process.env.FRONTEND_URL}/agencies/action/decline/${agency.id}`,
          dir: 'ltr',
        }),
      undefined,
      locale
    );
    return agency;
  }
}
