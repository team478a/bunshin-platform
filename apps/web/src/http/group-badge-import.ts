import { NominateGroupBadgeCandidate } from '@bunshin/application';
import { currentUserProvider } from '../auth/current-user';
import { parseGroupBadgeCsv } from '../badges/group-badge-csv';

export async function importGroupBadgeCsvResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return Response.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
  if (!body || typeof body.csv !== 'string' || body.csv.length > 500_000)
    return Response.json({ error: 'CSVファイルを確認してください。' }, { status: 400 });
  const parsed = parseGroupBadgeCsv(body.csv);
  const db = await import('@bunshin/database');
  const manager = await db.prisma.groupMembership.findFirst({
    where: { workspaceId, groupId, userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!manager) return Response.json({ error: 'この操作は許可されていません。' }, { status: 403 });
  const errors = [...parsed.errors];
  let imported = 0;
  const nominate = new NominateGroupBadgeCandidate(
    new db.PrismaBadgeGroupWorkflowRepository(db.prisma),
  );
  for (const row of parsed.rows) {
    const [member, version] = await Promise.all([
      db.prisma.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          status: 'ACTIVE',
          user: { email: { equals: row.email, mode: 'insensitive' } },
        },
        select: { userId: true },
      }),
      db.prisma.badgeVersion.findFirst({
        where: {
          publishedAt: { not: null },
          definition: { workspaceId, groupId, ownerType: 'GROUP', code: row.badgeCode },
        },
        orderBy: { version: 'desc' },
        select: { id: true },
      }),
    ]);
    if (!member) errors.push({ line: row.line, message: 'このグループの参加者が見つかりません。' });
    else if (!version) errors.push({ line: row.line, message: '使用中のバッジが見つかりません。' });
    else {
      try {
        await nominate.execute({
          workspaceId,
          groupId,
          badgeVersionId: version.id,
          userId: member.userId,
          actorUserId: actor.userId,
          reason: row.reason,
        });
        imported += 1;
      } catch {
        errors.push({ line: row.line, message: '登録できませんでした。内容を確認してください。' });
      }
    }
  }
  return Response.json({ imported, errors });
}
