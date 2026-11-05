import type { CampaignItemV1, SocialFactoryStoreV1 } from '../contracts/social-factory.v1';
import { approvalDigest, digest, identity } from '../campaign/domain';

export interface PublicationDeclarationV1 { readonly id: string; readonly version: string; readonly url: string }
export interface PublicationConsentV1 {
 type: 'publication_consent'; version: 1; id: string; organizationId: string; actorId: string;
 campaignId: string; itemId: string; requestId: string; deliveryAction: 'schedule' | 'publish'; contentRevision: number; contentDigest: string;
 declarations: readonly PublicationDeclarationV1[]; declarationsDigest: string; approvedAt: string;
}
export const isPublicationConsentIdV1 = (id?: string) => !!id?.startsWith('publication_consent_');
export function publicationConsentIdV1(value: Omit<PublicationConsentV1, 'id' | 'type' | 'version' | 'approvedAt'>) {
 return identity('publication_consent', value.organizationId, value.actorId, value.campaignId, value.itemId,
  value.requestId, value.deliveryAction, String(value.contentRevision), value.contentDigest, value.declarationsDigest);
}
/** Existing action-store receipt, never a user/model assertion or a reusable campaign grant. */
export async function readPublicationConsentV1(store: SocialFactoryStoreV1, org: string, item: CampaignItemV1,
 input: { requiredConsentId?: string; actorId?: string; requestId: string; action: string; alsoRequire?: readonly string[] }, declarations?: readonly PublicationDeclarationV1[]) {
 if (!isPublicationConsentIdV1(input.requiredConsentId)) return null;
 const record = await store.read<PublicationConsentV1>(org, 'action', input.requiredConsentId!);
 const value = record?.payload;
 if (record?.deletedAt || record?.invalidatedAt || !value || value.type !== 'publication_consent' || value.version !== 1 || value.id !== input.requiredConsentId ||
  value.organizationId !== org || value.actorId !== input.actorId || value.campaignId !== item.campaignId || value.itemId !== item.id ||
  value.requestId !== input.requestId || value.deliveryAction !== (input.action === 'schedule' || input.alsoRequire?.includes('schedule') ? 'schedule' : 'publish') || value.contentRevision !== item.contentRevision || value.contentDigest !== approvalDigest(item) ||
  !Array.isArray(value.declarations) || !value.declarations.length || value.declarationsDigest !== digest(value.declarations) ||
  value.id !== publicationConsentIdV1(value) || declarations && value.declarationsDigest !== digest(declarations)) return null;
 return value;
}
