import type { PointSettingsQuery } from './points-page-types';

export function PointSettingsNotices({ query }: { query: PointSettingsQuery }) {
  return (
    <>
      {query.saved ? <p className="notice notice--success">ポイント設定を保存しました。</p> : null}
      {query.campaignRules ? (
        <p className="notice notice--success">募集ごとのポイント設定を保存しました。</p>
      ) : null}
      {query.bonus ? (
        <p className="notice notice--success">ボーナスポイントを付与しました。</p>
      ) : null}
      {query.corrected ? (
        <p className="notice notice--success">誤付与ポイントの回収を記録しました。</p>
      ) : null}
      {query.recoveryCancelled ? (
        <p className="notice notice--success">誤付与ポイントの回収を取り消しました。</p>
      ) : null}
      {query.rewards ? (
        <p className="notice notice--success">ポイントの使い道を保存しました。</p>
      ) : null}
      {query.pilotPeriod ? (
        <p className="notice notice--success">今日から4週間の試験期間を設定しました。</p>
      ) : null}
      {query.control === 'stop' ? (
        <p className="notice notice--success">ポイント付与を一括停止しました。</p>
      ) : null}
      {query.control === 'resume' ? (
        <p className="notice notice--success">ポイント付与を再開しました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          {query.error === 'recovery-cancellation'
            ? '回収を取り消せませんでした。すでに取り消されていないか確認してください。'
            : query.error === 'pilot-period'
              ? '4週間の試験期間を設定できませんでした。システム管理者の権限を確認してください。'
              : query.error === 'recovery'
                ? '回収を記録できませんでした。画面を更新し、入力内容を確認してください。'
                : query.error === 'budget'
                  ? '発行上限は、すでに発行したポイント以上にしてください。'
                  : query.error === 'campaign-budget'
                    ? '募集の発行上限は、すでに発行したポイント以上にしてください。'
                    : query.error === 'campaign-rules'
                      ? '募集ごとのポイント設定を保存できませんでした。募集の期間と入力内容を確認してください。'
                      : query.error === 'stopped'
                        ? 'ポイント付与は一括停止中です。再開してからボーナスを付与してください。'
                        : query.error === 'rewards'
                          ? 'ポイントの使い道を保存できませんでした。入力内容を確認してください。'
                          : '保存できませんでした。入力内容を確認してください。'}
        </p>
      ) : null}
    </>
  );
}
