import Compressor from '@uppy/compressor';
import { isGifFile } from './library-image-compression';

/**
 * The media library's picture compressor (`@uppy/compressor`), GIFs left out.
 * The library uploader installs it; the agent chat calls its `compress`
 * through `compressLibraryImage` — one compressor for both (review W4-25 F6).
 */
export class CompressionWrapper<M = any, B = any> extends Compressor<any, any> {
  override async prepareUpload(fileIDs: string[]) {
    const { files } = this.uppy.getState();

    // 1) Skip GIFs (and anything missing)
    const filteredIDs = fileIDs.filter((id) => {
      const f = files[id];
      if (!f) return false;
      return !isGifFile({ type: f.type, name: f.name });
    });

    // 2) Let @uppy/compressor do its work (convert/resize/etc)
    return super.prepareUpload(filteredIDs);
  }
}
