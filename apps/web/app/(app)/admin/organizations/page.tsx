import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
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
      groups: {
        select: {
          id: true,
          name: true,
          status: true,
          serviceConfiguration: { select: { slug: true, displayName: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>運営団体とプロジェクトの構造</h1>
        <p>
          ワタシワークス全体はシステムだけを管理し、各プロジェクトは必ず運営団体の中に置きます。
        </p>
      </header>
      {query.error === 'invalid' ? (
        <p className="notice notice--danger">団体名を1〜120文字で入力してください。</p>
      ) : null}
      <section className="settings-card">
        <h2>最初の設定の順番</h2>
        <ol>
          <li>この画面で、運営する会社・団体の名前を登録します。</li>
          <li>
            作成後の「団体情報・運営者を設定する」で、担当者・連絡先を登録し、運営者を招待します。
          </li>
          <li>
            運営団体の中にプロジェクトを作成し、参加者、使える機能、公式情報、LINEを設定します。
          </li>
          <li>
            公開名・専用URL・ブランドが必要な場合は、最後にプロジェクトの「公開設定」を行います。
          </li>
        </ol>
      </section>
      <section className="settings-card">
        <h2>新しい運営団体を作る</h2>
        <p>
          作成した人は、この団体の所有者として追加されます。作成後に団体情報を編集し、クライアント側の運営者を招待できます。
        </p>
        <form className="form-stack" action={createOrganization}>
          <label className="field">
            <span className="field__label">団体名</span>
            <input
              className="field__control"
              name="name"
              required
              maxLength={120}
              placeholder="例：運営団体ワタシワークス"
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
          <div className="settings-stack">
            {organizations.map((organization) => (
              <section key={organization.id} className="service-template-preview">
                <div className="management-section__heading">
                  <div>
                    <p className="management-section__eyebrow">運営団体</p>
                    <h3>{organization.name}</h3>
                  </div>
                  <span>{organization.groups.length}プロジェクト</span>
                </div>
                <p>状態：{organization.status}</p>
                <div className="button-row">
                  <Link
                    className="button button--secondary"
                    href={`/organizations/${organization.id}/manage`}
                  >
                    団体情報・運営者
                  </Link>
                  <Link
                    className="button button--secondary"
                    href={`/admin/organizations/${organization.id}/limits`}
                  >
                    契約・利用上限
                  </Link>
                  <Link
                    className="button button--secondary"
                    href={`/admin/organizations/${organization.id}/commercial`}
                  >
                    利用人数・料金
                  </Link>
                  <Link className="button" href={`/admin/groups?workspaceId=${organization.id}`}>
                    この団体にプロジェクトを作る
                  </Link>
                </div>
                <h4>所属するプロジェクト</h4>
                {organization.groups.length === 0 ? (
                  <p>まだプロジェクトはありません。</p>
                ) : (
                  <ul className="organization-group-list">
                    {organization.groups.map((project) => (
                      <li key={project.id}>
                        <div>
                          <strong>
                            {project.serviceConfiguration?.displayName ?? project.name}
                          </strong>
                          <span>状態：{project.status}</span>
                        </div>
                        <div className="button-row">
                          {project.serviceConfiguration ? (
                            <Link
                              className="button button--secondary"
                              href={`/admin/services?workspaceId=${organization.id}`}
                            >
                              公開設定を確認
                            </Link>
                          ) : (
                            <Link
                              className="button button--secondary"
                              href={`/admin/services?workspaceId=${organization.id}&groupId=${project.id}`}
                            >
                              公開設定を追加
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
