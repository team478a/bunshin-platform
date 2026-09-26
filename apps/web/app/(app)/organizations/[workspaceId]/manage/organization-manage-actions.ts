'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { requireOrganizationManager } from './organization-manager-access';

const profileSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().max(320).or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  websiteUrl: z.string().trim().url().max(2048).or(z.literal('')).optional(),
  address: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(5).max(1000),
});
const invitationSchema = z.object({
  workspaceId: z.uuid(),
  role: z.enum(['ADMIN', 'MEMBER']),
  inviteeEmail: z.string().trim().email().max(320),
});
const invitationActionSchema = z.object({
  workspaceId: z.uuid(),
  invitationId: z.uuid(),
});
const groupSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});

const emptyToNull = (value: string | undefined) => (value ? value : null);
const invitationLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
async function sendInvitationEmail(input: {
  email: string;
  organizationName: string;
  invitationUrl: string;
  role: 'ADMIN' | 'MEMBER';
}) {
  const { getServerEnvironment } = await import('@bunshin/config');
  const environment = getServerEnvironment();
  if (!environment.RESEND_ADMIN_ALERT_API_KEY || !environment.RESEND_ADMIN_ALERT_FROM)
    return 'manual' as const;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
    headers: {
      authorization: `Bearer ${environment.RESEND_ADMIN_ALERT_API_KEY}`,
      'content-type': 'application/json',
      'user-agent': 'watashi-works-organization-invitations/1.0',
    },
    body: JSON.stringify({
      from: environment.RESEND_ADMIN_ALERT_FROM,
      to: [input.email],
      subject: `【ワタシワークス】${input.organizationName}への招待`,
      text: [
        `${input.organizationName}の${input.role === 'ADMIN' ? '運営管理者' : '参加者'}として招待されています。`,
        '',
        '次のリンクを開き、ログイン後に「参加する」を押してください。',
        input.invitationUrl,
        '',
        'このリンクは7日間・1回だけ有効です。心当たりがない場合は、このメールを削除してください。',
      ].join('\n'),
    }),
  });
  return response.ok ? ('sent' as const) : ('manual' as const);
}
export async function saveProfile(formData: FormData) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = profileSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  await db.prisma.workspace.update({
    where: { id: input.data.workspaceId, type: 'ORGANIZATION' },
    data: {
      name: input.data.name,
      legalName: emptyToNull(input.data.legalName),
      description: emptyToNull(input.data.description),
      contactName: emptyToNull(input.data.contactName),
      contactEmail: emptyToNull(input.data.contactEmail),
      contactPhone: emptyToNull(input.data.contactPhone),
      websiteUrl: emptyToNull(input.data.websiteUrl),
      address: emptyToNull(input.data.address),
    },
  });
  revalidatePath(`/organizations/${input.data.workspaceId}/manage`);
  revalidatePath('/admin/organizations');
  redirect(`/organizations/${input.data.workspaceId}/manage?saved=profile`);
}

export async function createOperatorInvitation(formData: FormData) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  const organization = await db.prisma.workspace.findFirst({
    where: { id: input.data.workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
    select: { id: true, name: true, organizationEntitlement: true },
  });
  if (!organization) notFound();
  const now = new Date();
  const entitlement = organization.organizationEntitlement;
  if (
    entitlement?.suspended ||
    (entitlement?.startsAt && entitlement.startsAt > now) ||
    (entitlement?.endsAt && entitlement.endsAt <= now)
  )
    redirect(`/organizations/${organization.id}/manage?error=organization-suspended`);
  if (input.data.role === 'ADMIN' && entitlement?.maxOperators) {
    const [operatorCount, pendingCount] = await Promise.all([
      db.prisma.workspaceMembership.count({
        where: {
          workspaceId: organization.id,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
        },
      }),
      db.prisma.workspaceInvitation.count({
        where: {
          workspaceId: organization.id,
          role: 'ADMIN',
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
      }),
    ]);
    if (operatorCount + pendingCount >= entitlement.maxOperators)
      redirect(`/organizations/${organization.id}/manage?error=operator-limit`);
  }
  const token = randomBytes(32).toString('base64url');
  const invitation = await db.prisma.workspaceInvitation.create({
    data: {
      workspaceId: organization.id,
      inviteeEmail: input.data.inviteeEmail,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      role: input.data.role,
      expiresAt: new Date(Date.now() + invitationLifetimeMilliseconds),
      maxUses: 1,
      createdByUserId: user.userId,
    },
  });
  const { getServerEnvironment } = await import('@bunshin/config');
  const invitationUrl = new URL(
    `/organizations/invitations/${token}`,
    getServerEnvironment().APP_URL,
  ).toString();
  const delivery = await sendInvitationEmail({
    email: input.data.inviteeEmail,
    organizationName: organization.name,
    invitationUrl,
    role: input.data.role,
  });
  if (delivery === 'sent')
    await db.prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { lastSentAt: new Date() },
    });
  redirect(
    `/organizations/${input.data.workspaceId}/manage?invitation=${encodeURIComponent(invitationUrl)}&delivery=${delivery}`,
  );
}

export async function revokeOperatorInvitation(formData: FormData) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = invitationActionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  await db.prisma.workspaceInvitation.updateMany({
    where: { id: input.data.invitationId, workspaceId: input.data.workspaceId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  revalidatePath(`/organizations/${input.data.workspaceId}/manage`);
  redirect(`/organizations/${input.data.workspaceId}/manage?invitationAction=revoked`);
}

export async function reissueOperatorInvitation(formData: FormData) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = invitationActionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  const original = await db.prisma.workspaceInvitation.findFirst({
    where: { id: input.data.invitationId, workspaceId: input.data.workspaceId },
    select: { id: true, inviteeEmail: true, role: true, workspace: { select: { name: true } } },
  });
  if (!original || original.inviteeEmail.endsWith('@invitation.local'))
    redirect(`/organizations/${input.data.workspaceId}/manage?invitationAction=manual-link`);
  // 招待で付与できるのは運営管理者または参加者だけです。古いレコードに
  // OWNER が残っていても、再発行時に所有者権限を配布しないようにします。
  const reissuedRole = original.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
  const token = randomBytes(32).toString('base64url');
  const invitation = await db.prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.updateMany({
      where: { id: original.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    return tx.workspaceInvitation.create({
      data: {
        workspaceId: input.data.workspaceId,
        inviteeEmail: original.inviteeEmail,
        tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
        role: reissuedRole,
        expiresAt: new Date(Date.now() + invitationLifetimeMilliseconds),
        maxUses: 1,
        createdByUserId: user.userId,
      },
    });
  });
  const { getServerEnvironment } = await import('@bunshin/config');
  const invitationUrl = new URL(
    `/organizations/invitations/${token}`,
    getServerEnvironment().APP_URL,
  ).toString();
  const delivery = await sendInvitationEmail({
    email: original.inviteeEmail,
    organizationName: original.workspace.name,
    invitationUrl,
    role: reissuedRole,
  });
  if (delivery === 'sent')
    await db.prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { lastSentAt: new Date() },
    });
  redirect(
    `/organizations/${input.data.workspaceId}/manage?invitation=${encodeURIComponent(invitationUrl)}&delivery=${delivery}`,
  );
}

export async function createGroup(formData: FormData) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = groupSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  const group = await new db.PrismaGroupParticipationRepository().createGroup({
    workspaceId: input.data.workspaceId,
    actorUserId: user.userId,
    name: input.data.name,
  });
  if (!group) redirect(`/organizations/${input.data.workspaceId}/manage?error=group-limit`);
  redirect(`/groups/${group.id}/members?serviceSlug=`);
}
