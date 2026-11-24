import 'server-only';
import { z } from 'zod';
import { getServerEnvironment } from '@bunshin/config';
import { currentUserProvider } from '../auth/current-user';

export const materialIdSchema = z.uuid();
export const materialImageVariantSchema = z.enum(['before', 'after', 'detail']);

export async function browserMaterialActor(workspaceId: string) {
  if (getServerEnvironment().APP_ENV !== 'development' || !z.uuid().safeParse(workspaceId).success)
    return null;
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) return null;
  const { prisma } = await import('@bunshin/database');
  const membership = await prisma.workspaceMembership.findFirst({
    where: {
      workspaceId,
      userId: user.userId,
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
      workspace: { status: 'ACTIVE' },
    },
    select: { id: true },
  });
  return membership ? { workspaceId, actorId: user.userId } : null;
}

type Actor = NonNullable<Awaited<ReturnType<typeof browserMaterialActor>>>;

function recipeScope(actor: Actor) {
  return {
    ...actor,
    membership: {
      status: 'ACTIVE' as const,
      workspace: { status: 'ACTIVE' as const },
      user: { status: 'ACTIVE' as const },
    },
  };
}

export async function searchBrowserMaterials(actor: Actor, query: string) {
  const { prisma } = await import('@bunshin/database');
  return prisma.browserFixtureMaterial.findMany({
    where: {
      recipe: recipeScope(actor),
      ...(query ? { title: { contains: query, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      title: true,
      goal: true,
      verifiedAt: true,
      recipe: { select: { device: true } },
    },
    orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
  });
}

export async function readBrowserMaterial(actor: Actor, id: string) {
  const { prisma } = await import('@bunshin/database');
  return prisma.browserFixtureMaterial.findFirst({
    where: { id, recipe: recipeScope(actor) },
    select: {
      id: true,
      title: true,
      goal: true,
      preparation: true,
      practice: true,
      checkpoint: true,
      verifiedAt: true,
      recipe: { select: { device: true } },
      steps: {
        orderBy: { ordinal: 'asc' },
        select: { ordinal: true, stepId: true, instruction: true },
      },
    },
  });
}

export async function readBrowserMaterialImage(
  actor: Actor,
  materialId: string,
  ordinal: number,
  variant: z.infer<typeof materialImageVariantSchema>,
) {
  const { prisma } = await import('@bunshin/database');
  const step = await prisma.browserFixtureMaterialStep.findFirst({
    where: { materialId, ordinal, material: { recipe: recipeScope(actor) } },
    select: {
      beforeImage: variant === 'before',
      afterImage: variant === 'after',
      detailImage: variant === 'detail',
    },
  });
  return (
    (variant === 'before'
      ? step?.beforeImage
      : variant === 'after'
        ? step?.afterImage
        : step?.detailImage) ?? null
  );
}

export async function hasBrowserMaterialDetail(actor: Actor, materialId: string, ordinal: number) {
  const { prisma } = await import('@bunshin/database');
  return (
    (await prisma.browserFixtureMaterialStep.findFirst({
      where: {
        materialId,
        ordinal,
        detailImage: { not: null },
        material: { recipe: recipeScope(actor) },
      },
      select: { ordinal: true },
    })) !== null
  );
}
