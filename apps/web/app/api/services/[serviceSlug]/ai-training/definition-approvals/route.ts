import { learningDefinitionApprovalAdminResponse } from '../../../../../../src/http/learning-definition-approval-admin';

async function handle(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await context.params;
  return learningDefinitionApprovalAdminResponse(request, serviceSlug);
}
export const GET = handle;
export const POST = handle;
