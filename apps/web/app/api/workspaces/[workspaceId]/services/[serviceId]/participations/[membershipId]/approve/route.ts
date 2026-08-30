import { approveServiceParticipationResponse } from '../../../../../../../../../src/http/service-participation';

type Context = {
  params: Promise<{ workspaceId: string; serviceId: string; membershipId: string }>;
};

export async function POST(request: Request, context: Context) {
  const { workspaceId, serviceId, membershipId } = await context.params;
  return approveServiceParticipationResponse(request, workspaceId, serviceId, membershipId);
}
