import { ListLineConfigurations } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  currentLineEnvironment,
  lineEndpointUrls,
} from '../../../../src/line/secure-configuration';
import { LineConfigurationEditor } from './line-configuration-editor';

export const dynamic = 'force-dynamic';

export default async function LineConfigurationPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentLineEnvironment();
    const configurations = await new ListLineConfigurations(
      new db.PrismaLineConfigurationRepository(),
    ).execute(user.userId, environment);
    return (
      <main>
        <h1>LINE設定管理</h1>
        <p>対象環境: {environment}</p>
        <p>秘密値は保存後に再表示されません。Production変更には理由が必要です。</p>
        <LineConfigurationEditor
          environment={environment}
          urls={lineEndpointUrls()}
          initialConfigurations={configurations.map((value) => ({
            ...value,
            lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
            createdAt: value.createdAt.toISOString(),
            updatedAt: value.updatedAt.toISOString(),
          }))}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
