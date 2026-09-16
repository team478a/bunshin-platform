export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { fortuneLifecycleOperationsResponse } =
    await import('../../../../../src/http/fortune-lifecycle-operations');
  return fortuneLifecycleOperationsResponse(request);
}

export const GET = POST;
