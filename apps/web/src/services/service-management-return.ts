import type { Route } from 'next';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function serviceManagementReturnPath(input: {
  groupId: string;
  serviceSlug?: string | undefined;
  section: 'members' | 'legal' | 'badges';
  query?: string;
}): Promise<Route> {
  const fallback = `/groups/${input.groupId}/${input.section}${input.query ?? ''}` as Route;
  if (!input.serviceSlug || !slugPattern.test(input.serviceSlug)) return fallback;

  const db = await import('@bunshin/database');
  const service = await db.prisma.serviceConfiguration.findFirst({
    where: {
      groupId: input.groupId,
      slug: input.serviceSlug,
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { slug: true },
  });
  if (!service) return fallback;
  return `/s/${service.slug}/manage/${input.section}${input.query ?? ''}` as Route;
}
