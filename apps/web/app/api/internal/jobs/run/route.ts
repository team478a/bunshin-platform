export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Group knowledge extraction includes bounded PDF / video provider calls.
// This matches the worker lease and prevents the HTTP runtime from ending first.
export const maxDuration = 300;

export async function POST(request: Request) {
  const { jobWorkerResponse } = await import('../../../../../src/http/job-worker');
  return jobWorkerResponse(request);
}

export const GET = POST;
