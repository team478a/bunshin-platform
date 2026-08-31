import { aiCharactersResponse } from '../../../../../src/http/ai-characters';
export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await context.params;
  return aiCharactersResponse(request, serviceSlug);
}
