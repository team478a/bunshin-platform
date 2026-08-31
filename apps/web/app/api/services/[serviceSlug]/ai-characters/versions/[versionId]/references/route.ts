import { uploadAiCharacterReferenceResponse } from '../../../../../../../../src/http/ai-character-references';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; versionId: string }> },
) {
  const { serviceSlug, versionId } = await context.params;
  return uploadAiCharacterReferenceResponse(request, serviceSlug, versionId);
}
