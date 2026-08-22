export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const { jobWorkerResponse } = await import('../../../../../src/http/job-worker');
  return jobWorkerResponse(request);
}
