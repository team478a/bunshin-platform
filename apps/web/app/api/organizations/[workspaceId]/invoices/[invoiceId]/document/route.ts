import { commercialInvoiceDocumentResponse } from '../../../../../../../src/http/commercial-invoice-document';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; invoiceId: string }> },
) {
  const { workspaceId, invoiceId } = await params;
  return commercialInvoiceDocumentResponse(request, workspaceId, invoiceId);
}
