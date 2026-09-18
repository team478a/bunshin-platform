import { stripeProgramWebhookResponse } from '../../../../../../src/http/program-checkout';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ configurationId: string }> };

export async function POST(request: Request, context: Context) {
  const { configurationId } = await context.params;
  return stripeProgramWebhookResponse(request, configurationId);
}
