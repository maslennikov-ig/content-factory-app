import { Inject, Injectable } from '@nestjs/common';
import { ContentContextBuilderV1 } from './content-context.builder';
import type { ContentContextBuildInputV1 } from './content-context.types';

@Injectable()
export class ContentContextService {
  constructor(
    @Inject(ContentContextBuilderV1)
    private readonly builder: ContentContextBuilderV1
  ) {}

  build(
    organizationId: string,
    input: Omit<ContentContextBuildInputV1, 'asOf'>
  ) {
    return this.builder.build(organizationId, {
      ...input,
      asOf: new Date().toISOString(),
    });
  }

  get(organizationId: string, id: string) {
    return this.builder.get(organizationId, id);
  }
}
