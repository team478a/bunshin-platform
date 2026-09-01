export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { serviceCreditExpirationResponse } =
    await import('../../../../../src/http/service-credit-expiration');
  return serviceCreditExpirationResponse(request);
}

export const GET = POST;
