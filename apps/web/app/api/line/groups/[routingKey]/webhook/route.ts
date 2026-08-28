import { handleGroupLineWebhook } from '../../../../../../src/line/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, context: { params: Promise<{ routingKey: string }> }) {
  return context.params.then(({ routingKey }) => handleGroupLineWebhook(request, routingKey));
}
