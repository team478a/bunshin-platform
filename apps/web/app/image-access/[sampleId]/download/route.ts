import { readImageSample } from '../../../../src/http/social-image-samples';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sampleId: string }> },
) {
  return readImageSample((await params).sampleId, true);
}
