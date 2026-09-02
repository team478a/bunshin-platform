import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

async function createOrganization(formData: FormData) {
  'use server';

  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const input = createOrganizationSchema.safeParse({ name: formData.get('name') });
  if (!input.success) redirect('/admin/organizations?error=invalid');

  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();

  const organization = await db.prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name: input.data.name, type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true },
    });
    await tx.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.userId,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    return workspace;
  });

  revalidatePath('/admin/organizations');
  revalidatePath('/admin/groups');
  revalidatePath('/admin/services');
  redirect(`/admin/groups?workspaceId=${organization.id}&createdOrganization=1`);
}

export default async function OrganizationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const organizations = await db.prisma.workspace.findMany({
    where: { type: 'ORGANIZATION' },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { groups: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>運営団体</h1>
        <p>サービスやグループを運営するための団体を作成します。</p>
      </header>
      {query.error === 'invalid' ? (
        <p className="notice notice--danger">団体名を1〜120文字で入力してください。</p>
      ) : null}
      <section className="settings-card">
        <h2>新しい運営団体を作る</h2>
        <p>
          作成した人は、この団体の管理者として追加されます。次にグループ、サービスの順で設定します。
        </p>
        <form className="form-stack" action={createOrganization}>
          <label className="field">
            <span className="field__label">団体名</span>
            <input
              className="field__control"
              name="name"
              required
              maxLength={120}
              placeholder="例：千ノ国プロジェクト"
            />
          </label>
          <button className="button" type="submit">
            運営団体を作成する
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>作成済みの運営団体</h2>
        {organizations.length === 0 ? (
          <p>まだ運営団体はありません。</p>
        ) : (
          <ul>
            {organizations.map((organization) => (
              <li key={organization.id}>
                <strong>{organization.name}</strong> — 状態：{organization.status}／グループ：
                {organization._count.groups}件
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
