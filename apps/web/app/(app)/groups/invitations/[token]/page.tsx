import { GroupParticipationService } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { groupInvitationTokenHash } from '../../../../../src/http/group-invitations';
import { ensureUserWorkspaceLineConnection } from '../../../../../src/line/ensure-user-workspace-connection';
import { recordAuthenticatedRegistrationEvent } from '../../../../../src/registration/funnel';

export const dynamic = 'force-dynamic';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const actionSchema = z.object({
  workspaceId: z.uuid(),
  token: tokenSchema,
  serviceSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

async function invitationReturnPath(
  workspaceId: string,
  token: string,
  serviceSlug?: string,
): Promise<{ accepted: Route; declined: Route } | null> {
  if (!serviceSlug) return null;
  const db = await import('@bunshin/database');
  const service = await db.prisma.serviceConfiguration.findFirst({
    where: {
      workspaceId,
      slug: serviceSlug,
      group: {
        status: 'ACTIVE',
        invitations: {
          some: { tokenHash: groupInvitationTokenHash(token), status: 'ACTIVE' },
        },
      },
    },
    select: { slug: true },
  });
  return service
    ? {
        accepted: `/s/${service.slug}/home` as Route,
        declined: `/s/${service.slug}` as Route,
      }
    : null;
}

async function acceptInvitation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const serviceReturn = await invitationReturnPath(
    input.data.workspaceId,
    input.data.token,
    input.data.serviceSlug,
  );
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
    redirect(serviceReturn?.declined ?? '/groups?error=invitation');
  }
  await ensureUserWorkspaceLineConnection(actor.userId, input.data.workspaceId);
  await recordAuthenticatedRegistrationEvent({
    eventType: 'GROUP_JOINED',
    userId: actor.userId,
    keySuffix: `${input.data.workspaceId}:${groupInvitationTokenHash(input.data.token)}`,
    source: 'GROUP_INVITATION',
    metadata: { workspaceId: input.data.workspaceId },
  });
  redirect(serviceReturn?.accepted ?? '/groups?joined=1');
}

async function declineInvitation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const serviceReturn = await invitationReturnPath(
    input.data.workspaceId,
    input.data.token,
    input.data.serviceSlug,
  );
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
    redirect(serviceReturn?.declined ?? '/groups?error=invitation');
  }
  redirect(serviceReturn?.declined ?? '/groups?declined=1');
}

const roleLabel = { MANAGER: 'グループ管理者', PARTICIPANT: '参加者' } as const;

export default async function GroupInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return InvitationContent({ token: (await params).token });
}

export async function InvitationContent({
  token: tokenValue,
  serviceSlug,
}: {
  token: string;
  serviceSlug?: string;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  const token = tokenSchema.safeParse(tokenValue);
  if (!token.success) notFound();
  const returnTo = serviceSlug
    ? `/s/${serviceSlug}/join/${token.data}`
    : `/groups/invitations/${token.data}`;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const invitation = await db.prisma.groupInvitation.findFirst({
    where: {
      tokenHash: groupInvitationTokenHash(token.data),
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        ...(serviceSlug ? { serviceConfiguration: { slug: serviceSlug } } : {}),
      },
    },
    select: {
      workspaceId: true,
      role: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      group: {
        select: {
          name: true,
          workspace: { select: { name: true } },
          serviceConfiguration: { select: { slug: true, displayName: true, operatorName: true } },
        },
      },
    },
  });
  if (!invitation || invitation.usedCount >= invitation.maxUses) notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">{serviceSlug ? 'サービスへの招待' : 'グループへの招待'}</p>
        <h1>{invitation.group.serviceConfiguration?.displayName ?? invitation.group.name}</h1>
        <p>
          {invitation.group.serviceConfiguration?.operatorName ?? invitation.group.workspace.name}
          から招待されています。
        </p>
      </header>
      <section className="settings-card">
        <h2>参加する前に確認してください</h2>
        <p>
          あなたの役割：
          {serviceSlug && invitation.role === 'MANAGER'
            ? 'サービス管理者'
            : roleLabel[invitation.role]}
        </p>
        <p>有効期限：{invitation.expiresAt.toLocaleString('ja-JP')}</p>
        <p>
          参加すると、このサービスで許可された商品・企画・機能を利用できます。あなた個人の通常投稿、知識、記憶はサービス管理者へ公開されません。
        </p>
        <form className="form-stack" action={acceptInvitation}>
          <input type="hidden" name="workspaceId" value={invitation.workspaceId} />
          <input type="hidden" name="token" value={token.data} />
          {serviceSlug && <input type="hidden" name="serviceSlug" value={serviceSlug} />}
          <label>
            <input type="checkbox" required /> 内容を確認し、サービスへの参加に同意します
          </label>
          <button className="button" type="submit">
            同意して参加する
          </button>
        </form>
        <form action={declineInvitation}>
          <input type="hidden" name="workspaceId" value={invitation.workspaceId} />
          <input type="hidden" name="token" value={token.data} />
          {serviceSlug && <input type="hidden" name="serviceSlug" value={serviceSlug} />}
          <button className="button button--secondary" type="submit">
            今回は参加しない
          </button>
        </form>
        {serviceSlug ? (
          <a href={`/s/${serviceSlug}`}>あとで確認する</a>
        ) : (
          <Link href="/groups">あとで確認する</Link>
        )}
      </section>
    </main>
  );
}
