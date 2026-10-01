import { Injectable } from '@nestjs/common';
import { extractHeadingHtmlText } from '@contentfactory/helpers/utils/html.extraction';
import { fetchSafePublicHttpsUrl } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.fetch';

@Injectable()
export class ExtractContentService {
  async extractContent(url: string) {
    const load = await (await fetchSafePublicHttpsUrl(url)).text();
    return extractHeadingHtmlText(load);
  }
}
