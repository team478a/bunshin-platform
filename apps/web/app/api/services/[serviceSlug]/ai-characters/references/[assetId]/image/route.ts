import { aiCharacterReferenceImageResponse } from '../../../../../../../../src/http/ai-character-references';
export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; assetId: string }> },
) {
  const { serviceSlug, assetId } = await context.params;
  return aiCharacterReferenceImageResponse(request, serviceSlug, assetId);
}
