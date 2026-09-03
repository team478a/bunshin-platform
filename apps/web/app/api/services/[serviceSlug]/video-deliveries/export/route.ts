import { exportServiceVideoDeliveriesCsvResponse } from '../../../../../../src/http/service-video-deliveries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return exportServiceVideoDeliveriesCsvResponse((await params).serviceSlug);
}
