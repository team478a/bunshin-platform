export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { fortuneGenerationRecoveryResponse } =
    await import('../../../../../src/http/fortune-generation-recovery');
  return fortuneGenerationRecoveryResponse(request);
}

export const GET = POST;
