import { newsletterProviders } from '@contentfactory/nestjs-libraries/newsletter/providers';
import { NewsletterConsent } from '@contentfactory/nestjs-libraries/newsletter/newsletter.interface';

export class NewsletterService {
  static getProvider() {
    const listmonkConfiguration = [
      'LISTMONK_DOMAIN',
      'LISTMONK_USER',
      'LISTMONK_API_KEY',
      'LISTMONK_LIST_ID',
      'LISTMONK_LIST_UUID',
    ];
    if (listmonkConfiguration.some((name) => process.env[name])) {
      return newsletterProviders.find((p) => p.name === 'listmonk')!;
    }

    return newsletterProviders.find((p) => p.name === 'empty')!;
  }
  static async register(email: string, consent?: NewsletterConsent) {
    if (email.indexOf('@') === -1) {
      return;
    }
    return NewsletterService.getProvider().register(email, consent);
  }
}
