import 'server-only';
import { getServiceMemberReadResponse } from './service-member-read';
import { memberRoadmapDto, readServiceMemberGrowth } from './service-member-roadmap';
import { memberUsageDto } from './service-member-usage';

export function getServiceMemberGrowthResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return getServiceMemberReadResponse(request, serviceSlug, bunshinId, async (input, service) => {
    const { roadmap, usage } = await readServiceMemberGrowth(input, service);
    return {
      version: 'member-growth-api-v1' as const,
      roadmap: memberRoadmapDto(roadmap),
      usage: memberUsageDto(usage),
    };
  });
}
