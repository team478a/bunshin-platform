import { createHash, randomBytes } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const uuid = z.uuid();
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
});
const groupSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});

const emptyToNull = (value: string | undefined) => (value ? value : null);

async function requireOrganizationManager(workspaceId: string, userId: string) {
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

async function saveProfile(formData: FormData) {
  'use server';
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

async function createOperatorInvitation(formData: FormData) {
  'use server';
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await requireOrganizationManager(input.data.workspaceId, user.userId);
  const organization = await db.prisma.workspace.findFirst({
    where: { id: input.data.workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!organization) notFound();
  const token = randomBytes(32).toString('base64url');
  await db.prisma.workspaceInvitation.create({
    data: {
      workspaceId: organization.id,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      role: input.data.role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses: 1,
      createdByUserId: user.userId,
    },
  });
  const { getServerEnvironment } = await import('@bunshin/config');
  const invitationUrl = new URL(
    `/organizations/invitations/${token}`,
    getServerEnvironment().APP_URL,
  ).toString();
  redirect(
    `/organizations/${input.data.workspaceId}/manage?invitation=${encodeURIComponent(invitationUrl)}`,
  );
}

async function createGroup(formData: FormData) {
  'use server';
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
  if (!group) notFound();
  redirect(`/groups/${group.id}/members?serviceSlug=`);
}

export default async function OrganizationManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ saved?: string; invitation?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const workspaceId = uuid.safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const db = await requireOrganizationManager(workspaceId.data, user.userId);
  const [organization, query] = await Promise.all([
    db.prisma.workspace.findFirst({
      where: { id: workspaceId.data, type: 'ORGANIZATION' },
      select: {
        id: true,
        name: true,
        legalName: true,
        description: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        websiteUrl: true,
        address: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true, role: true, user: { select: { displayName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        groups: { where: { status: 'ACTIVE' }, select: { id: true, name: true } },
      },
    }),
    searchParams,
  ]);
  if (!organization) notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">運営団体の管理</p>
        <h1>{organization.name}</h1>
        <p>クライアント企業・団体の基本情報、運営者、利用するグループを管理します。</p>
      </header>
      {query.saved === 'profile' ? (
        <p className="notice notice--success">団体情報を保存しました。</p>
      ) : null}
      {query.invitation ? (
        <section className="settings-card">
          <h2>運営者の招待リンクを作成しました</h2>
          <p>7日間・1人だけ有効です。招待する本人へ安全な方法で送ってください。</p>
          <input
            className="field__control"
            value={query.invitation}
            readOnly
            aria-label="運営者招待リンク"
          />
        </section>
      ) : null}
      <section className="settings-card">
        <h2>団体の情報</h2>
        <p>請求・連絡・サービス設定の基準になる情報です。あとからいつでも変更できます。</p>
        <form className="form-stack" action={saveProfile}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">表示する団体名</span>
            <input
              className="field__control"
              name="name"
              defaultValue={organization.name}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">法人名・正式名称（任意）</span>
            <input
              className="field__control"
              name="legalName"
              defaultValue={organization.legalName ?? ''}
              maxLength={200}
            />
          </label>
          <label className="field">
            <span className="field__label">団体の説明（任意）</span>
            <textarea
              className="field__control"
              name="description"
              defaultValue={organization.description ?? ''}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label className="field">
            <span className="field__label">担当者名（任意）</span>
            <input
              className="field__control"
              name="contactName"
              defaultValue={organization.contactName ?? ''}
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">連絡用メールアドレス（任意）</span>
            <input
              className="field__control"
              name="contactEmail"
              type="email"
              defaultValue={organization.contactEmail ?? ''}
              maxLength={320}
            />
          </label>
          <label className="field">
            <span className="field__label">電話番号（任意）</span>
            <input
              className="field__control"
              name="contactPhone"
              defaultValue={organization.contactPhone ?? ''}
              maxLength={40}
            />
          </label>
          <label className="field">
            <span className="field__label">Webサイト（任意）</span>
            <input
              className="field__control"
              name="websiteUrl"
              type="url"
              defaultValue={organization.websiteUrl ?? ''}
              maxLength={2048}
              placeholder="https://example.com"
            />
          </label>
          <label className="field">
            <span className="field__label">所在地（任意）</span>
            <input
              className="field__control"
              name="address"
              defaultValue={organization.address ?? ''}
              maxLength={500}
            />
          </label>
          <label className="field">
            <span className="field__label">変更理由</span>
            <input
              className="field__control"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              placeholder="例：クライアント情報を更新"
            />
          </label>
          <button className="button" type="submit">
            団体情報を保存する
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>運営者を招待する</h2>
        <p>運営管理者は、団体内のグループを作成し、参加者・LINE・利用機能を管理できます。</p>
        <form className="form-stack" action={createOperatorInvitation}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">招待する役割</span>
            <select className="field__control" name="role" defaultValue="ADMIN">
              <option value="ADMIN">運営管理者</option>
              <option value="MEMBER">閲覧・参加者</option>
            </select>
          </label>
          <button className="button" type="submit">
            招待リンクを作る
          </button>
        </form>
        <h3>現在の運営者</h3>
        <ul>
          {organization.memberships.map((member) => (
            <li key={member.id}>
              <strong>{member.user.displayName}</strong>（
              {member.role === 'OWNER'
                ? '団体所有者'
                : member.role === 'ADMIN'
                  ? '運営管理者'
                  : '参加者'}
              ）{member.user.email ? ` — ${member.user.email}` : ''}
            </li>
          ))}
        </ul>
      </section>
      <section className="settings-card">
        <h2>グループを作る</h2>
        <p>
          参加者・商品・LINE・投稿運用をまとめる単位です。作成した人は、そのグループのサービス所有者になります。
        </p>
        <form className="form-stack" action={createGroup}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">グループ名</span>
            <input
              className="field__control"
              name="name"
              required
              maxLength={120}
              placeholder="例：代理店SNS支援"
            />
          </label>
          <button className="button" type="submit">
            グループを作成する
          </button>
        </form>
        {organization.groups.length ? (
          <ul>
            {organization.groups.map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}/members`}>{group.name}を管理する</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>まだグループはありません。</p>
        )}
      </section>
    </main>
  );
}
