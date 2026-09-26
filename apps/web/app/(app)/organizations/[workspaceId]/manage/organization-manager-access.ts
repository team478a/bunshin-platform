import { notFound } from 'next/navigation';

export async function requireOrganizationManager(workspaceId: string, userId: string) {
  const db = await import('@bunshin/database');
  const [platformAdmin, membership] = await Promise.all([
    new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(userId),
    db.prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  if (!platformAdmin && !membership) notFound();
  return db;
}
