import { adoptProgramResponse } from '../../../../../src/http/programs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return adoptProgramResponse(request, (await params).serviceSlug);
}
