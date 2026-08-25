import { revokeEvidenceResponse } from '../../../../../../../../../src/http/advertising-safety';

export function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; bunshinId: string; evidenceId: string }> },
) {
  return params.then(({ workspaceId, bunshinId, evidenceId }) =>
    revokeEvidenceResponse(request, workspaceId, bunshinId, evidenceId),
  );
}
