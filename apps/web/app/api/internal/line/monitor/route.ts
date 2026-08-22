export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  const { lineOperationalMonitorResponse } =
    await import('../../../../../src/http/line-operational-readiness');
  return lineOperationalMonitorResponse(request);
}
