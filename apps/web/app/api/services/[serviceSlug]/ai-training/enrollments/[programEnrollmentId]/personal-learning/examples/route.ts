import { personalLearningSavedExamplesResponse } from '../../../../../../../../../src/http/personal-learning-saved-examples';

type Context = { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> };

async function handle(request: Request, context: Context) {
  const { serviceSlug, programEnrollmentId } = await context.params;
  return personalLearningSavedExamplesResponse(request, serviceSlug, programEnrollmentId);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
