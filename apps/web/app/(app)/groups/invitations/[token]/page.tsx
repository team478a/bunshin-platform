import { GroupParticipationService } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { groupInvitationTokenHash } from '../../../../../src/http/group-invitations';

export const dynamic = 'force-dynamic';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const actionSchema = z.object({ workspaceId: z.uuid(), token: tokenSchema });

async function acceptInvitation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).acceptInvitation({
      workspaceId: input.data.workspaceId,
      actorUserId: actor.userId,
      tokenHash: groupInvitationTokenHash(input.data.token),
    });
  } catch {
    redirect('/groups?error=invitation');
  }
  redirect('/groups?joined=1');
}

async function declineInvitation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).declineInvitation({
      workspaceId: input.data.workspaceId,
      actorUserId: actor.userId,
      tokenHash: groupInvitationTokenHash(input.data.token),
    });
  } catch {
    redirect('/groups?error=invitation');
  }
  redirect('/groups?declined=1');
}

const roleLabel = { MANAGER: 'グループ管理者', PARTICIPANT: '参加者' } as const;

export default async function GroupInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  const token = tokenSchema.safeParse((await params).token);
  if (!token.success) notFound();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/groups/invitations/${token.data}`)}` as Route);
  const db = await import('@bunshin/database');
  const invitation = await db.prisma.groupInvitation.findFirst({
    where: {
      tokenHash: groupInvitationTokenHash(token.data),
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: {
      workspaceId: true,
      role: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      group: { select: { name: true, workspace: { select: { name: true } } } },
    },
  });
  if (!invitation || invitation.usedCount >= invitation.maxUses) notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループへの招待</p>
        <h1>{invitation.group.name}</h1>
        <p>{invitation.group.workspace.name}から招待されています。</p>
      </header>
      <section className="settings-card">
        <h2>参加する前に確認してください</h2>
        <p>あなたの役割：{roleLabel[invitation.role]}</p>
        <p>有効期限：{invitation.expiresAt.toLocaleString('ja-JP')}</p>
        <p>
          参加すると、グループから許可された商品・企画・機能を利用できます。あなた個人の通常投稿、知識、記憶はグループ管理者へ公開されません。
        </p>
        <form className="form-stack" action={acceptInvitation}>
          <input type="hidden" name="workspaceId" value={invitation.workspaceId} />
          <input type="hidden" name="token" value={token.data} />
          <label>
            <input type="checkbox" required /> 内容を確認し、グループへの参加に同意します
          </label>
          <button className="button" type="submit">
            同意して参加する
          </button>
        </form>
        <form action={declineInvitation}>
          <input type="hidden" name="workspaceId" value={invitation.workspaceId} />
          <input type="hidden" name="token" value={token.data} />
          <button className="button button--secondary" type="submit">
            今回は参加しない
          </button>
        </form>
        <Link href="/groups">あとで確認する</Link>
      </section>
    </main>
  );
}
