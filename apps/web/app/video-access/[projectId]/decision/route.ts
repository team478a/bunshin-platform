import { recordVideoReviewDecision } from '../../../../src/http/video-line-access';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return recordVideoReviewDecision(request, (await params).projectId);
}
