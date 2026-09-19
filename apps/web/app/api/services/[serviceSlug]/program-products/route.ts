import { configureProgramProductResponse } from '../../../../../src/http/program-products';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return configureProgramProductResponse(request, (await params).serviceSlug);
}
