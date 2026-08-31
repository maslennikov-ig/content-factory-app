import { NewsletterInterface } from '@contentfactory/nestjs-libraries/newsletter/newsletter.interface';

export class EmailEmptyProvider implements NewsletterInterface {
  name = 'empty';
  async register(email: string) {
    // The address itself stays out of the log. This branch runs on every
    // registration of an instance without a newsletter provider, which is the
    // default, so printing it would write every user's email into the
    // container log for no one's benefit.
    console.log(
      'Newsletter provider is not configured; registration was not forwarded.'
    );
  }
}
