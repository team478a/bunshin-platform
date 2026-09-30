export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { trainingEnrollmentExpiryPreviewResponse } =
    await import('../../../../../src/http/ai-training-enrollment-expiry-preview');
  return trainingEnrollmentExpiryPreviewResponse(request);
}
