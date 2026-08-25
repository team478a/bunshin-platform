import { revokeProductPackAssignmentResponse } from '../../../../../../../src/http/product-packs';
export function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; assignmentId: string }> },
) {
  return params.then(({ workspaceId, assignmentId }) =>
    revokeProductPackAssignmentResponse(request, workspaceId, assignmentId),
  );
}
