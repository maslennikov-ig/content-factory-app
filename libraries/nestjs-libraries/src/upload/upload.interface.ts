import type { DiskUploadFileV1, DiskUploadResultV1 } from './disk.upload.v1';

export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  uploadFileFromDiskV1?(file: DiskUploadFileV1): Promise<DiskUploadResultV1>;
  removeFile(filePath: string): Promise<void>;
}
