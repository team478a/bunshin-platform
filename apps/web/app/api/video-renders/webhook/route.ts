import { videoRenderWebhookResponse } from '../../../../src/http/video-render-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return videoRenderWebhookResponse(request);
}
