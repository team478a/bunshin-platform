export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { badgeRewardWorkerResponse } = await import('../../../../../src/http/badge-reward-worker');
  return badgeRewardWorkerResponse(request);
}

export const GET = POST;
