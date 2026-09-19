import { commercialBillingWebhookResponse } from '../../../../../../src/http/commercial-billing-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return commercialBillingWebhookResponse(request);
}
