import { createHash } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { ensureUserWorkspaceLineConnection } from '../../../../../src/line/ensure-user-workspace-connection';
import { recordAuthenticatedRegistrationEvent } from '../../../../../src/registration/funnel';

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
  const now = new Date();
  const result = await db.prisma.$transaction(
    async (tx) => {
      const found = await tx.workspaceInvitation.findFirst({
        where: { tokenHash: hash(input.data.token), status: 'ACTIVE', expiresAt: { gt: now } },
        select: {
          id: true,
          workspaceId: true,
          inviteeEmail: true,
          role: true,
          usedCount: true,
          maxUses: true,
          workspace: { select: { status: true, organizationEntitlement: true } },
        },
      });
      if (!found || found.usedCount >= found.maxUses) return { error: 'invitation' } as const;
      const account = await tx.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });
      const manualInvitation = found.inviteeEmail.endsWith('@invitation.local');
      if (
        !manualInvitation &&
        account?.email &&
        account.email.toLowerCase() !== found.inviteeEmail.toLowerCase()
      )
        return { error: 'email-mismatch' } as const;
      const entitlement = found.workspace.organizationEntitlement;
      if (
        found.workspace.status !== 'ACTIVE' ||
        entitlement?.suspended ||
        (entitlement?.startsAt && entitlement.startsAt > now) ||
        (entitlement?.endsAt && entitlement.endsAt <= now)
      )
        return { error: 'organization-suspended' } as const;

      const currentMembership = await tx.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: found.workspaceId, userId: user.userId },
        },
        select: { role: true, status: true },
      });
      const grantedRole = found.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
      const addsOperator =
        grantedRole === 'ADMIN' &&
        !(
          currentMembership?.status === 'ACTIVE' &&
          (currentMembership.role === 'OWNER' || currentMembership.role === 'ADMIN')
        );
      if (addsOperator && entitlement?.maxOperators) {
        const operators = await tx.workspaceMembership.count({
          where: {
            workspaceId: found.workspaceId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
          },
        });
        if (operators >= entitlement.maxOperators) return { error: 'operator-limit' } as const;
      }

      const consumed = await tx.workspaceInvitation.updateMany({
        where: { id: found.id, status: 'ACTIVE', usedCount: found.usedCount },
        data: {
          usedCount: { increment: 1 },
          status: found.usedCount + 1 >= found.maxUses ? 'EXHAUSTED' : 'ACTIVE',
          acceptedAt: now,
        },
      });
      if (consumed.count !== 1) return { error: 'invitation' } as const;
      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: found.workspaceId, userId: user.userId } },
        create: {
          workspaceId: found.workspaceId,
          userId: user.userId,
          role: grantedRole,
          status: 'ACTIVE',
        },
        update: { role: grantedRole, status: 'ACTIVE' },
      });
      return { workspaceId: found.workspaceId } as const;
    },
    { isolationLevel: 'Serializable' },
  );
  if ('error' in result) redirect(`/groups?error=${result.error}`);
  await ensureUserWorkspaceLineConnection(user.userId, result.workspaceId);
  await recordAuthenticatedRegistrationEvent({
    eventType: 'ORGANIZATION_JOINED',
    userId: user.userId,
    keySuffix: result.workspaceId,
    source: 'ORGANIZATION_INVITATION',
    metadata: { workspaceId: result.workspaceId },
  });
  redirect(`/organizations/${result.workspaceId}/manage?joined=1`);
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
