import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { OnboardingRepository } from '@contentfactory/nestjs-libraries/database/prisma/onboarding/onboarding.repository';

/**
 * `content-factory-next-rrs9`: the one question the walkthrough asks.
 *
 * Everything it answers is a count of the workspace's own rows, and the
 * walkthrough only ever shows it back to the person who owns them — so it sits
 * behind the ordinary organization guard like the rest of the section and
 * takes no policy of its own. There is nothing here an admin may see and a
 * member may not.
 *
 * `founder` (2q28.12) says whether the person asking made this workspace. The
 * landing after sign-in sends a founder to «С чего начать» while the path is
 * open; someone invited into a working space lands where they always did.
 * An older client ignores the field.
 */
@ApiTags('Onboarding')
@Controller('/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingRepository) {}

  @Get('/progress')
  async progress(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    const [progress, founderId] = await Promise.all([
      this.onboarding.progress(organization.id),
      this.onboarding.founderId(organization.id),
    ]);
    return { ...progress, founder: !!user?.id && founderId === user.id };
  }
}
