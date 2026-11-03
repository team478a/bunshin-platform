import { approveSocialPublication } from '../../../../../../../src/http/social-publications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return approveSocialPublication(request, value.serviceSlug, value.bunshinId);
}
