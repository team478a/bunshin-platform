export type RewardsAction = 'VIEWED' | 'POSTED';

export function RewardsActionFeedback({
  action,
  workspaceId,
  serviceSlug,
}: {
  action: RewardsAction | null;
  workspaceId: string;
  serviceSlug?: string;
}) {
  if (!action) return null;
  return (
    <div className="notice notice--success" role="status" aria-live="polite">
      <strong>ポイント対象として記録しました。</strong>
      <p>
        {action === 'POSTED' ? '投稿完了' : '今日の企画確認'}
        のポイントは通常1分以内に反映されます。1日1回までのため、今日すでに受け取っている場合は増えません。
      </p>
      <a
        href={`/points?workspaceId=${encodeURIComponent(workspaceId)}${serviceSlug ? `&serviceSlug=${encodeURIComponent(serviceSlug)}` : ''}`}
      >
        ポイントを見る
      </a>
    </div>
  );
}
