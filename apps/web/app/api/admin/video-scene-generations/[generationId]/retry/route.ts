import { retryVideoSceneGenerationResponse } from '../../../../../../src/http/video-scene-generation-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ generationId: string }> },
) {
  return retryVideoSceneGenerationResponse(request, (await context.params).generationId);
}
