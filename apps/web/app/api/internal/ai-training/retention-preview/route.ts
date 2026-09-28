export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { trainingRetentionPreviewResponse } =
    await import('../../../../../src/http/ai-training-retention-preview');
  return trainingRetentionPreviewResponse(request);
}
