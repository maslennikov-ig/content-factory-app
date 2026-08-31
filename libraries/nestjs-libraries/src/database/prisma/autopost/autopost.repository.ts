import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import {
  AutopostDraftV2Dto,
  AutopostDto,
} from '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto';

@Injectable()
export class AutopostRepository {
  constructor(private _autoPost: PrismaRepository<'autoPost'>) {}

  getTotal(orgId: string) {
    return this._autoPost.model.autoPost.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  getAutoposts(orgId: string) {
    return this._autoPost.model.autoPost.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  deleteAutopost(orgId: string, id: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  getAutopost(id: string) {
    return this._autoPost.model.autoPost.findUnique({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  getAutopostDraftV2(orgId: string, id: string) {
    return this._autoPost.model.autoPost.findFirst({
      where: {
        organizationId: orgId,
        id,
        workflowVersion: 2,
        deletedAt: null,
      },
      include: {
        contentSource: {
          select: {
            id: true,
            organizationId: true,
            desiredState: true,
            currentSnapshotId: true,
            archivedAt: true,
            purgedAt: true,
          },
        },
      },
    });
  }

  async createAutopostDraftV2(
    client: any,
    orgId: string,
    body: AutopostDraftV2Dto
  ) {
    const source = await client.contentSource.findFirst({
      where: {
        organizationId: orgId,
        id: body.contentSourceId,
        desiredState: 'ACTIVE',
        archivedAt: null,
        purgedAt: null,
      },
      select: { id: true },
    });
    if (!source) {
      const error: any = new Error('Content source was not found');
      error.code = 'CONTENT_SOURCE_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    const id = uuidv5(
      `${orgId}:${body.contentSourceId}`,
      'a68cb197-830c-4a96-9380-50b7f0bc5577'
    );
    const create = {
      organizationId: orgId,
      url: body.url,
      title: body.title,
      integrations: JSON.stringify(body.integrations),
      active: body.active,
      content: body.content,
      generateContent: body.generateContent,
      researchEnabled: false,
      language: body.language,
      addPicture: body.addPicture,
      syncLast: body.syncLast,
      onSlot: body.onSlot,
      lastUrl: '',
      contentSourceId: body.contentSourceId,
      brandProfileVersionId: body.brandProfileVersionId,
      workflowVersion: 2,
      requiresAttention: false,
    };
    return client.autoPost.upsert({
      where: { organizationId_id: { organizationId: orgId, id } },
      create: { id, ...create },
      update: {
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        researchEnabled: false,
        language: body.language,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        contentSourceId: body.contentSourceId,
        brandProfileVersionId: body.brandProfileVersionId,
        workflowVersion: 2,
        requiresAttention: false,
        deletedAt: null,
      },
    });
  }

  markDraftV2RequiresAttention(orgId: string, id: string) {
    return this._autoPost.model.autoPost.updateMany({
      where: { organizationId: orgId, id, workflowVersion: 2 },
      data: { requiresAttention: true, active: false },
    });
  }

  updateUrl(id: string, url: string) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
      },
      data: {
        lastUrl: url,
      },
    });
  }

  changeActive(orgId: string, id: string, active: boolean) {
    return this._autoPost.model.autoPost.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        active,
      },
    });
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string) {
    const { id: newId, active } = await this._autoPost.model.autoPost.upsert({
      where: {
        id: id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        researchEnabled: body.researchEnabled ?? false,
        language: body.language,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        lastUrl: body.lastUrl,
      },
      update: {
        url: body.url,
        title: body.title,
        integrations: JSON.stringify(body.integrations),
        active: body.active,
        content: body.content,
        generateContent: body.generateContent,
        ...(body.researchEnabled === undefined
          ? {}
          : { researchEnabled: body.researchEnabled }),
        language: body.language,
        addPicture: body.addPicture,
        syncLast: body.syncLast,
        onSlot: body.onSlot,
        lastUrl: body.lastUrl,
      },
    });

    return { id: newId, active };
  }
}
