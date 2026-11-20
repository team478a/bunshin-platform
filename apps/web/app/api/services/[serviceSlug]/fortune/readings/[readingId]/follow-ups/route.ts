import {
  askFortuneFollowUpResponse,
  getFortuneFollowUpsResponse,
} from '../../../../../../../../src/http/fortune';

type Context = { params: Promise<{ serviceSlug: string; readingId: string }> };

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, readingId } = await params;
  return getFortuneFollowUpsResponse(request, serviceSlug, readingId);
}

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, readingId } = await params;
  return askFortuneFollowUpResponse(request, serviceSlug, readingId);
}
