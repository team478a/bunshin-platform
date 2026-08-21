import { publishLegalDocumentResponse } from '../../../../../../src/http/legal-documents';

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return publishLegalDocumentResponse(request, (await context.params).documentId);
}
