import { commercialBillingRemindersResponse } from '../../../../../src/http/commercial-billing-reminders';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return commercialBillingRemindersResponse(request);
}
