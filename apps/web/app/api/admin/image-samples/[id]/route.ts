import { readImageSample, deleteImageSample } from '../../../../../src/http/social-image-samples';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return readImageSample(
    (await context.params).id,
    new URL(request.url).searchParams.get('download') === '1',
  );
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return deleteImageSample(request, (await context.params).id);
}
