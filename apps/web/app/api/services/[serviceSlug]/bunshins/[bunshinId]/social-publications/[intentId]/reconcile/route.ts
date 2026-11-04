import { reconcileSocialPublication } from '../../../../../../../../../src/http/social-publications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; intentId: string }>;
};

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return reconcileSocialPublication(request, value.serviceSlug, value.bunshinId, value.intentId);
}
