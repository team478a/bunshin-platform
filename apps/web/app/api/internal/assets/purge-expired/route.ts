export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { assetLifecycleOperationsResponse } =
    await import('../../../../../src/http/asset-lifecycle-operations');
  return assetLifecycleOperationsResponse(request);
}

export const GET = POST;
