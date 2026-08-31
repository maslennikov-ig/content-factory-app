import { EmailEmptyProvider } from '@contentfactory/nestjs-libraries/newsletter/providers/email-empty.provider';
import { ListmonkProvider } from '@contentfactory/nestjs-libraries/newsletter/providers/listmonk.provider';

export const newsletterProviders = [
  new ListmonkProvider(),
  new EmailEmptyProvider(),
];
