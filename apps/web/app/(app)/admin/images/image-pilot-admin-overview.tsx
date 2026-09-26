import Link from 'next/link';
import type { buildImagePilotReadiness } from './readiness-view-model';

type GroupOption = {
  id: string;
  name: string;
  workspace: { name: string };
};

type Readiness = ReturnType<typeof buildImagePilotReadiness>;

export function ImagePilotGroupSelector({
  groups,
  selectedGroupId,
}: {
  groups: GroupOption[];
  selectedGroupId?: string | undefined;
}) {
  return (
    <section className="settings-card">
      <h2>試すグループ</h2>
      {groups.length ? (
        <form method="get">
          <select name="groupId" defaultValue={selectedGroupId}>
            {groups.map((group) => (
              <option value={group.id} key={group.id}>
                {group.workspace.name}／{group.name}
              </option>
            ))}
          </select>{' '}
          <button type="submit">表示する</button>
        </form>
      ) : (
        <p>
          画像生成を許可したグループがありません。先に{' '}
          <Link href="/admin/groups">グループ管理</Link>で利用機能を設定してください。
        </p>
      )}
    </section>
  );
}

export function ImagePilotStatus({
  groupId,
  pilotVersion,
  state,
  label,
  remainingChecks,
  preflightReady,
  preflightUsed,
  enrolledCount,
  total,
  readyCount,
  failedCount,
  costUsd,
}: {
  groupId: string;
  pilotVersion: number | null;
  state: string;
  label: string;
  remainingChecks: number;
  preflightReady: boolean;
  preflightUsed: boolean;
  enrolledCount: number;
  total: number;
  readyCount: number;
  failedCount: number;
  costUsd: string;
}) {
  return (
    <section className="settings-card">
      <h2>現在の状態</h2>
      <p>
        設定：{pilotVersion ? `第${pilotVersion}版` : '未設定'} ／ 運転：<strong>{label}</strong>
      </p>
      {state === 'PREPARING' ? (
        <>
          <p>人による開始前確認があと{remainingChecks}件必要です。</p>
          {preflightReady ? (
            <p>選択した参加者は、スマートフォン確認のための投稿画像を1件だけ作成できます。</p>
          ) : preflightUsed ? (
            <p>確認用の生成は実施済みです。結果を確認して残りの項目を記録してください。</p>
          ) : (
            <p>予算と画像の保存期間を確認すると、確認用の画像を1件だけ作成できます。</p>
          )}
        </>
      ) : null}
      <p>
        参加者：{enrolledCount}人 ／ 生成受付：{total}件 ／ 完成：{readyCount}件 ／ 失敗：
        {failedCount}件
      </p>
      <p>記録済みの概算AI原価：${costUsd}</p>
      <p>
        <Link href={`/groups/${groupId}/image-operations`}>グループ向け利用レポートを見る</Link>
      </p>
    </section>
  );
}

export function ImagePilotReadiness({ readiness }: { readiness: Readiness }) {
  return (
    <section className="settings-card">
      <h2>開始前の自動確認</h2>
      <p>
        判定：
        <strong className={readiness.ready ? 'status-success' : 'status-warning'}>
          {readiness.ready
            ? '自動確認は完了しています'
            : `${readiness.blockerCount}件の対応が必要です`}
        </strong>
      </p>
      <p>
        この確認だけでは本番開始になりません。スマートフォン確認、予算、評価担当者、保持期間は人が確認して記録します。
      </p>
      <ul className="admin-check-list">
        {readiness.items.map((item) => (
          <li key={item.key}>
            <strong>{item.ready ? '完了' : '要対応'}：</strong> {item.label}
            <br />
            {item.detail} {!item.ready ? <Link href={item.href}>{item.actionLabel}</Link> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
