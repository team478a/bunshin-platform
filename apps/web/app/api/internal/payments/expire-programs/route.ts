export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { programPaymentLifecycleResponse } =
    await import('../../../../../src/http/program-payment-lifecycle');
  return programPaymentLifecycleResponse(request);
}

export const GET = POST;
