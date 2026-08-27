import { retryVideoRenderResponse } from '../../../../../../src/http/video-render-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ renderId: string }> }) {
  return retryVideoRenderResponse(request, (await context.params).renderId);
}
