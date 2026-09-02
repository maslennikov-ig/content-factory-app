import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { OnboardingRepository } from '@contentfactory/nestjs-libraries/database/prisma/onboarding/onboarding.repository';

/**
 * `content-factory-next-rrs9`: the one question the walkthrough asks.
 *
 * Everything it answers is a count of the workspace's own rows, and the
 * walkthrough only ever shows it back to the person who owns them — so it sits
 * behind the ordinary organization guard like the rest of the section and
 * takes no policy of its own. There is nothing here an admin may see and a
 * member may not.
 */
@ApiTags('Onboarding')
@Controller('/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingRepository) {}

  @Get('/progress')
  async progress(@GetOrgFromRequest() organization: Organization) {
    return this.onboarding.progress(organization.id);
  }
}
