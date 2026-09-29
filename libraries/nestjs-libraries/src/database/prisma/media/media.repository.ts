import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@contentfactory/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media'>) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
      },
    });
  }

  /**
   * The organisation is a filter, not decoration. A post's image list is
   * whatever the person submitting it sent, so an id in there can name another
   * workspace's file — and this resolves an id into a storage path. Found
   * 03.09.2026 by `tests/tenant-isolation.guard.test.cjs`; `deleteMedia`, just
   * below, had always filtered.
   */
  getMediaById(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
      },
    });
  }

  /**
   * Live items of the workspace among `ids` — the chat door checks a media
   * receipt with it (`content-factory-next-kcxz.25`): an id of another
   * workspace, or one deleted, is simply not in the answer. The door builds
   * the receipt the model reads from these rows (review W4-25 F3): the stored
   * name and path say what the file really is.
   */
  getLiveMediaByIds(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: {
        id: { in: ids },
        organizationId: org,
        deletedAt: null,
      },
      select: { id: true, name: true, originalName: true, path: true },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, search?: string) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
    const query = {
      where: {
        organization: {
          id: org,
        },
        deletedAt: null as null,
        ...searchFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        ...searchFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}
