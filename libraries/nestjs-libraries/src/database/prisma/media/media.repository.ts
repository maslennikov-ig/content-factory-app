import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@contentfactory/nestjs-libraries/dtos/media/save.media.information.dto';
import { serializableWithRetry } from '@contentfactory/nestjs-libraries/database/prisma/serializable.transaction';

@Injectable()
export class MediaRepository {
  constructor(private _media: PrismaRepository<'media' | '$transaction'>) {}

  /** A measured V2 local final is a video, including after a lost registration response. */
  saveLocalCompositionV2(org:string,name:string,path:string,originalName:string,bytes:number){
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>512*1024*1024)throw new Error('LOCAL_COMPOSITION_MEDIA_SIZE_INVALID');
    return serializableWithRetry(this._media.model,async tx=>{
      const existing=await tx.media.findFirst({where:{organizationId:org,name,path,deletedAt:null}});
      if(existing){if(existing.type!=='video'||existing.fileSize!==bytes)throw new Error('LOCAL_COMPOSITION_MEDIA_MISMATCH');return existing;}
      return tx.media.create({data:{organizationId:org,name,path,originalName,type:'video',fileSize:bytes}});
    },'Local video registration is busy. Please retry.');
  }

  /** A completed owned upload may be retried after the HTTP response is lost. */
  saveMultipartFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string
  ) {
    const select = {
      id: true,
      name: true,
      originalName: true,
      path: true,
      thumbnail: true,
      alt: true,
    } as const;
    return serializableWithRetry(
      this._media.model,
      async (tx) => {
        const existing = await tx.media.findFirst({
          where: {
            organizationId: org,
            name: fileName,
            path: filePath,
            deletedAt: null,
          },
          select,
        });
        if (existing) return existing;
        return tx.media.create({
          data: {
            organizationId: org,
            name: fileName,
            path: filePath,
            originalName: originalName || null,
          },
          select,
        });
      },
      'Upload registration is busy. Please retry.'
    );
  }

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

  /** Legacy/transloadit object names are public, but cannot mint another workspace's library ownership. */
  saveRegisteredObjectV1(org: string, fileName: string, filePath: string, originalName?: string) {
    return serializableWithRetry(this._media.model, async tx => {
      const existing = await tx.media.findMany({ where: { path: filePath } });
      if (existing.some(row => row.organizationId !== org || row.deletedAt)) {
        throw new ForbiddenException('This media object cannot be registered in this workspace');
      }
      if (existing.length) return existing[0];
      return tx.media.create({ data: { organizationId: org, name: fileName, path: filePath, originalName: originalName || null } });
    }, 'Media registration is busy. Please retry.');
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
        deletedAt: null,
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

  getLiveMediaByPath(org: string, path: string) {
    return this._media.model.media.findFirst({ where: { organizationId: org, path, deletedAt: null } });
  }

  /** Existence only, for legacy external-attachment labels; never exposes another tenant's data. */
  async hasMediaId(id: string) {
    return !!await this._media.model.media.findUnique({ where: { id }, select: { id: true } });
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
        deletedAt: null,
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
