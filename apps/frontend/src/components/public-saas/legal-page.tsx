import { resolveRequestLanguage } from '@contentfactory/react/translation/get.translation.service.backend';
import { LegalDocumentId } from './legal-content';
import { loadLegalDocument } from './legal-documents';
import { LegalDocumentView } from './legal-document';

/**
 * The body of every legal route.
 *
 * A server component, because the markdown is read from disk: the route files
 * only name their document, so how the visitor's language is resolved and how a
 * missing translation falls back is decided once. Language resolution is the
 * same `resolveRequestLanguage` the layout and every other server render use —
 * cookie first, then the tag the proxy negotiated from `Accept-Language`.
 */
export async function LegalPage({
  documentId,
}: {
  documentId: LegalDocumentId;
}) {
  const language = await resolveRequestLanguage();
  return (
    <LegalDocumentView
      documentId={documentId}
      content={loadLegalDocument(documentId, language)}
    />
  );
}
