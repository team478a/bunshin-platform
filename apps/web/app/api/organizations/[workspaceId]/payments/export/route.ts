import { organizationPaymentExportResponse } from '../../../../../../src/http/organization-payment-export';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  return organizationPaymentExportResponse(request, (await context.params).workspaceId);
}
