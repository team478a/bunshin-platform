import {
  generateMissionContentVariantResponse,
  listMissionContentVariantsResponse,
} from '../../../../../../../../../src/http/daily-missions';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { workspaceId, bunshinId, dailyMissionId } = await params;
  return listMissionContentVariantsResponse(request, workspaceId, bunshinId, dailyMissionId);
}

export async function POST(request: Request, { params }: Context) {
  const { workspaceId, bunshinId, dailyMissionId } = await params;
  return generateMissionContentVariantResponse(request, workspaceId, bunshinId, dailyMissionId);
}
