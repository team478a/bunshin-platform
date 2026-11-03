import { hassyRoadmapPolicyResponse } from '../../../../../src/http/hassy-roadmap-policy';
type Context = { params: Promise<{ serviceSlug: string }> };
export async function GET(request: Request, { params }: Context) {
  return hassyRoadmapPolicyResponse(request, (await params).serviceSlug);
}
export async function PUT(request: Request, { params }: Context) {
  return hassyRoadmapPolicyResponse(request, (await params).serviceSlug);
}
