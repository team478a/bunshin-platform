import { personalLearningParticipantAdminResponse } from '../../../../../../src/http/personal-learning-participant-admin';
export const runtime = 'nodejs';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, context: Context) {
  return personalLearningParticipantAdminResponse(request, (await context.params).serviceSlug);
}
export async function POST(request: Request, context: Context) {
  return personalLearningParticipantAdminResponse(request, (await context.params).serviceSlug);
}
