import {
  createLegalDocumentResponse,
  listLegalDocumentsResponse,
} from '../../../../src/http/legal-documents';

export const GET = listLegalDocumentsResponse;
export const POST = createLegalDocumentResponse;
