export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  const { aiProviderCostMonitorResponse } =
    await import('../../../../../src/http/ai-provider-cost-monitor');
  return aiProviderCostMonitorResponse(request);
}
