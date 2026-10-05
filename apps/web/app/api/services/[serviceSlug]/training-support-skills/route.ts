import { trainingSupportSkillAdminResponse } from '../../../../../src/http/ai-training-skill-lifecycle-admin';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return trainingSupportSkillAdminResponse(request, (await context.params).serviceSlug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return trainingSupportSkillAdminResponse(request, (await context.params).serviceSlug);
}
