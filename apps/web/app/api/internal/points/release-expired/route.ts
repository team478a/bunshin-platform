export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { pointRedemptionOperationsResponse } =
    await import('../../../../../src/http/point-redemption-operations');
  return pointRedemptionOperationsResponse(request);
}

export const GET = POST;
