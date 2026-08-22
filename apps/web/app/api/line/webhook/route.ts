import { handleLineWebhook } from '../../../../src/line/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleLineWebhook(request);
}
