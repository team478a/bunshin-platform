import { createHash } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const actionSchema = z.object({ token: tokenSchema });
const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

async function acceptInvitation(formData: FormData) {
  'use server';
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const db = await import('@bunshin/database');
  const invitation = await db.prisma.$transaction(async (tx) => {
    const found = await tx.workspaceInvitation.findFirst({
      where: { tokenHash: hash(input.data.token), status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { id: true, workspaceId: true, role: true, usedCount: true, maxUses: true },
    });
    if (!found || found.usedCount >= found.maxUses) return null;
    const consumed = await tx.workspaceInvitation.updateMany({
      where: { id: found.id, status: 'ACTIVE', usedCount: found.usedCount },
      data: { usedCount: { increment: 1 }, status: 'EXHAUSTED' },
    });
    if (consumed.count !== 1) return null;
    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: found.workspaceId, userId: user.userId } },
      create: {
        workspaceId: found.workspaceId,
        userId: user.userId,
        role: found.role,
        status: 'ACTIVE',
      },
      update: { role: found.role, status: 'ACTIVE' },
    });
    return found;
  });
  if (!invitation) redirect('/groups?error=invitation');
  redirect(`/organizations/${invitation.workspaceId}/manage?joined=1`);
}

export default async function OrganizationInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = tokenSchema.safeParse((await params).token);
  if (!token.success) notFound();
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user)
    redirect(`/login?returnTo=${encodeURIComponent(`/organizations/invitations/${token.data}`)}`);
  const db = await import('@bunshin/database');
  const invitation = await db.prisma.workspaceInvitation.findFirst({
    where: { tokenHash: hash(token.data), status: 'ACTIVE', expiresAt: { gt: new Date() } },
    select: {
      workspaceId: true,
      role: true,
      expiresAt: true,
      workspace: { select: { name: true } },
    },
  });
  if (!invitation) notFound();
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">運営団体への招待</p>
        <h1>{invitation.workspace.name}</h1>
        <p>運営チームへの参加を依頼されています。</p>
      </header>
      <section className="settings-card">
        <p>招待される役割：{invitation.role === 'ADMIN' ? '運営管理者' : '参加者'}</p>
        <p>有効期限：{invitation.expiresAt.toLocaleString('ja-JP')}</p>
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={token.data} />
          <button className="button" type="submit">
            同意して運営団体に参加する
          </button>
        </form>
      </section>
    </main>
  );
}
