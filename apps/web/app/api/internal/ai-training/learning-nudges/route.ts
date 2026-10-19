export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const { personalLearningNudgesCronResponse } =
    await import('../../../../../src/http/personal-learning-nudges-cron');
  return personalLearningNudgesCronResponse(request);
}
