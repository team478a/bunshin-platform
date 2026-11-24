import type { PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export async function saveImportedBrowserMaterial(
  prisma: PrismaClient,
  actor: { workspaceId: string; actorId: string },
  device: 'desktop' | 'mobile',
  material: {
    title: string;
    goal: string;
    importDigest: string;
    steps: {
      stepId: string;
      ordinal: number;
      instruction: string;
      afterImage: Uint8Array | null;
    }[];
  },
) {
  if (process.env['APP_ENV'] !== 'development')
    throw new ApplicationError('NOT_FOUND', 'recording unavailable');
  return prisma.$transaction(async (tx) => {
    const member = await tx.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM workspace_memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ${actor.workspaceId}::uuid AND m.user_id = ${actor.actorId}::uuid
        AND m.status::text = 'ACTIVE' AND w.status::text = 'ACTIVE' AND u.status::text = 'ACTIVE'
      FOR UPDATE OF m FOR SHARE OF w, u`;
    if (member.length !== 1) throw new ApplicationError('NOT_FOUND', 'recording unavailable');
    const { importDigest, title, goal, steps } = material;
    const key = {
      workspaceId: actor.workspaceId,
      importedBy: actor.actorId,
      fixtureDevice: device,
      importDigest,
    };
    const existing = await tx.browserFixtureMaterial.findUnique({
      where: { workspaceId_importedBy_fixtureDevice_importDigest: key },
      select: { id: true },
    });
    if (existing) return existing;
    return tx.browserFixtureMaterial.create({
      data: {
        ...key,
        title,
        goal,
        revision: 1,
        importedAt: new Date(),
        preparation: '記録と同じブラウザの画面を開く。',
        practice: '練習用のデータで、記録された操作を試す。',
        checkpoint: '操作後に表示された内容を確認する。',
        steps: {
          create: steps.map(({ afterImage, ...step }) => ({
            ...step,
            afterImage: afterImage ? new Uint8Array(afterImage) : null,
          })),
        },
      },
      select: { id: true },
    });
  });
}
