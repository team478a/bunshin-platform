import { downloadVideoView } from '../../../../src/http/video-line-access';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return downloadVideoView((await params).projectId);
}
