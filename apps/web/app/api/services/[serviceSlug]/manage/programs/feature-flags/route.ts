import { programFeatureFlagsResponse } from '../../../../../../../src/http/program-feature-flags';

export const runtime = 'nodejs';
type Context = { params: Promise<{ serviceSlug: string }> };

export async function GET(request: Request, context: Context) {
  return programFeatureFlagsResponse(request, (await context.params).serviceSlug);
}

export async function POST(request: Request, context: Context) {
  return programFeatureFlagsResponse(request, (await context.params).serviceSlug);
}
