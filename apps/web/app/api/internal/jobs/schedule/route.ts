export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { missionSchedulerResponse } = await import('../../../../../src/http/mission-scheduler');
  return missionSchedulerResponse(request);
}
