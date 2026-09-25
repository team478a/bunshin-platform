import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { BunshinEditor } from './editor';
import { loadBunshinPageData } from './bunshin-page-data';
import { buildBunshinEditorProps } from './bunshin-page-view-model';

export const dynamic = 'force-dynamic';

export default async function BunshinPage({
  params,
  searchParams,
}: {
  params: Promise<{ bunshinId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();

  try {
    const data = await loadBunshinPageData({
      workspaceId,
      bunshinId: (await params).bunshinId,
      actorUserId: currentUser.userId,
    });
    const editorProps = buildBunshinEditorProps(workspaceId, data);

    return (
      <>
        <p>
          <Link href={`/bunshins/${data.bunshin.id}/evidence?workspaceId=${workspaceId}`}>
            経験の根拠と広告の安全確認
          </Link>
          {' ／ '}
          <Link href={`/bunshins/${data.bunshin.id}/campaigns?workspaceId=${workspaceId}`}>
            参加できる募集
          </Link>
        </p>
        <BunshinEditor {...editorProps} />
      </>
    );
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')
    )
      notFound();
    throw error;
  }
}
