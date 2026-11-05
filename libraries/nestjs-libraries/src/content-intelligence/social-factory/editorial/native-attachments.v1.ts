import type { EditorialMaterialV1 } from '../contracts/social-factory.v1';
/** Covers/caption sidecars remain part of the editable material, not additional video attachments. */
export function nativeAttachmentAssetsV1(material: EditorialMaterialV1) {
 const video=['reel','short','long_video'].includes(material.format);
 return material.assets.filter(asset=>video ? asset.kind==='video' && asset.role==='final' : ['image','video'].includes(asset.kind));
}
