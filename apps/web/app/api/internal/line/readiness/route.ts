export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { lineOperationalReadinessResponse } =
    await import('../../../../../src/http/line-operational-readiness');
  return lineOperationalReadinessResponse(request);
}
