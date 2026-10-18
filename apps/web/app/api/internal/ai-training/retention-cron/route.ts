export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const { trainingRetentionCronResponse } =
    await import('../../../../../src/http/ai-training-retention-cron');
  return trainingRetentionCronResponse(request);
}
